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
 *
 * Resilience to Google Messages copy changes:
 *   The outgoing-RCS detection uses broad heuristics rather than exact phrase
 *   matches, because Google routinely renames notification labels as they merge
 *   features from Samsung Messages. If a notification still produces zero
 *   relayable payloads, an anonymized "parse_skip" diagnostic event is sent
 *   so silent breakage shows up server-side before users notice missing messages.
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
        var emitted = 0

        // ── Path 1: MessagingStyle ────────────────────────────────────────────
        // Modern Google Messages uses MessagingStyle which packs all messages in
        // android.messages. This is the authoritative source for RCS/MMS and
        // correctly handles multi-message bundles where android.text is a count.
        // Title is not required here — sender info comes from each message bundle.
        val messagingStyleMessages = extras.getParcelableArray("android.messages")
        if (!messagingStyleMessages.isNullOrEmpty()) {
            emitted += processMessagingStyleMessages(relay, messagingStyleMessages, sbn.postTime)
            if (emitted == 0) {
                // MessagingStyle was present but yielded nothing — odd, fire diagnostic.
                sendParseSkipDiagnostic(
                    relay,
                    reason = "messaging_style_zero_payloads",
                    title = title,
                    textLen = 0,
                    messagingStyleCount = messagingStyleMessages.size,
                )
            }
            return
        }

        // ── Path 2: Simple notification (SMS / older Google Messages) ─────────
        // Title is required for the simple path to identify the sender.
        val text = extras.getCharSequence("android.text")?.toString()
            ?: extras.getCharSequence("android.bigText")?.toString()

        if (title == null || text == null || text.isBlank()) {
            // Nothing extractable. Skip count-only summaries silently — they're expected.
            if (text != null && isCountOnlyText(text)) return
            // Otherwise, this is a notification we couldn't parse. Tell the server.
            sendParseSkipDiagnostic(
                relay,
                reason = "simple_path_missing_fields",
                title = title,
                textLen = text?.length ?: 0,
                messagingStyleCount = 0,
            )
            return
        }
        if (isCountOnlyText(text)) return

        val timestampMs = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()
        val timestampIso = Instant.ofEpochMilli(timestampMs).toString()

        val isSent = isSentRcsNotification(title, text)
        if (isSent) {
            val body = extractSentBody(title, text)
            if (body == null) {
                // We classified this as a sent-RCS notification but couldn't recover
                // the actual body. This is the silent-breakage case the diagnostic
                // exists to catch — Google likely changed the body format.
                sendParseSkipDiagnostic(
                    relay,
                    reason = "sent_classified_but_no_body",
                    title = title,
                    textLen = text.length,
                    messagingStyleCount = 0,
                )
                return
            }
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
            emitted++
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
            emitted++
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
     * @return number of relay payloads enqueued.
     */
    private fun processMessagingStyleMessages(
        relay: RelayClient,
        messages: Array<out android.os.Parcelable>,
        notifPostTime: Long,
    ): Int {
        var enqueued = 0
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
                enqueued++
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
                enqueued++
            }
        }
        return enqueued
    }

    /**
     * Returns true for strings that are message count summaries rather than
     * actual message content, e.g. "3 new messages", "2 messages".
     */
    private fun isCountOnlyText(text: String): Boolean {
        return text.lowercase().trim().matches(Regex("""\d+\s+(new\s+)?messages?"""))
    }

    /**
     * Returns true when [sender] looks like a self-label that Google Messages
     * (or its OEM variants) uses for outgoing messages in the MessagingStyle
     * sender field. Conservative — only matches well-known self-labels in
     * isolation, never substrings, so a real contact named "Mel" doesn't get
     * mis-classified as outgoing.
     */
    private fun isSelfSender(sender: String): Boolean {
        val s = sender.trim().lowercase().removeSuffix(":").trim()
        return s == "you" || s == "me" || s == "self" || s == "you sent" || s == "yourself"
    }

    /**
     * Detects outgoing-RCS / "sent" / "sending" / "delivered" notifications.
     *
     * Designed to be broad enough to survive Google Messages copy reshuffles
     * while NEVER misclassifying a real incoming message as outgoing.
     *
     * Two strict structural categories trigger an outgoing classification:
     *
     *   A. Self-label title — Google packs a sent-side notification with
     *      title == "You" / "Me" / "Self" / etc. Real contacts keep their
     *      actual name in the title, so a self-label there is a strong
     *      outgoing signal.
     *
     *   B. Status-only template — title OR text is one of the well-known
     *      status phrases ("Message sent", "Sending…", "Message delivered",
     *      "You sent a message", "Message sent to <contact>"). These are
     *      Google's templated status notifications and can never appear as
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
        // are never legitimate inbound bodies because they're Google's own
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
     * Strategy (in order):
     *   1. If [text] is a pure status string ("message sent", "sending…",
     *      "delivered"), return null — there's no body to relay.
     *   2. Strip a leading status prefix ("Sent: ", "Sending: ", "You: ",
     *      "Delivered • 2:31 PM — ") if present.
     *   3. If a colon separator exists and the prefix looks like a status/sender
     *      label, return everything after it.
     *   4. If the title is a self-label ("You", "Me") and the text doesn't
     *      contain a status prefix, the entire text is the body.
     *
     * Returns null when no usable body can be recovered — caller fires a
     * parse_skip diagnostic so we see when Google introduces a new format.
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

        // Strip a known leading status prefix (case-insensitive, then return remainder).
        val statusPrefixes = listOf(
            "you: ", "you said: ", "you sent: ",
            "sent: ", "sending: ", "delivered: ",
            "message sent: ", "message sent to ",
            "sending to ", "message sending: ",
            "\u2713 ", "\u2714 ", // ✓ ✔
        )
        for (p in statusPrefixes) {
            if (lower.startsWith(p)) {
                val after = trimmed.substring(p.length).trim()
                if (after.isNotBlank()) return after
            }
        }

        // "Delivered • 2:31 PM — actual body" or "Sent · actual body"
        // Look for separators after a status keyword in the first ~30 chars.
        val sepMatch = Regex("""^(?i)(delivered|sent|sending)[^a-z0-9]{1,30}(.+)$""").find(trimmed)
        if (sepMatch != null) {
            val body = sepMatch.groupValues[2].trim()
            if (body.isNotBlank() && !body.lowercase().matches(Regex("""\d+:\d+(\s*[ap]m)?"""))) {
                return body
            }
        }

        // Generic colon separator (e.g. "Mel: Hello there")
        val colonIdx = trimmed.indexOf(':')
        if (colonIdx in 1 until trimmed.length - 1) {
            val after = trimmed.substring(colonIdx + 1).trim()
            if (after.isNotBlank()) return after
        }

        // If title was a self-label and text has no recognisable prefix, it IS the body.
        if (isSelfSender(title.trim())) {
            return trimmed
        }

        // Fallback — return text verbatim (better than dropping silently when we
        // already classified this as outgoing).
        return trimmed
    }

    /**
     * Fires a small anonymized "parse_skip" diagnostic event so the server can
     * see when Google Messages notifications stop yielding parseable payloads.
     * No bodies, no addresses, no names — only structural counts.
     */
    private fun sendParseSkipDiagnostic(
        relay: RelayClient,
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
                    "package" to GOOGLE_MESSAGES_PKG,
                    "hasTitle" to (title != null),
                    "titleLen" to (title?.length ?: 0),
                    "textLen" to textLen,
                    "messagingStyleCount" to messagingStyleCount,
                )
            )
            Log.w(TAG, "parse_skip [$reason] titleLen=${title?.length ?: 0} textLen=$textLen msgStyle=$messagingStyleCount")
        } catch (e: Exception) {
            // Diagnostic must never crash the listener
            Log.w(TAG, "Failed to send parse_skip diagnostic: ${e.message}")
        }
    }

    override fun onListenerConnected() {
        Log.d(TAG, "NotificationListenerService connected")
    }

    override fun onListenerDisconnected() {
        Log.w(TAG, "NotificationListenerService disconnected — will reconnect automatically")
    }
}
