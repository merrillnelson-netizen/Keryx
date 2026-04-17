package app.keryx.bridge.parser

import android.os.Bundle

/**
 * Translates an Android [Bundle] of `Notification.extras` into a pure
 * [BridgeParser.NotificationInput] that the parser can consume without any
 * Android types.
 *
 * Lives outside the Service so it can be exercised by Robolectric-backed
 * fixture tests against real `Bundle` objects, ensuring the
 * Bundle → NotificationInput translation is regression-protected (not just
 * the downstream parsing logic).
 */
object NotificationBundleExtractor {

    /**
     * @param packageName notification's source package (e.g. com.google.android.apps.messaging)
     * @param postTimeMs `StatusBarNotification.postTime` in epoch millis
     * @param extras `Notification.extras` Bundle from the OS
     * @param isGroupSummary true if the notification has FLAG_GROUP_SUMMARY set
     */
    fun extract(
        packageName: String,
        postTimeMs: Long,
        extras: Bundle,
        isGroupSummary: Boolean,
    ): BridgeParser.NotificationInput {
        val title = extras.getCharSequence("android.title")?.toString()
        val text = extras.getCharSequence("android.text")?.toString()
        val bigText = extras.getCharSequence("android.bigText")?.toString()

        val msgArr = extras.getParcelableArray("android.messages")
        val msgList: List<BridgeParser.MessagingStyleMessage>? = msgArr?.mapNotNull { item ->
            val b = item as? Bundle ?: return@mapNotNull null
            BridgeParser.MessagingStyleMessage(
                text = b.getCharSequence("text")?.toString(),
                sender = b.getCharSequence("sender")?.toString(),
                timeMs = b.getLong("time", 0L),
            )
        }

        return BridgeParser.NotificationInput(
            packageName = packageName,
            postTimeMs = postTimeMs,
            title = title,
            text = text,
            bigText = bigText,
            messagingStyleMessages = msgList,
            isGroupSummary = isGroupSummary,
        )
    }
}
