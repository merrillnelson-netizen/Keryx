package app.keryx.bridge.parser

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Auto-discovering test for **real on-device** notification fixtures.
 *
 * Why this is separate from [BridgeParserFixturesTest]
 * ────────────────────────────────────────────────────
 * The synthetic fixtures next door pin the parser's *current* behavior.
 * They cannot catch surprises like Google Messages packing a field in a
 * shape we didn't anticipate. Capturing real fixtures from a working
 * device closes that gap — but only an engineer with a phone running
 * the Bridge can produce them. Until any are committed, this test
 * passes trivially (no assertions are skipped — the loop just has zero
 * iterations).
 *
 * How to add one
 * ──────────────
 *   1. Capture the JSON dump using [BridgeFixtureDump] — see
 *      `android-bridge/CAPTURING_FIXTURES.md`.
 *   2. Anonymize phone numbers, contact names, and message bodies.
 *   3. Fill in the `description` and `expected` blocks (mirror the
 *      schema in `incoming_rcs_messagingstyle.json`).
 *   4. Save it as
 *      `android-bridge/app/src/test/resources/fixtures/real/<scenario>.json`.
 *   5. Run `./gradlew test`. The new file is picked up automatically —
 *      no Kotlin edits required here.
 *
 * Discovery happens at test time by scanning the classpath for
 * `fixtures/real/`. We deliberately don't use JUnit Parameterized so
 * adding a fixture truly is a "drop a file in" operation.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class BridgeParserRealFixturesTest {

    @Test
    fun all_real_fixtures() {
        val fixtures = discoverRealFixtures()
        if (fixtures.isEmpty()) {
            // No captures yet. Test passes — see the class doc-comment for
            // how to add the first one. We log to stdout (visible in
            // `./gradlew test --info`) so it's discoverable without
            // failing the build.
            println("[BridgeParserRealFixturesTest] No real fixtures present in fixtures/real/ — skipping.")
            return
        }

        val failures = mutableListOf<String>()
        for (resourcePath in fixtures) {
            try {
                FixtureRunner.runFixture(resourcePath)
            } catch (e: AssertionError) {
                failures += "$resourcePath — ${e.message}"
            } catch (e: Exception) {
                failures += "$resourcePath — ${e.javaClass.simpleName}: ${e.message}"
            }
        }
        if (failures.isNotEmpty()) {
            throw AssertionError(
                "Real-fixture regressions (${failures.size}/${fixtures.size}):\n" +
                    failures.joinToString("\n")
            )
        }
    }

    /**
     * Returns classpath resource paths (e.g. `fixtures/real/foo.json`)
     * for every `*.json` under `fixtures/real/`. Resolves the directory
     * via the classloader so it works under both Gradle and IDE runs.
     */
    private fun discoverRealFixtures(): List<String> {
        val dirUrl = javaClass.classLoader?.getResource("fixtures/real/") ?: return emptyList()
        val dir = File(dirUrl.toURI())
        if (!dir.isDirectory) return emptyList()
        return dir.listFiles { f -> f.isFile && f.name.endsWith(".json") }
            ?.sortedBy { it.name }
            ?.map { "fixtures/real/${it.name}" }
            .orEmpty()
    }
}
