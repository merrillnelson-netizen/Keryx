package app.keryx.bridge.parser

import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject

/**
 * One-shot debug helper for capturing real on-device notifications as
 * anonymizable JSON fixtures.
 *
 * Why this exists
 * ───────────────
 * The JVM regression tests under `BridgeParserFixturesTest` consume JSON
 * fixtures shaped exactly like the dump produced by [dumpExtras] here. The
 * synthetic fixtures already in `src/test/resources/fixtures/` pin the
 * parser's *current* behavior, but they can't catch surprises where Google
 * Messages packs a field slightly differently than we expect.
 *
 * Capturing a small set of real fixtures from a working device closes that
 * gap — but only an engineer with a real Android device and the Bridge
 * installed can do it. This helper exists to make that capture a one-line
 * change in [KeryxNotificationListener].
 *
 * How to use it
 * ─────────────
 *  1. Flip [DUMP_ENABLED] to `true` (debug only — never ship a release
 *     build with this on; it logs full notification contents to logcat).
 *  2. Build & install the debug APK on your device.
 *  3. `adb logcat -s KeryxFixtureDump:I -v raw > captured.log` while you
 *     trigger the scenario you want to capture (incoming RCS, send a
 *     reply, group chat, etc.).
 *  4. Each captured notification appears as one self-contained JSON
 *     blob, ready to be saved to
 *     `android-bridge/app/src/test/resources/fixtures/real/<scenario>.json`.
 *  5. **Anonymize it before committing**: replace real phone numbers
 *     with `+15555550100`-style placeholders, contact names with `Mel` /
 *     `Sam` / `Jamie`, message bodies with paraphrased equivalents.
 *  6. Add the `expected` block (payloads or skipReason) so the test has
 *     something to assert against. See `incoming_rcs_messagingstyle.json`
 *     for the schema.
 *  7. Flip [DUMP_ENABLED] back to `false` and rebuild before the next
 *     release.
 *
 * See `android-bridge/CAPTURING_FIXTURES.md` for the full walkthrough.
 */
object BridgeFixtureDump {

    /**
     * Master switch. Compile-time constant so the dispatch in the listener
     * compiles down to a no-op when disabled — there is *zero* runtime
     * cost in normal builds, and no risk of a UI toggle accidentally
     * leaving fixture-grade logging on in production.
     */
    const val DUMP_ENABLED: Boolean = false

    /** Logcat tag the listener uses when [DUMP_ENABLED] is on. */
    const val LOG_TAG: String = "KeryxFixtureDump"

    /**
     * Renders a notification's full extras as a JSON blob whose top-level
     * shape matches what `BridgeParserFixturesTest` consumes. The caller
     * still has to fill in the `description` and `expected` blocks by
     * hand after capture.
     *
     * Pure: no Android logging, no I/O. The Service decides where to
     * write the result (typically `Log.i`).
     */
    fun dumpExtras(
        packageName: String,
        postTimeMs: Long,
        isGroupSummary: Boolean,
        extras: Bundle,
    ): String {
        val root = JSONObject()
        root.put("scenario", "REAL_CAPTURE_TODO_RENAME")
        root.put("description", "Captured from a live device — anonymize before committing.")
        root.put("package", packageName)
        root.put("postTimeMs", postTimeMs)
        root.put("isGroupSummary", isGroupSummary)
        root.put("extras", bundleToJson(extras))
        // Stub so the engineer remembers to fill it in before adding the
        // file to the test fixtures directory.
        root.put("expected", JSONObject().apply {
            put("skipReason", JSONObject.NULL)
            put("diagnostic", false)
            put("payloads", JSONArray())
        })
        return root.toString(2)
    }

    /**
     * Recursive Bundle → JSONObject converter. Only emits the keys the
     * fixture test consumer understands — strings, longs, booleans,
     * doubles, nested Bundles, and Parcelable arrays of Bundles (the
     * shape MessagingStyle uses for `android.messages`). Anything else
     * is rendered as a typed marker string so the engineer can see at a
     * glance that the field exists but isn't being captured verbatim.
     */
    private fun bundleToJson(bundle: Bundle): JSONObject {
        val out = JSONObject()
        for (key in bundle.keySet()) {
            val v: Any? = bundle.get(key)
            when (v) {
                null -> out.put(key, JSONObject.NULL)
                is CharSequence -> out.put(key, v.toString())
                is Boolean -> out.put(key, v)
                is Int -> out.put(key, v.toLong())
                is Long -> out.put(key, v)
                is Float -> out.put(key, v.toDouble())
                is Double -> out.put(key, v)
                is Bundle -> out.put(key, bundleToJson(v))
                is Array<*> -> out.put(key, arrayToJson(v))
                else -> out.put(key, "<${v.javaClass.simpleName}>")
            }
        }
        return out
    }

    private fun arrayToJson(arr: Array<*>): JSONArray {
        val out = JSONArray()
        for (item in arr) {
            when (item) {
                null -> out.put(JSONObject.NULL)
                is Bundle -> out.put(bundleToJson(item))
                is CharSequence -> out.put(item.toString())
                is Number -> out.put(item)
                is Boolean -> out.put(item)
                else -> out.put("<${item.javaClass.simpleName}>")
            }
        }
        return out
    }
}
