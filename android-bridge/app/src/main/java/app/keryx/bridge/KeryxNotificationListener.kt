package app.keryx.bridge

import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import app.keryx.bridge.network.RelayClient
import app.keryx.bridge.util.PhoneNormalizer
import app.keryx.bridge.util.Prefs
import java.time.Instant

private const val TAG = "KeryxNotifListener"
private const val GOOGLE_MESSAGES_PKG = "com.google.android.apps.messaging"

/**
 * Captures Google Messages notifications and relays them to Keryx.
 *
 * Two notification formats are handled:
 *
 * 1. MessagingStyle (Android 12+ / modern Google Messages with RCS):
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
 */
class KeryxNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName != GOOGLE_MESSAGES_PKG) return

        val prefs = Prefs.get(applicationContext)
        if (!prefs.enabled || !prefs.isConfigured()) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        // Skip group summary notifications — they duplicate child notification content
        val isGroupSummary = (notification.flags and android.app.Notification.FLAG_GROUP_SUMMARY) != 0
        if (isGroupSummary) return

        val title = extras.getCharSequence("android.title")?.toString()
        val relay = RelayClient.get(applicationContext)

        // ── Path 1: MessagingStyle ────────────────────────────────────────────
        // Modern Google Messages uses MessagingStyle which packs all messages in
        // android.messages. This is the authoritative source for RCS/MMS and
        // correctly handles multi-message bundles where android.text is a count.
        // Title is not required here — sender info comes from each message bundle.
        val messagingStyleMessages = extras.getParcelableArray("android.messages")
        if (!messagingStyleMessages.isNullOrEmpty()) {
            processMessagingStyleMessages(relay, messagingStyleMessages, sbn.postTime)
            return
        }

        // ── Path 2: Simple notification (SMS / older Google Messages) ─────────
        // Title is required for the simple path to identify the sender.
        if (title == null) return
        val text = extras.getCharSequence("android.text")?.toString()
            ?: extras.getCharSequence("android.bigText")?.toString()
            ?: return
        if (text.isBlank() || isCountOnlyText(text)) return

        val timestampMs = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()
        val timestampIso = Instant.ofEpochMilli(timestampMs).toString()

        val isSent = isSentRcsNotification(title, text)
        if (isSent) {
            val body = extractSentBody(text) ?: return
            Log.d(TAG, "Outgoing RCS (simple): \"${body.take(40)}\"")
            relay.enqueue(
                RelayClient.RelayPayload(
                    address = "outgoing",
                    body = body,
                    direction = "sent",
                    timestamp = timestampIso,
                    name = null
                )
            )
        } else {
            val normalizedAddress = PhoneNormalizer.normalize(title)
            val senderName = if (normalizedAddress != title) null else title
            Log.d(TAG, "Received (simple) from \"$title\": \"${text.take(60)}\"")
            relay.enqueue(
                RelayClient.RelayPayload(
                    address = normalizedAddress,
                    body = text,
                    direction = "received",
                    timestamp = timestampIso,
                    name = senderName
                )
            )
        }
    }

    /**
     * Processes MessagingStyle notification messages.
     * Each item in the Parcelable array is a Bundle with keys:
     *   "text"   → message body (CharSequence)
     *   "time"   → timestamp ms (Long)
     *   "sender" → sender name (CharSequence), null/empty for outgoing messages
     *
     * Outgoing messages (sender == null/blank) are relayed with direction="sent".
     * Incoming messages use sender as the address/name.
     */
    private fun processMessagingStyleMessages(
        relay: RelayClient,
        messages: Array<out android.os.Parcelable>,
        notifPostTime: Long,
    ) {
        for (item in messages) {
            val bundle = item as? Bundle ?: continue
            val body = bundle.getCharSequence("text")?.toString()?.trim() ?: continue
            if (body.isBlank()) continue

            val timeMs = bundle.getLong("time", 0L).takeIf { it > 0 }
                ?: notifPostTime.takeIf { it > 0 }
                ?: System.currentTimeMillis()
            val timestampIso = Instant.ofEpochMilli(timeMs).toString()

            val sender = bundle.getCharSequence("sender")?.toString()?.trim()

            if (sender.isNullOrBlank()) {
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
            }
        }
    }

    /**
     * Returns true for strings that are message count summaries rather than
     * actual message content, e.g. "3 new messages", "2 messages".
     */
    private fun isCountOnlyText(text: String): Boolean {
        return text.lowercase().trim().matches(Regex("""\d+\s+(new\s+)?messages?"""))
    }

    /**
     * Detects outgoing-RCS "sent" / "sending" notifications.
     * Known patterns (vary by Google Messages version and OEM):
     *   title == "You" — older versions
     *   title == "Message sent" | "Message sending" — newer versions
     *   title starts with "Sent" | "Sending" — some OEM variants
     *   text == "Message sent" | "Sending…"
     *   text starts with "Message sent to " | "Sending to "
     */
    private fun isSentRcsNotification(title: String, text: String): Boolean {
        val titleLower = title.lowercase()
        val textLower = text.lowercase()
        return titleLower == "you"
            || titleLower == "message sent"
            || titleLower == "message sending"
            || titleLower.startsWith("sent")
            || titleLower.startsWith("sending")
            || textLower == "message sent"
            || textLower == "sending"
            || textLower == "sending\u2026"
            || textLower.startsWith("message sent to ")
            || textLower.startsWith("sending to ")
            || textLower.startsWith("message sending")
    }

    private fun extractSentBody(text: String): String? {
        val textLower = text.lowercase()
        if (textLower == "message sent"
            || textLower == "sending"
            || textLower == "sending\u2026") return null

        val colonIdx = text.indexOf(':')
        return if (colonIdx > 0 && colonIdx < text.length - 1) {
            text.substring(colonIdx + 1).trim().takeIf { it.isNotBlank() }
        } else {
            text.takeIf { it.isNotBlank() }
        }
    }

    override fun onListenerConnected() {
        Log.d(TAG, "NotificationListenerService connected")
    }

    override fun onListenerDisconnected() {
        Log.w(TAG, "NotificationListenerService disconnected — will reconnect automatically")
    }
}
