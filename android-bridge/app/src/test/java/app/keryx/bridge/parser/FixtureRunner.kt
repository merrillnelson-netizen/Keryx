package app.keryx.bridge.parser

import android.os.Bundle
import android.os.Parcelable
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue

/**
 * Shared loader + assertion helper for JSON-backed bridge parser fixtures.
 *
 * Used by both:
 *   - [BridgeParserFixturesTest]      → synthetic, hand-written fixtures
 *   - [BridgeParserRealFixturesTest]  → real on-device captures (anonymized)
 *
 * Lives outside either test class so both consume the exact same runner —
 * if the synthetic suite passes, real fixtures with the same JSON shape
 * are guaranteed to be exercised through the same code path.
 */
object FixtureRunner {

    /**
     * Loads the fixture JSON at the given classpath resource, runs it
     * through the production translation pipeline (Bundle →
     * NotificationBundleExtractor → BridgeParser), and asserts against
     * the embedded `expected` block.
     */
    fun runFixture(resourcePath: String) {
        val json = loadFixture(resourcePath)
        val extras = buildBundle(json.getJSONObject("extras"))

        val input = NotificationBundleExtractor.extract(
            packageName = json.getString("package"),
            postTimeMs = json.getLong("postTimeMs"),
            extras = extras,
            isGroupSummary = json.getBoolean("isGroupSummary"),
        )
        val result = BridgeParser.parseNotification(input)

        assertExpected(resourcePath, result, json.getJSONObject("expected"))
    }

    fun loadFixture(resourcePath: String): JSONObject {
        val stream = javaClass.classLoader!!.getResourceAsStream(resourcePath)
            ?: error("Missing fixture resource: $resourcePath")
        val text = stream.bufferedReader().use { it.readText() }
        return JSONObject(text)
    }

    /** Recursively turn a JSON object into an Android [Bundle]. */
    fun buildBundle(obj: JSONObject): Bundle {
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
     * Build a single MessagingStyle "message" Bundle. We treat `null`
     * sender specially (skip the key entirely) so Bundle.getCharSequence
     * returns null — that's what real Android does for outgoing messages.
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

    fun assertExpected(
        fixtureName: String,
        result: BridgeParser.ParseResult,
        expected: JSONObject,
    ) {
        val tag = "[$fixtureName]"

        // NB: Android's JSONObject.optString returns the literal string "null"
        // (not "" or Java null) when the JSON value is `null`, because
        // JSON.toString(NULL) routes through String.valueOf(NULL) → "null".
        // Check isNull explicitly so a `"skipReason": null` fixture is treated
        // as "no skip expected" instead of "expected skip reason 'null'".
        val expectedSkipReason: String? = when {
            !expected.has("skipReason") -> null
            expected.isNull("skipReason") -> null
            else -> expected.optString("skipReason", "").ifBlank { null }
        }
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
        }
    }
}
