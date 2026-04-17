package app.keryx.bridge

import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import app.keryx.bridge.network.RelayClient
import app.keryx.bridge.parser.BridgeParser
import app.keryx.bridge.parser.NotificationBundleExtractor
import app.keryx.bridge.util.Prefs
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "KeryxNotifListener"

/** Hourly cadence for the silent-breakage diagnostic stats ping. */
private const val STATS_PING_INTERVAL_MS = 60L * 60L * 1000L

/**
 * Captures Messages-family notifications (Google Messages stable + beta,
 * Samsung Messages) and relays them to Keryx.
 *
 * This class is intentionally thin — it owns Android Service lifecycle and
 * the side-effect machinery (relay enqueue, stats counters, diagnostic
 * pings). All actual parsing decisions live in [BridgeParser], which is a
 * pure function with no Android types so it can be regression-tested on the
 * JVM without an emulator (see `BridgeParserTest`).
 *
 * Responsibilities here:
 *   1. Filter to Messages-family packages and skip group summaries.
 *   2. Translate the Android `Bundle` into a [BridgeParser.NotificationInput].
 *   3. Enqueue any relay payloads the parser produces.
 *   4. Track per-package stats and fire diagnostics (parse_skip + hourly stats).
 */
class KeryxNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg !in BridgeParser.MESSAGES_PACKAGES) return

        val prefs = Prefs.get(applicationContext)
        if (!prefs.enabled || !prefs.isConfigured()) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val isGroupSummary = (notification.flags and android.app.Notification.FLAG_GROUP_SUMMARY) != 0
        if (isGroupSummary) return

        val relay = RelayClient.get(applicationContext)
        val stats = perPackageStats.computeIfAbsent(pkg) { PackageStats() }
        stats.notificationsSeen.incrementAndGet()

        try {
            // Preserve the historical fallback: if the OS didn't stamp the
            // notification (postTime <= 0), use the current wall clock so
            // downstream timestamps remain "now-ish" instead of 1970-01-01.
            // Parser stays pure — clock injection happens here.
            val postTime = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()
            val input = NotificationBundleExtractor.extract(
                packageName = pkg,
                postTimeMs = postTime,
                extras = extras,
                isGroupSummary = false,
            )
            val result = BridgeParser.parseNotification(input)
            handleParseResult(relay, stats, pkg, input, result)
        } finally {
            // Piggy-back the stats ping on notification traffic so we don't need
            // a separate scheduler. Cheap check; sendStatsIfDue handles throttling.
            sendStatsIfDue(prefs, relay)
        }
    }

    /** Translates a [BridgeParser.ParseResult] into relay enqueues + diagnostics + counter updates. */
    private fun handleParseResult(
        relay: RelayClient,
        stats: PackageStats,
        pkg: String,
        input: BridgeParser.NotificationInput,
        result: BridgeParser.ParseResult,
    ) {
        var outgoingDelta = 0
        var incomingDelta = 0
        for (p in result.payloads) {
            when (p.direction) {
                BridgeParser.Direction.SENT -> {
                    Log.d(TAG, "Outgoing ($pkg): \"${p.body.take(40)}\"")
                    outgoingDelta++
                }
                BridgeParser.Direction.RECEIVED -> {
                    Log.d(TAG, "Received ($pkg) from \"${p.address}\": \"${p.body.take(60)}\"")
                    incomingDelta++
                }
            }
            relay.enqueue(
                RelayClient.RelayPayload(
                    address = p.address,
                    body = p.body,
                    direction = if (p.direction == BridgeParser.Direction.SENT) "sent" else "received",
                    timestamp = p.timestampIso,
                    name = p.name,
                )
            )
        }
        if (outgoingDelta > 0) stats.outgoing.addAndGet(outgoingDelta)
        if (incomingDelta > 0) stats.incoming.addAndGet(incomingDelta)
        if (outgoingDelta + incomingDelta > 0) {
            stats.messagesExtracted.addAndGet(outgoingDelta + incomingDelta)
        }

        val skip = result.skip
        if (skip != null && skip.diagnostic) {
            sendParseSkipDiagnostic(
                relay,
                pkg = pkg,
                reason = skip.reason.name.lowercase(),
                title = input.title,
                textLen = (input.text ?: input.bigText)?.length ?: 0,
                messagingStyleCount = input.messagingStyleMessages?.size ?: 0,
            )
        }
    }

    /**
     * Fires a small anonymized "parse_skip" diagnostic event so the server can
     * see when Messages notifications stop yielding parseable payloads.
     * No bodies, no addresses, no names — only structural counts.
     */
    private fun sendParseSkipDiagnostic(
        relay: RelayClient,
        pkg: String,
        reason: String,
        title: String?,
        textLen: Int,
        messagingStyleCount: Int,
    ) {
        try {
            relay.sendDiagnostic(
                kind = "parse_skip",
                fields = mapOf(
                    "reason" to reason,
                    "package" to pkg,
                    "hasTitle" to (title != null),
                    "titleLen" to (title?.length ?: 0),
                    "textLen" to textLen,
                    "messagingStyleCount" to messagingStyleCount,
                )
            )
            Log.w(TAG, "parse_skip [$reason] pkg=$pkg titleLen=${title?.length ?: 0} textLen=$textLen msgStyle=$messagingStyleCount")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to send parse_skip diagnostic: ${e.message}")
        }
    }

    /**
     * Throttled hourly anonymized stats ping. Snapshots and resets per-package
     * counters in one atomic step (AtomicInteger.getAndSet(0)) so concurrent
     * notifications during the snapshot don't get double-counted.
     *
     * No-op if it's been less than [STATS_PING_INTERVAL_MS] since the last
     * successful schedule, or if there are no counters with notifications > 0.
     *
     * Note: if the device is offline, the ping is dropped (sendDiagnostic is
     * fire-and-forget by design — diagnostics are non-essential). The
     * `lastStatsPingAt` timestamp still advances so we don't spam attempts.
     */
    private fun sendStatsIfDue(prefs: Prefs, relay: RelayClient) {
        val now = System.currentTimeMillis()
        if (now - prefs.lastStatsPingAt < STATS_PING_INTERVAL_MS) return
        prefs.lastStatsPingAt = now

        for ((pkg, s) in perPackageStats) {
            val notif = s.notificationsSeen.getAndSet(0)
            val extracted = s.messagesExtracted.getAndSet(0)
            val outgoing = s.outgoing.getAndSet(0)
            val incoming = s.incoming.getAndSet(0)
            if (notif == 0) continue
            try {
                relay.sendDiagnostic(
                    kind = "stats",
                    fields = mapOf(
                        "package" to pkg,
                        "notificationsSeen" to notif,
                        "messagesExtracted" to extracted,
                        "outgoing" to outgoing,
                        "incoming" to incoming,
                        "windowMs" to STATS_PING_INTERVAL_MS,
                    )
                )
                Log.d(TAG, "stats ping pkg=$pkg notif=$notif extracted=$extracted out=$outgoing in=$incoming")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to send stats diagnostic: ${e.message}")
            }
        }
    }

    override fun onListenerConnected() {
        Log.d(TAG, "NotificationListenerService connected")
    }

    override fun onListenerDisconnected() {
        Log.w(TAG, "NotificationListenerService disconnected — will reconnect automatically")
    }

    /**
     * Per-package counters. Process-wide so stats survive across notifications
     * but reset on process death (which is fine — reset on restart is acceptable
     * for a coarse hourly health metric).
     */
    private class PackageStats {
        val notificationsSeen = AtomicInteger(0)
        val messagesExtracted = AtomicInteger(0)
        val outgoing = AtomicInteger(0)
        val incoming = AtomicInteger(0)
    }

    companion object {
        private val perPackageStats = ConcurrentHashMap<String, PackageStats>()
    }
}
