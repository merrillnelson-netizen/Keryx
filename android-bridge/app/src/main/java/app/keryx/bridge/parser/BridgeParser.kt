package app.keryx.bridge.parser

import app.keryx.bridge.util.PhoneNormalizer
import java.time.Instant

/**
 * Pure (Android-free) parser for Messages-family notification payloads.
 *
 * Lives in its own file so it can be exercised by JVM unit tests without
 * Robolectric/emulator overhead. The Service layer (KeryxNotificationListener)
 * is responsible for translating an Android `Bundle` into [NotificationInput],
 * then handing the result off to [parseNotification] here.
 *
 * Side-effect free: returns a [ParseResult] rather than enqueueing onto a
 * relay client. The Service handles enqueue + diagnostics from the result.
 */
object BridgeParser {

    /**
     * Messages-family packages we listen to. Public so the Service and the
     * tests can both reference the same canonical set.
     */
    val MESSAGES_PACKAGES: Set<String> = setOf(
        "com.google.android.apps.messaging",        // Google Messages stable
        "com.google.android.apps.messaging.beta",   // Google Messages beta
        "com.samsung.android.messaging",            // Samsung Messages
    )

    /** Self-labels used by Messages apps for the sent-side sender field. */
    private val SELF_SENDER_LABELS: Set<String> = setOf(
        "you", "me", "self", "you sent", "yourself"
    )

    /** Pure data view of a single MessagingStyle message bundle. */
    data class MessagingStyleMessage(
        val text: String?,
        val sender: String?,
        val timeMs: Long,
    )

    /**
     * Pure data view of an Android notification — everything the parser needs
     * to make routing decisions, with no Android types.
     */
    data class NotificationInput(
        val packageName: String,
        val postTimeMs: Long,
        val title: String?,
        val text: String?,
        val bigText: String?,
        /** Null/empty if the notification doesn't use MessagingStyle. */
        val messagingStyleMessages: List<MessagingStyleMessage>?,
        val isGroupSummary: Boolean,
    )

    /** Result of parsing a single notification. */
    data class ParseResult(
        val payloads: List<RelayPayload>,
        /** Non-null when the parser consciously skipped emitting payloads
         *  (either silently for known summary cases, or with a diagnostic). */
        val skip: Skip?,
    )

    /** A parsed payload ready to hand to the relay layer. */
    data class RelayPayload(
        val address: String,
        val body: String,
        val direction: Direction,
        val timestampIso: String,
        val name: String?,
    )

    enum class Direction { SENT, RECEIVED }

    /** Why we produced zero payloads. */
    data class Skip(val reason: SkipReason, val diagnostic: Boolean) {
        companion object {
            fun silent(reason: SkipReason) = Skip(reason, diagnostic = false)
            fun diagnostic(reason: SkipReason) = Skip(reason, diagnostic = true)
        }
    }

    enum class SkipReason {
        UNSUPPORTED_PACKAGE,
        GROUP_SUMMARY,
        COUNT_ONLY_TEXT,
        SIMPLE_PATH_MISSING_FIELDS,
        SENT_CLASSIFIED_BUT_NO_BODY,
        MESSAGING_STYLE_ZERO_PAYLOADS,
    }

    /**
     * Top-level entry point. Returns a [ParseResult] describing what (if
     * anything) the Service should enqueue, and whether to fire a parse_skip
     * diagnostic for visibility.
     *
     * Pure: no I/O, no logging, no static state.
     */
    fun parseNotification(input: NotificationInput): ParseResult {
        if (input.packageName !in MESSAGES_PACKAGES) {
            return ParseResult(emptyList(), Skip.silent(SkipReason.UNSUPPORTED_PACKAGE))
        }
        if (input.isGroupSummary) {
            return ParseResult(emptyList(), Skip.silent(SkipReason.GROUP_SUMMARY))
        }

        // ── Path 1: MessagingStyle ────────────────────────────────────────
        val msgStyle = input.messagingStyleMessages
        if (!msgStyle.isNullOrEmpty()) {
            val payloads = parseMessagingStyle(msgStyle, input.postTimeMs)
            val skip = if (payloads.isEmpty()) {
                Skip.diagnostic(SkipReason.MESSAGING_STYLE_ZERO_PAYLOADS)
            } else null
            return ParseResult(payloads, skip)
        }

        // ── Path 2: Simple notification (SMS / older Messages) ────────────
        val title = input.title
        val text = input.text ?: input.bigText
        if (title == null || text == null || text.isBlank()) {
            // Count-only summary text with no title is expected — silent skip.
            if (text != null && isCountOnlyText(text)) {
                return ParseResult(emptyList(), Skip.silent(SkipReason.COUNT_ONLY_TEXT))
            }
            return ParseResult(emptyList(), Skip.diagnostic(SkipReason.SIMPLE_PATH_MISSING_FIELDS))
        }
        if (isCountOnlyText(text)) {
            return ParseResult(emptyList(), Skip.silent(SkipReason.COUNT_ONLY_TEXT))
        }

        val timestampMs = input.postTimeMs.takeIf { it > 0 } ?: 0L
        val timestampIso = if (timestampMs > 0) {
            Instant.ofEpochMilli(timestampMs).toString()
        } else {
            // Tests construct inputs with explicit postTimeMs; production callers
            // always pass sbn.postTime. Fall back to epoch only as a safety net.
            Instant.ofEpochMilli(0L).toString()
        }

        val isSent = isSentRcsNotification(title, text)
        if (isSent) {
            val body = extractSentBody(title, text)
                ?: return ParseResult(emptyList(), Skip.diagnostic(SkipReason.SENT_CLASSIFIED_BUT_NO_BODY))
            return ParseResult(
                listOf(
                    RelayPayload(
                        address = "outgoing",
                        body = body,
                        direction = Direction.SENT,
                        timestampIso = timestampIso,
                        name = null,
                    )
                ),
                skip = null,
            )
        }

        val normalizedAddress = PhoneNormalizer.normalize(title)
        val senderName = if (normalizedAddress != title) null else title
        return ParseResult(
            listOf(
                RelayPayload(
                    address = normalizedAddress,
                    body = text,
                    direction = Direction.RECEIVED,
                    timestampIso = timestampIso,
                    name = senderName,
                )
            ),
            skip = null,
        )
    }

