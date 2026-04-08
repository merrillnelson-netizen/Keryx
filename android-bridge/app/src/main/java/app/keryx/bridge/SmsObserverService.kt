package app.keryx.bridge

import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import app.keryx.bridge.network.RelayClient
import app.keryx.bridge.network.ServiceRestartWorker
import app.keryx.bridge.util.PhoneNormalizer
import app.keryx.bridge.util.Prefs
import java.time.Instant

private const val TAG = "SmsObserverService"
private const val NOTIFICATION_ID = 1001
private val SMS_SENT_URI: Uri = Uri.parse("content://sms/sent")

/**
 * Foreground service that observes the SMS sent content provider.
 * - Holds a persistent partial WakeLock (acquired in onStartCommand, held until onDestroy)
 *   to prevent the CPU from sleeping mid-query — critical on Samsung/Xiaomi MIUI.
 * - Publishes a persistent "Keryx Bridge is active" notification.
 * - Survives task-swipe via onTaskRemoved → ServiceRestartWorker.
 */
class SmsObserverService : LifecycleService() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var smsObserver: ContentObserver? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        startForeground(NOTIFICATION_ID, buildNotification())
        registerSmsObserver()
        Log.d(TAG, "SmsObserverService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        // Acquire (or re-acquire) persistent WakeLock here so it is held for
        // the entire service lifetime, surviving any repeated START_STICKY restarts.
        acquireWakeLockIfNeeded()
        Log.d(TAG, "SmsObserverService started (WakeLock held: ${wakeLock?.isHeld})")
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        smsObserver?.let { contentResolver.unregisterContentObserver(it) }
        RelayClient.get(applicationContext).flushNow()
        releaseWakeLock()
        super.onDestroy()
        Log.d(TAG, "SmsObserverService destroyed")
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.w(TAG, "Task removed — scheduling restart via WorkManager")
        WorkManager.getInstance(applicationContext)
            .enqueue(OneTimeWorkRequestBuilder<ServiceRestartWorker>().build())
    }

    private fun acquireWakeLockIfNeeded() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(PowerManager::class.java) ?: return
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "KeryxBridge:SmsObserverWakeLock"
        ).also {
            it.setReferenceCounted(false)
            it.acquire() // No timeout — released explicitly in onDestroy
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    private fun buildNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, KeryxBridgeApp.CHANNEL_SERVICE)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.service_running))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun registerSmsObserver() {
        val handler = Handler(Looper.getMainLooper())
        smsObserver = object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean) {
                onChange(selfChange, null)
            }

            override fun onChange(selfChange: Boolean, uri: Uri?) {
                checkForNewSentSms()
            }
        }
        contentResolver.registerContentObserver(SMS_SENT_URI, true, smsObserver!!)
        Log.d(TAG, "SMS ContentObserver registered on $SMS_SENT_URI")
    }

    private fun checkForNewSentSms() {
        val prefs = Prefs.get(applicationContext)
        if (!prefs.enabled || !prefs.isConfigured()) return

        val lastId = prefs.lastSentSmsId
        val projection = arrayOf("_id", "address", "body", "date")
        val selection = if (lastId >= 0) "_id > ?" else null
        val selectionArgs = if (lastId >= 0) arrayOf(lastId.toString()) else null

        try {
            contentResolver.query(
                SMS_SENT_URI, projection, selection, selectionArgs, "_id ASC"
            )?.use { cursor ->
                if (!cursor.moveToFirst()) return

                val idCol = cursor.getColumnIndex("_id")
                val addrCol = cursor.getColumnIndex("address")
                val bodyCol = cursor.getColumnIndex("body")
                val dateCol = cursor.getColumnIndex("date")

                var maxId = lastId
                do {
                    val rowId = cursor.getLong(idCol)
                    val address = cursor.getString(addrCol) ?: continue
                    val body = cursor.getString(bodyCol) ?: continue
                    val dateMs = cursor.getLong(dateCol).takeIf { it > 0 }
                        ?: System.currentTimeMillis()

                    if (body.isBlank()) continue

                    val normalizedAddress = PhoneNormalizer.normalize(address)
                    val timestampIso = Instant.ofEpochMilli(dateMs).toString()

                    Log.d(TAG, "Sent SMS to $normalizedAddress: \"${body.take(40)}\"")

                    RelayClient.get(applicationContext).enqueue(
                        RelayClient.RelayPayload(
                            address = normalizedAddress,
                            body = body,
                            direction = "sent",
                            timestamp = timestampIso
                        )
                    )

                    if (rowId > maxId) maxId = rowId
                } while (cursor.moveToNext())

                if (maxId > lastId) {
                    prefs.lastSentSmsId = maxId
                    Log.d(TAG, "Updated lastSentSmsId to $maxId")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying SMS content provider: ${e.message}")
        }
    }

    companion object {
        /**
         * Returns true if this service is currently running.
         * Set in onCreate/onDestroy. Used by MainActivity to reflect live status.
         */
        @Volatile var isRunning = false
            private set
    }

    override fun onBind(intent: Intent?) = super.onBind(intent)
}
