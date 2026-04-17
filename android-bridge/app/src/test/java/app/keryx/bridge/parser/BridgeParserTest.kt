package app.keryx.bridge.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Fast JVM regression tests for [BridgeParser].
 *
 * These tests pin down the parser's behavior against the documented Android
 * Messages-family notification shapes the Bridge has been observed to handle
 * in production. They run as part of `./gradlew test` (no emulator, no
 * Robolectric), so any future change that breaks message capture for a known
 * shape fails the CI build before an APK ever ships.
 *
 * ── Fixtures ───────────────────────────────────────────────────────────────
 * Each `fixture*()` helper below constructs a [BridgeParser.NotificationInput]
 * mirroring the documented Android `Notification.extras` shape for that
 * scenario. All addresses, names, and numbers are synthetic placeholders
 * (RFC-5737-style for phone numbers, generic given names like "Mel" / "Sam"
 * for senders) — never real user data.
 *
 * The shapes themselves come from the production parser's existing handling
 * (see KeryxNotificationListener doc-comment): MessagingStyle's
 * "android.messages" Parcelable[] of bundles with text/sender/time keys, and
 * the simple-notification "android.title" + "android.text" / "android.bigText"
 * fallback path.
 */
class BridgeParserTest {

    private val GOOG_STABLE = "com.google.android.apps.messaging"
    private val GOOG_BETA = "com.google.android.apps.messaging.beta"
    private val SAMSUNG = "com.samsung.android.messaging"

    /** Fixed reference time so timestamp assertions are deterministic. */
    private val POST_TIME = 1_700_000_000_000L
    private val POST_TIME_ISO = "2023-11-14T22:13:20Z"

