package app.keryx.bridge

import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import app.keryx.bridge.network.RelayClient
import app.keryx.bridge.util.PhoneNormalizer
import app.keryx.bridge.util.Prefs
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "KeryxNotifListener"

/**
 * Messages-family packages we listen to.
 *
 * - Google Messages stable: `com.google.android.apps.messaging`
 * - Google Messages beta:   `com.google.android.apps.messaging.beta`
 * - Samsung Messages:       `com.samsung.android.messaging`
 *
 * All three use the standard MessagingStyle / simple-notification formats, so
 * the same parsing applies. If/when format differences appear, dispatch by
 * `pkg` rather than adding listener subclasses.
 */
private val MESSAGES_PACKAGES = setOf(
    "com.google.android.apps.messaging",
    "com.google.android.apps.messaging.beta",
    "com.samsung.android.messaging",
)

/** Hourly cadence for the silent-breakage diagnostic stats ping. */
private const val STATS_PING_INTERVAL_MS = 60L * 60L * 1000L

/**
 * Captures Messages-family notifications (Google Messages stable + beta,
 * Samsung Messages) and relays them to Keryx.
 *
 * Two notification formats are handled:
 *
 * 1. MessagingStyle (Android 12+ / modern Messages with RCS):
 *    extras["android.messages"] = Parcelable[] of Bundles, each with:
 *      "text"   → CharSequence message body
 *      "time"   → Long timestamp ms
 *      "sender" → CharSequence sender name, null/empty for outgoing
 *    This format is tried first. It correctly handles multi-message bundles
 *    where android.text would only contain a count like "3 new messages".
 *
 * 2. Simple notification (older / SMS fallback):
 *    extras["android.title"] = sender name or conversation title
 *    extras["android.text"]  = message body
 *    extras["android.bigText"] = full body (fallback)
 *
 * Resilience to copy changes:
 *   - Outgoing-RCS classification uses strict structural heuristics rather
 *     than exact phrase matches.
 *   - When parsing yields zero payloads from a non-summary notification, an
 *     anonymized "parse_skip" diagnostic event is sent so silent breakage
 *     surfaces server-side before users notice missing messages.
 *   - An hourly anonymized "stats" diagnostic ping reports per-package counts
 *     of notifications-seen vs. messages-extracted (with outgoing/incoming
 *     breakdown) so a sustained drop in extraction rate is visible even when
 *     no individual notification trips parse_skip.
 */
class KeryxNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg !in MESSAGES_PACKAGES) return

        val prefs = Prefs.get(applicationContext)
        if (!prefs.enabled || !prefs.isConfigured()) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        // Skip group summary notifications — they duplicate child notification content
        val isGroupSummary = (notification.flags and android.app.Notification.FLAG_GROUP_SUMMARY) != 0
        if (isGroupSummary) return

        val title = extras.getCharSequence("android.title")?.toString()
        val relay = RelayClient.get(applicationContext)
        val stats = perPackageStats.computeIfAbsent(pkg) { PackageStats() }
        stats.notificationsSeen.incrementAndGet()

        try {
            processNotification(pkg, relay, stats, extras, title, sbn.postTime)
        } finally {
            // Piggy-back the stats ping on notification traffic so we don't need
            // a separate scheduler. Cheap check; sendStatsIfDue handles throttling.
            sendStatsIfDue(prefs, relay)
        }
    }

    /** Encapsulates the actual parsing pipeline so the surrounding stats/ping logic stays clean. */
    private fun processNotification(
        pkg: String,
        relay: RelayClient,
        stats: PackageStats,
        extras: Bundle,
        title: String?,
        notifPostTime: Long,
    ) {
        // ── Path 1: MessagingStyle ────────────────────────────────────────────
        val messagingStyleMessages = extras.getParcelableArray("android.messages")
        if (!messagingStyleMessages.isNullOrEmpty()) {
            val (out, inc) = processMessagingStyleMessages(relay, messagingStyleMessages, notifPostTime)
            stats.outgoing.addAndGet(out)
            stats.incoming.addAndGet(inc)
            stats.messagesExtracted.addAndGet(out + inc)
            if (out + inc == 0) {
                sendParseSkipDiagnostic(
                    relay,
                    pkg = pkg,
                    reason = "messaging_style_zero_payloads",
                    title = title,
                    textLen = 0,
                    messagingStyleCount = messagingStyleMessages.size,
                )
            }
            return
        }

        // ── Path 2: Simple notification (SMS / older Messages) ────────────────
        val text = extras.getCharSequence("android.text")?.toString()
            ?: extras.getCharSequence("android.bigText")?.toString()

        if (title == null || text == null || text.isBlank()) {
            if (text != null && isCountOnlyText(text)) return
            sendParseSkipDiagnostic(
                relay,
                pkg = pkg,
                reason = "simple_path_missing_fields",
                title = title,
                textLen = text?.length ?: 0,
                messagingStyleCount = 0,
            )
            return
        }
        if (isCountOnlyText(text)) return

        val timestampMs = notifPostTime.takeIf { it > 0 } ?: System.currentTimeMillis()
        val timestampIso = Instant.ofEpochMilli(timestampMs).toString()

        val isSent = isSentRcsNotification(title, text)
        if (isSent) {
            val body = extractSentBody(title, text)
            if (body == null) {
                sendParseSkipDiagnostic(
                    relay,
                    pkg = pkg,
                    reason = "sent_classified_but_no_body",
                    title = title,
                    textLen = text.length,
                    messagingStyleCount = 0,
                )
                return
            }
            Log.d(TAG, "Outgoing RCS (simple, $pkg): \"${body.take(40)}\"")
            relay.enqueue(
                RelayClient.RelayPayload(
                    address = "outgoing",
                    body = body,
                    direction = "sent",
                    timestamp = timestampIso,
                    name = null
                )
            )
            stats.outgoing.incrementAndGet()
            stats.messagesExtracted.incrementAndGet()
        } else {
            val normalizedAddress = PhoneNormalizer.normalize(title)
            val senderName = if (normalizedAddress != title) null else title
            Log.d(TAG, "Received (simple, $pkg) from \"$title\": \"${text.take(60)}\"")
            relay.enqueue(
                RelayClient.RelayPayload(
                    address = normalizedAddress,
                    body = text,
                    direction = "received",
                    timestamp = timestampIso,
                    name = senderName
                )
            )
            stats.incoming.incrementAndGet()
            stats.messagesExtracted.incrementAndGet()
        }
    }

    /**
     * Processes MessagingStyle notification messages.
     * Each item in the Parcelable array is a Bundle with keys:
     *   "text"   → message body (CharSequence)
     *   "time"   → timestamp ms (Long)
     *   "sender" → sender name (CharSequence), null/empty for outgoing messages
     *
     * Outgoing messages (sender == null/blank, OR sender matches a self-label
     * like "You" / "Me" — which Google has used for sent-side senders in some
     * versions) are relayed with direction="sent". Incoming messages use sender
     * as the address/name.
     *
     * @return Pair(outgoing, incoming) payload counts.
     */
    private fun processMessagingStyleMessages(
        relay: RelayClient,
        messages: Array<out android.os.Parcelable>,
        notifPostTime: Long,
    ): Pair<Int, Int> {
        var outgoing = 0
        var incoming = 0
        for (item in messages) {
            val bundle = item as? Bundle ?: continue
            val body = bundle.getCharSequence("text")?.toString()?.trim() ?: continue
            if (body.isBlank()) continue

            val timeMs = bundle.getLong("time", 0L).takeIf { it > 0 }
                ?: notifPostTime.takeIf { it > 0 }
                ?: System.currentTimeMillis()
            val timestampIso = Instant.ofEpochMilli(timeMs).toString()

            val sender = bundle.getCharSequence("sender")?.toString()?.trim()

            if (sender.isNullOrBlank() || isSelfSender(sender)) {
                Log.d(TAG, "MessagingStyle outgoing: \"${body.take(40)}\"")
                relay.enqueue(
                    RelayClient.RelayPayload(
                        address = "outgoing",
                        body = body,
                        direction = "sent",
                        timestamp = timestampIso,
                        name = null
                    )
                )
                outgoing++
            } else {
                val normalizedAddress = PhoneNormalizer.normalize(sender)
                val senderName = if (normalizedAddress != sender) null else sender
                Log.d(TAG, "MessagingStyle received from \"$sender\": \"${body.take(60)}\"")
                relay.enqueue(
                    RelayClient.RelayPayload(
                        address = normalizedAddress,
                        body = body,
                        direction = "received",
                        timestamp = timestampIso,
                        name = senderName
                    )
                )
                incoming++
            }
        }
        return outgoing to incoming
    }

    /**
     * Returns true for strings that are message count summaries rather than
     * actual message content, e.g. "3 new messages", "2 messages".
     */
    private fun isCountOnlyText(text: String): Boolean {
        return text.lowercase().trim().matches(Regex("""\d+\s+(new\s+)?messages?"""))
    }

    /**
     * Returns true when [sender] looks like a self-label that Messages-family
     * apps use for outgoing messages in the MessagingStyle sender field.
     * Conservative — only matches well-known self-labels in isolation, never
     * substrings, so a real contact named "Mel" doesn't get mis-classified as
     * outgoing.
     */
    private fun isSelfSender(sender: String): Boolean {
        val s = sender.trim().lowercase().removeSuffix(":").trim()
        return s == "you" || s == "me" || s == "self" || s == "you sent" || s == "yourself"
    }

    /**
     * Detects outgoing-RCS / "sent" / "sending" / "delivered" notifications.
     *
     * Designed to be broad enough to survive Messages copy reshuffles while
     * NEVER misclassifying a real incoming message as outgoing.
     *
     * Two strict structural categories trigger an outgoing classification:
     *
     *   A. Self-label title — Messages packs a sent-side notification with
     *      title == "You" / "Me" / "Self" / etc. Real contacts keep their
     *      actual name in the title, so a self-label there is a strong
     *      outgoing signal.
     *
     *   B. Status-only template — title OR text is one of the well-known
     *      status phrases ("Message sent", "Sending…", "Message delivered",
     *      "You sent a message", "Message sent to <contact>"). These are
     *      Messages' templated status notifications and can never appear as
     *      the body of a real incoming message because they live in the
     *      title slot or are the entire text.
     *
     * Patterns that could plausibly appear inside a legitimate incoming
     * message body (e.g. "you: ", a leading checkmark, the word "delivered"
     * appearing somewhere in the first 20 chars) are intentionally NOT used
     * as triggers — they would route real incoming messages as sent.
     */
    private fun isSentRcsNotification(title: String, text: String): Boolean {
        val titleTrim = title.trim()
        val titleLower = titleTrim.lowercase()
        val textLower = text.trim().lowercase()

        // Category A — self-label title (strong signal: real contacts have names here)
        if (isSelfSender(titleTrim)) return true

        // Category B1 — title is a status template
        if (titleLower == "message sent"
            || titleLower == "message sending"
            || titleLower == "message delivered"
            || titleLower == "sent"
            || titleLower == "sending"
            || titleLower == "sending\u2026"
            || titleLower == "delivered"
        ) return true
        // Title that begins with a status word followed by a separator —
        // covers "Sent: …", "Sending to Mel", "Message sent to Mel",
        // "Delivered • 2:31 PM". The trailing separator is required so a
        // contact named "Sentinel" or "Sender" cannot match.
        if (titleLower.matches(
            Regex("""^(sent|sending|delivered|message sent|message sending|message delivered|you sent)([\s:•·\-]|\sto\s).*""")
        )) return true

        // Category B2 — text is the entire status template (no body)
        if (textLower == "message sent"
            || textLower == "sending"
            || textLower == "sending\u2026"
            || textLower == "delivered"
            || textLower == "sent"
            || textLower == "you sent a message"
        ) return true
        // Text that begins with a Google status template specifically — these
        // are never legitimate inbound bodies because they're the app's own
        // notification phrasings, not message content.
        if (textLower.startsWith("message sent to ")
            || textLower.startsWith("message sent ")
            || textLower.startsWith("sending to ")
            || textLower.startsWith("message sending")
            || textLower.startsWith("you sent ")
        ) return true

        return false
    }

    /**
     * Recovers the actual sent message body from a sent-RCS notification.
     *
     * Returns null when no usable body can be recovered — caller fires a
     * parse_skip diagnostic so we see when Messages introduces a new format.
     */
    private fun extractSentBody(title: String, text: String): String? {
        val trimmed = text.trim()
        if (trimmed.isBlank()) return null
        val lower = trimmed.lowercase()

        // Pure status strings — no body present
        if (lower == "message sent"
            || lower == "sending"
            || lower == "sending\u2026"
            || lower == "delivered"
            || lower == "you sent a message"
        ) return null

        val statusPrefixes = listOf(
            "you: ", "you said: ", "you sent: ",
            "sent: ", "sending: ", "delivered: ",
            "message sent: ", "message sent to ",
            "sending to ", "message sending: ",
            "\u2713 ", "\u2714 ",
        )
        for (p in statusPrefixes) {
            if (lower.startsWith(p)) {
                val after = trimmed.substring(p.length).trim()
                if (after.isNotBlank()) return after
            }
        }

        val sepMatch = Regex("""^(?i)(delivered|sent|sending)[^a-z0-9]{1,30}(.+)$""").find(trimmed)
        if (sepMatch != null) {
            val body = sepMatch.groupValues[2].trim()
            if (body.isNotBlank() && !body.lowercase().matches(Regex("""\d+:\d+(\s*[ap]m)?"""))) {
                return body
            }
        }

        val colonIdx = trimmed.indexOf(':')
        if (colonIdx in 1 until trimmed.length - 1) {
            val after = trimmed.substring(colonIdx + 1).trim()
            if (after.isNotBlank()) return after
        }

        if (isSelfSender(title.trim())) {
            return trimmed
        }

        return trimmed
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
