package app.keryx.bridge.parser

import android.os.Bundle
import android.os.Parcelable
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Fixture-driven regression tests for the notification bridge.
 *
 * Each fixture is an anonymized JSON dump of a `Notification.extras` Bundle
 * shaped exactly the way Google Messages produces them on a real device.
 * The test loads the fixture, reconstructs a real Android [Bundle] (using
 * Robolectric so we don't need an emulator), and runs it through the same
 * code path the production [app.keryx.bridge.KeryxNotificationListener]
 * uses:
 *
 *     Bundle ──► NotificationBundleExtractor ──► BridgeParser
 *
 * That gives us regression protection on **both** the Bundle key/shape
 * extraction *and* the routing/classification logic — not just one or the
 * other. To add a new case, drop a JSON file into
 * `src/test/resources/fixtures/` and add a `@Test` that calls
 * [runFixture] with its name.
 *
 * Adding real on-device fixtures (proposed as a follow-up task) is then a
 * one-line addition here once the JSON has been captured and scrubbed.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class BridgeParserFixturesTest {

    @Test fun incoming_rcs_messagingstyle() = runFixture("incoming_rcs_messagingstyle.json")
    @Test fun outgoing_rcs_messagingstyle() = runFixture("outgoing_rcs_messagingstyle.json")
    @Test fun incoming_sms_simple() = runFixture("incoming_sms_simple.json")
    @Test fun group_chat_messagingstyle() = runFixture("group_chat_messagingstyle.json")
    @Test fun count_only_summary() = runFixture("count_only_summary.json")
    @Test fun group_summary() = runFixture("group_summary.json")

    // -------------------------------------------------------------------- //

    private fun runFixture(name: String) {
        val json = loadFixture(name)
        val extras = buildBundle(json.getJSONObject("extras"))

        // Full production translation path — same call the listener makes.
        val input = NotificationBundleExtractor.extract(
            packageName = json.getString("package"),
            postTimeMs = json.getLong("postTimeMs"),
            extras = extras,
            isGroupSummary = json.getBoolean("isGroupSummary"),
        )
        val result = BridgeParser.parseNotification(input)

        assertExpected(name, result, json.getJSONObject("expected"))
    }

    private fun loadFixture(name: String): JSONObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture resource: fixtures/$name")
        val text = stream.bufferedReader().use { it.readText() }
        return JSONObject(text)
    }

    /** Recursively turn a JSON object into an Android [Bundle]. */
    private fun buildBundle(obj: JSONObject): Bundle {
        val b = Bundle()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val v = obj.get(key)) {
                JSONObject.NULL -> { /* nothing — equivalent to absent */ }
                is String -> b.putCharSequence(key, v)
                is Boolean -> b.putBoolean(key, v)
                is Int -> b.putLong(key, v.toLong())
                is Long -> b.putLong(key, v)
                is Double -> b.putDouble(key, v)
                is JSONArray -> {
                    // Treat arrays as parcelable arrays of inner Bundles
                    // (matches the Notification.MESSAGES_KEY shape Android
                    // uses for MessagingStyle).
                    val arr = Array<Parcelable>(v.length()) { i ->
                        val item = v.get(i)
                        if (item is JSONObject) buildMessageBundle(item)
                        else error("Unsupported array element at $key[$i]: ${item.javaClass}")
                    }
                    b.putParcelableArray(key, arr)
                }
                is JSONObject -> b.putBundle(key, buildBundle(v))
                else -> error("Unsupported JSON value type for key '$key': ${v.javaClass}")
            }
        }
        return b
    }

    /**
     * Build a single MessagingStyle "message" Bundle. We treat `null` sender
     * specially (skip the key entirely) so Bundle.getCharSequence returns
     * null — that's what real Android does for outgoing messages.
     */
    private fun buildMessageBundle(obj: JSONObject): Bundle {
        val b = Bundle()
        if (obj.has("text") && !obj.isNull("text")) {
            b.putCharSequence("text", obj.getString("text"))
        }
        if (obj.has("sender") && !obj.isNull("sender")) {
            b.putCharSequence("sender", obj.getString("sender"))
        }
        if (obj.has("time") && !obj.isNull("time")) {
            b.putLong("time", obj.getLong("time"))
        }
        return b
    }

    // -------------------------------------------------------------------- //

    private fun assertExpected(
        fixtureName: String,
        result: BridgeParser.ParseResult,
        expected: JSONObject,
    ) {
        val tag = "[$fixtureName]"

        val expectedSkipReason = expected.optString("skipReason", "").ifBlank { null }
        if (expectedSkipReason != null) {
            assertNotNull("$tag expected skip but got payloads", result.skip)
            assertTrue(
                "$tag expected no payloads when skipping but got ${result.payloads.size}",
                result.payloads.isEmpty(),
            )
            assertEquals(
                "$tag skip reason mismatch",
                expectedSkipReason,
                result.skip!!.reason.name,
            )
            if (expected.has("diagnostic")) {
                assertEquals(
                    "$tag diagnostic flag mismatch",
                    expected.getBoolean("diagnostic"),
                    result.skip!!.diagnostic,
                )
            }
            return
        }

        assertNull("$tag expected successful parse but got skip ${result.skip?.reason}", result.skip)

        val expectedPayloads = expected.getJSONArray("payloads")
        assertEquals(
            "$tag payload count mismatch",
            expectedPayloads.length(),
            result.payloads.size,
        )

        for (i in 0 until expectedPayloads.length()) {
            val exp = expectedPayloads.getJSONObject(i)
            val actual = result.payloads[i]
            val ptag = "$tag payload[$i]"

            assertEquals("$ptag direction", exp.getString("direction"), actual.direction.name)
            assertEquals("$ptag address", exp.getString("address"), actual.address)
            assertEquals("$ptag body", exp.getString("body"), actual.body)
            assertEquals("$ptag timestampIso", exp.getString("timestampIso"), actual.timestampIso)
            if (exp.has("name")) {
                val expectedName = if (exp.isNull("name")) null else exp.getString("name")
                assertEquals("$ptag name", expectedName, actual.name)
            }
            // `channel` and `packageName` in fixtures are descriptive only — the
            // RelayPayload model doesn't carry them; the listener attaches them
            // downstream when building the HTTP body. They're documented in the
            // fixture so future readers know what scenario the JSON represents.
        }
    }
}
