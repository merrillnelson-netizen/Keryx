package app.keryx.bridge.parser

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Fixture-driven regression tests for the notification bridge.
 *
 * Each fixture is an anonymized JSON dump of a `Notification.extras`
 * Bundle shaped exactly the way Google Messages produces them on a real
 * device. The test loads the fixture, reconstructs a real Android
 * `Bundle` (using Robolectric so we don't need an emulator), and runs it
 * through the same code path the production
 * [app.keryx.bridge.KeryxNotificationListener] uses:
 *
 *     Bundle ──► NotificationBundleExtractor ──► BridgeParser
 *
 * That gives us regression protection on **both** the Bundle key/shape
 * extraction *and* the routing/classification logic.
 *
 * The fixtures here are hand-written synthetic shapes. Real on-device
 * captures live next to them under `fixtures/real/` and are exercised by
 * [BridgeParserRealFixturesTest].
 *
 * Loader and assertion logic is shared via [FixtureRunner] so both suites
 * run through identical code.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class BridgeParserFixturesTest {

    @Test fun incoming_rcs_messagingstyle() = run("incoming_rcs_messagingstyle.json")
    @Test fun outgoing_rcs_messagingstyle() = run("outgoing_rcs_messagingstyle.json")
    @Test fun incoming_sms_simple() = run("incoming_sms_simple.json")
    @Test fun group_chat_messagingstyle() = run("group_chat_messagingstyle.json")
    @Test fun count_only_summary() = run("count_only_summary.json")
    @Test fun group_summary() = run("group_summary.json")

    private fun run(name: String) = FixtureRunner.runFixture("fixtures/$name")
}