    // ─────────────────────────────────────────────────────────────────────
    // 1. Incoming RCS — MessagingStyle (single message)
    // ─────────────────────────────────────────────────────────────────────
    @Test
    fun `messagingStyle incoming single message — single received payload`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            messagingStyleMessages = listOf(
                BridgeParser.MessagingStyleMessage(
                    text = "Heading out, see you in 10",
                    sender = "Mel",
                    timeMs = POST_TIME,
                )
            ),
        )

        val result = BridgeParser.parseNotification(input)

        assertNull("no skip on a healthy notification", result.skip)
        assertEquals(1, result.payloads.size)
        val p = result.payloads[0]
        assertEquals(BridgeParser.Direction.RECEIVED, p.direction)
        assertEquals("Heading out, see you in 10", p.body)
        assertEquals("Mel", p.address)        // alphanumeric → passthrough
        assertEquals("Mel", p.name)            // unchanged → name retained
        assertEquals(POST_TIME_ISO, p.timestampIso)
    }

    @Test
    fun `messagingStyle incoming with E164-looking sender normalizes address and drops name`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            messagingStyleMessages = listOf(
                BridgeParser.MessagingStyleMessage(
                    text = "Your code is 123456",
                    // Plausible US number in display form (synthetic test number).
                    sender = "(555) 555-0142",
                    timeMs = POST_TIME,
                )
            ),
        )

        val result = BridgeParser.parseNotification(input)

        assertEquals(1, result.payloads.size)
        val p = result.payloads[0]
        assertEquals(BridgeParser.Direction.RECEIVED, p.direction)
        assertEquals("Your code is 123456", p.body)
        // Whether libphonenumber accepts a 555-0142 number depends on its
        // validity table. We accept either the normalized E.164 form or the
        // verbatim string per PhoneNormalizer's documented contract — but in
        // the verbatim case `name` must equal the raw sender, while in the
        // normalized case `name` must be null.
        if (p.address.startsWith("+")) {
            assertNull("name dropped when address normalized", p.name)
        } else {
            assertEquals("(555) 555-0142", p.name)
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Outgoing RCS — MessagingStyle (sender null/blank/self-label)
    // ─────────────────────────────────────────────────────────────────────
    @Test
    fun `messagingStyle outgoing — null sender produces sent payload to outgoing`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            messagingStyleMessages = listOf(
                BridgeParser.MessagingStyleMessage(
                    text = "On my way",
                    sender = null,
                    timeMs = POST_TIME,
                )
            ),
        )

        val result = BridgeParser.parseNotification(input)
        assertEquals(1, result.payloads.size)
        val p = result.payloads[0]
        assertEquals(BridgeParser.Direction.SENT, p.direction)
        assertEquals("outgoing", p.address)
        assertEquals("On my way", p.body)
        assertNull(p.name)
    }

    @Test
    fun `messagingStyle outgoing — self-label sender 'You' produces sent payload`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            messagingStyleMessages = listOf(
                BridgeParser.MessagingStyleMessage(
                    text = "Sounds good",
                    sender = "You",
                    timeMs = POST_TIME,
                )
            ),
        )

        val result = BridgeParser.parseNotification(input)
        assertEquals(1, result.payloads.size)
        assertEquals(BridgeParser.Direction.SENT, result.payloads[0].direction)
        assertEquals("Sounds good", result.payloads[0].body)
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. Group chat — MessagingStyle multi-message bundle
    // ─────────────────────────────────────────────────────────────────────
    @Test
    fun `group chat with multiple senders produces one payload per message in order`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            messagingStyleMessages = listOf(
                BridgeParser.MessagingStyleMessage("hey", "Mel", POST_TIME),
                BridgeParser.MessagingStyleMessage("yo",  "Sam", POST_TIME + 1000),
                BridgeParser.MessagingStyleMessage("k",   null,  POST_TIME + 2000), // self
            ),
        )

        val result = BridgeParser.parseNotification(input)
        assertNull(result.skip)
        assertEquals(3, result.payloads.size)
        assertEquals("Mel", result.payloads[0].address)
        assertEquals(BridgeParser.Direction.RECEIVED, result.payloads[0].direction)
        assertEquals("Sam", result.payloads[1].address)
        assertEquals(BridgeParser.Direction.RECEIVED, result.payloads[1].direction)
        assertEquals("outgoing", result.payloads[2].address)
        assertEquals(BridgeParser.Direction.SENT, result.payloads[2].direction)
    }

    @Test
    fun `messagingStyle skips blank message bodies`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            messagingStyleMessages = listOf(
                BridgeParser.MessagingStyleMessage("", "Mel", POST_TIME),
                BridgeParser.MessagingStyleMessage("  \t  ", "Sam", POST_TIME),
                BridgeParser.MessagingStyleMessage("real", "Jamie", POST_TIME),
            ),
        )
        val result = BridgeParser.parseNotification(input)
        assertEquals(1, result.payloads.size)
        assertEquals("real", result.payloads[0].body)
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. Incoming SMS — simple notification (no MessagingStyle)
    // ─────────────────────────────────────────────────────────────────────
    @Test
    fun `simple SMS notification — title plus text yields received payload`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            title = "Mel",
            text = "Need anything from the store?",
        )
        val result = BridgeParser.parseNotification(input)
        assertNull(result.skip)
        assertEquals(1, result.payloads.size)
        val p = result.payloads[0]
        assertEquals(BridgeParser.Direction.RECEIVED, p.direction)
        assertEquals("Mel", p.address)
        assertEquals("Need anything from the store?", p.body)
        assertEquals("Mel", p.name)
    }

    @Test
    fun `simple notification falls back to bigText when text missing`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            title = "Mel",
            text = null,
            bigText = "Long message body that lives in bigText",
        )
        val result = BridgeParser.parseNotification(input)
        assertEquals(1, result.payloads.size)
        assertEquals("Long message body that lives in bigText", result.payloads[0].body)
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. Outgoing SMS/RCS — simple notification with status template
    // ─────────────────────────────────────────────────────────────────────
    @Test
    fun `simple outgoing — title 'You' yields sent payload with text body`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            title = "You",
            text = "Confirmed for tomorrow",
        )
        val result = BridgeParser.parseNotification(input)
        assertEquals(1, result.payloads.size)
        val p = result.payloads[0]
        assertEquals(BridgeParser.Direction.SENT, p.direction)
        assertEquals("outgoing", p.address)
        assertEquals("Confirmed for tomorrow", p.body)
    }

    @Test
    fun `simple outgoing — 'Sent to Mel' title with body in text yields sent payload`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            title = "Sent to Mel",
            text = "Confirmed for tomorrow",
        )
        val result = BridgeParser.parseNotification(input)
        assertEquals(1, result.payloads.size)
        assertEquals(BridgeParser.Direction.SENT, result.payloads[0].direction)
        assertEquals("Confirmed for tomorrow", result.payloads[0].body)
    }

    @Test
    fun `simple outgoing — pure status text 'Message sent' produces parse_skip diagnostic`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            title = "You",
            text = "Message sent",
        )
        val result = BridgeParser.parseNotification(input)
        assertTrue(result.payloads.isEmpty())
        assertNotNull(result.skip)
        assertEquals(BridgeParser.SkipReason.SENT_CLASSIFIED_BUT_NO_BODY, result.skip!!.reason)
        assertTrue("status-only sent should fire a diagnostic", result.skip!!.diagnostic)
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. Negative cases — silent skips that must NOT fire diagnostics
    // ─────────────────────────────────────────────────────────────────────
    @Test
    fun `count-only summary text produces silent skip — no payloads, no diagnostic`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            title = "Messages",
            text = "3 new messages",
        )
        val result = BridgeParser.parseNotification(input)
        assertTrue(result.payloads.isEmpty())
        assertNotNull(result.skip)
        assertEquals(BridgeParser.SkipReason.COUNT_ONLY_TEXT, result.skip!!.reason)
        assertFalse("count-only summaries are expected — must NOT diagnostic", result.skip!!.diagnostic)
    }

    @Test
    fun `group summary notification is skipped silently`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            title = "Messages",
            text = "anything",
            isGroupSummary = true,
        )
        val result = BridgeParser.parseNotification(input)
        assertTrue(result.payloads.isEmpty())
        assertNotNull(result.skip)
        assertEquals(BridgeParser.SkipReason.GROUP_SUMMARY, result.skip!!.reason)
        assertFalse(result.skip!!.diagnostic)
    }

    @Test
    fun `unsupported package is skipped silently`() {
        val input = baseInput(
            packageName = "com.whatsapp",
            title = "Mel",
            text = "hi",
        )
        val result = BridgeParser.parseNotification(input)
        assertTrue(result.payloads.isEmpty())
        assertEquals(BridgeParser.SkipReason.UNSUPPORTED_PACKAGE, result.skip?.reason)
        assertFalse(result.skip!!.diagnostic)
    }

    @Test
    fun `simple path missing fields fires diagnostic`() {
        val input = baseInput(
            packageName = GOOG_STABLE,
            title = null,
            text = null,
        )
        val result = BridgeParser.parseNotification(input)
        assertTrue(result.payloads.isEmpty())
        assertEquals(BridgeParser.SkipReason.SIMPLE_PATH_MISSING_FIELDS, result.skip?.reason)
        assertTrue(result.skip!!.diagnostic)
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. Multi-package — same parsing applies to all Messages-family pkgs
    // ─────────────────────────────────────────────────────────────────────
    @Test
    fun `parser accepts Google Messages stable beta and Samsung Messages identically`() {
        for (pkg in listOf(GOOG_STABLE, GOOG_BETA, SAMSUNG)) {
            val result = BridgeParser.parseNotification(
                baseInput(
                    packageName = pkg,
                    messagingStyleMessages = listOf(
                        BridgeParser.MessagingStyleMessage("hi", "Mel", POST_TIME)
                    )
                )
            )
            assertNull("$pkg should not skip", result.skip)
            assertEquals("$pkg should produce 1 payload", 1, result.payloads.size)
            assertEquals("Mel", result.payloads[0].address)
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 8. Anti-misclassification — real incoming bodies must NEVER look sent
    // ─────────────────────────────────────────────────────────────────────
    @Test
    fun `incoming body containing the word 'delivered' is not classified as sent`() {
        // Real-world hazard: the parser's outgoing-RCS classifier is intentionally
        // narrow so a contact saying "delivered" or "you sent that?" doesn't get
        // mis-routed as outgoing.
        val cases = listOf(
            "Mel" to "Package was delivered today",
            "Sam" to "did you sent that contract?",   // sic — typo plausible
            "Jamie" to "Sent the wrong file lol",
        )
        for ((title, text) in cases) {
            val input = baseInput(packageName = GOOG_STABLE, title = title, text = text)
            val result = BridgeParser.parseNotification(input)
            assertEquals("title=$title text=$text should be received", 1, result.payloads.size)
            assertEquals(
                "title=$title text=$text must NOT be classified as sent",
                BridgeParser.Direction.RECEIVED,
                result.payloads[0].direction,
            )
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────
    private fun baseInput(
        packageName: String,
        title: String? = null,
        text: String? = null,
        bigText: String? = null,
        messagingStyleMessages: List<BridgeParser.MessagingStyleMessage>? = null,
        postTimeMs: Long = POST_TIME,
        isGroupSummary: Boolean = false,
    ): BridgeParser.NotificationInput = BridgeParser.NotificationInput(
        packageName = packageName,
        postTimeMs = postTimeMs,
        title = title,
        text = text,
        bigText = bigText,
        messagingStyleMessages = messagingStyleMessages,
        isGroupSummary = isGroupSummary,
    )
}