    /** Parses MessagingStyle bundles into ordered relay payloads. */
    private fun parseMessagingStyle(
        messages: List<MessagingStyleMessage>,
        notifPostTime: Long,
    ): List<RelayPayload> {
        val out = mutableListOf<RelayPayload>()
        for (m in messages) {
            val body = m.text?.trim().orEmpty()
            if (body.isBlank()) continue

            val timeMs = m.timeMs.takeIf { it > 0 }
                ?: notifPostTime.takeIf { it > 0 }
                ?: 0L
            val timestampIso = Instant.ofEpochMilli(timeMs).toString()
            val sender = m.sender?.trim()

            if (sender.isNullOrBlank() || isSelfSender(sender)) {
                out += RelayPayload(
                    address = "outgoing",
                    body = body,
                    direction = Direction.SENT,
                    timestampIso = timestampIso,
                    name = null,
                )
            } else {
                val normalizedAddress = PhoneNormalizer.normalize(sender)
                val senderName = if (normalizedAddress != sender) null else sender
                out += RelayPayload(
                    address = normalizedAddress,
                    body = body,
                    direction = Direction.RECEIVED,
                    timestampIso = timestampIso,
                    name = senderName,
                )
            }
        }
        return out
    }

    /** "3 new messages", "2 messages", "5 new message" — count-only summary text. */
    fun isCountOnlyText(text: String): Boolean =
        text.lowercase().trim().matches(Regex("""\d+\s+(new\s+)?messages?"""))

    /** Strict self-label match (no substrings — "Mel" must not match). */
    fun isSelfSender(sender: String): Boolean {
        val s = sender.trim().lowercase().removeSuffix(":").trim()
        return s in SELF_SENDER_LABELS
    }

    /**
     * Outgoing-RCS classifier. See the documented categories on
     * KeryxNotificationListener.isSentRcsNotification — kept identical here
     * since this is the only definition the production code now uses.
     */
    fun isSentRcsNotification(title: String, text: String): Boolean {
        val titleTrim = title.trim()
        val titleLower = titleTrim.lowercase()
        val textLower = text.trim().lowercase()

        if (isSelfSender(titleTrim)) return true

        if (titleLower == "message sent"
            || titleLower == "message sending"
            || titleLower == "message delivered"
            || titleLower == "sent"
            || titleLower == "sending"
            || titleLower == "sending\u2026"
            || titleLower == "delivered"
        ) return true
        if (titleLower.matches(
                Regex("""^(sent|sending|delivered|message sent|message sending|message delivered|you sent)([\s:•·\-]|\sto\s).*""")
            )
        ) return true

        if (textLower == "message sent"
            || textLower == "sending"
            || textLower == "sending\u2026"
            || textLower == "delivered"
            || textLower == "sent"
            || textLower == "you sent a message"
        ) return true
        if (textLower.startsWith("message sent to ")
            || textLower.startsWith("message sent ")
            || textLower.startsWith("sending to ")
            || textLower.startsWith("message sending")
            || textLower.startsWith("you sent ")
        ) return true

        return false
    }

    /** Recovers the actual sent body from an outgoing-classified notification. */
    fun extractSentBody(title: String, text: String): String? {
        val trimmed = text.trim()
        if (trimmed.isBlank()) return null
        val lower = trimmed.lowercase()

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

        if (isSelfSender(title.trim())) return trimmed

        return trimmed
    }
}
