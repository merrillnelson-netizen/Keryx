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
import androidx.lifecycle.lifecycleScope
import androidx.work.*
import app.keryx.bridge.data.AppDatabase
import app.keryx.bridge.data.PendingRelay
import app.keryx.bridge.network.RelayClient
import app.keryx.bridge.network.RetryWorker
import app.keryx.bridge.network.ServiceRestartWorker
import app.keryx.bridge.util.PhoneNormalizer
import app.keryx.bridge.util.Prefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

private const val TAG = "SmsObserverService"
private const val NOTIFICATION_ID = 1001
private val SMS_SENT_URI: Uri = Uri.parse("content://sms/sent")

/**
 * Foreground service that observes the SMS sent content provider.
 *
 * Checkpoint safety guarantee:
 * Outgoing SMS rows are written to the Room retry queue BEFORE [lastSentSmsId] is
 * advanced. This means that even if the process is killed between the Room insert
 * and the [RetryWorker] delivery, the message survives in Room and will be relayed
 * on the next network reconnect. The checkpoint is only advanced after durable
 * Room storage is confirmed.
 *
 * - Holds a persistent partial WakeLock (acquired in onStartCommand, released in
 *   onDestroy) — critical on Samsung / MIUI which aggressively kill background CPU.
 * - Survives task-swipe via onTaskRemoved → [ServiceRestartWorker].
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

    /**
     * Queries new sent SMS rows and durably queues them BEFORE advancing
     * [Prefs.lastSentSmsId].
     *
     * Flow:
     * 1. Collect new rows (id > lastSentSmsId) from content://sms/sent.
     * 2. For each row: insert to Room [PendingRelay] — this is the durable write.
     * 3. Advance [lastSentSmsId] only after all Room inserts succeed.
     * 4. Schedule [RetryWorker] for immediate delivery; it deletes Room rows on success.
     *
     * If the process is killed between steps 2 and 3: the same rows will be re-queried
     * on the next observer callback (id > old checkpoint) and duplicate Room rows
     * will be created. [RetryWorker] will then relay duplicates — acceptable trade-off
     * (at-least-once delivery).
     */
    private fun checkForNewSentSms() {
        val prefs = Prefs.get(applicationContext)
        if (!prefs.enabled || !prefs.isConfigured()) return

        lifecycleScope.launch(Dispatchers.IO) {
            val lastId = prefs.lastSentSmsId
            val projection = arrayOf("_id", "address", "body", "date")
            val selection = if (lastId >= 0) "_id > ?" else null
            val selectionArgs = if (lastId >= 0) arrayOf(lastId.toString()) else null

            data class SmsRow(val rowId: Long, val address: String, val body: String, val dateMs: Long)

            val newRows = mutableListOf<SmsRow>()

            try {
                contentResolver.query(
                    SMS_SENT_URI, projection, selection, selectionArgs, "_id ASC"
                )?.use { cursor ->
                    if (!cursor.moveToFirst()) return@use

                    val idCol = cursor.getColumnIndex("_id")
                    val addrCol = cursor.getColumnIndex("address")
                    val bodyCol = cursor.getColumnIndex("body")
                    val dateCol = cursor.getColumnIndex("date")

                    do {
                        val rowId = cursor.getLong(idCol)
                        val address = cursor.getString(addrCol) ?: continue
                        val body = cursor.getString(bodyCol) ?: continue
                        val dateMs = cursor.getLong(dateCol).takeIf { it > 0 }
                            ?: System.currentTimeMillis()
                        if (body.isBlank()) continue
                        newRows += SmsRow(rowId, address, body, dateMs)
                    } while (cursor.moveToNext())
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error querying SMS content provider: ${e.message}")
                return@launch
            }

            if (newRows.isEmpty()) return@launch

            // Step 2: durable Room insert BEFORE advancing checkpoint
            val dao = AppDatabase.get(applicationContext).pendingRelayDao()
            var maxId = lastId

            for (row in newRows) {
                val normalizedAddress = PhoneNormalizer.normalize(row.address)
                val timestampIso = Instant.ofEpochMilli(row.dateMs).toString()

                val payloadJson = JSONObject().apply {
                    put("address", normalizedAddress)
                    put("body", row.body)
                    put("direction", "sent")
                    put("timestamp", timestampIso)
                }.toString()

                try {
                    dao.insert(PendingRelay(payloadJson = payloadJson))
                    Log.d(TAG, "Durably queued sent SMS to $normalizedAddress (id=${row.rowId})")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to insert Room row for id=${row.rowId}: ${e.message}")
                    // Do NOT advance checkpoint past this row — it will be retried on next observer
                    break
                }

                if (row.rowId > maxId) maxId = row.rowId
            }

            // Step 3: advance checkpoint ONLY after successful Room inserts
            if (maxId > lastId) {
                prefs.lastSentSmsId = maxId
                prefs.pendingRetryCount = dao.countPending()
                Log.d(TAG, "Checkpoint advanced to _id=$maxId after durable write")
            }

            // Step 4: schedule immediate RetryWorker delivery
            scheduleRetryWorker()
        }
    }

    private fun scheduleRetryWorker() {
        val request = OneTimeWorkRequestBuilder<RetryWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(applicationContext)
            .enqueueUniqueWork("keryx_relay_retry", ExistingWorkPolicy.KEEP, request)
    }

    companion object {
        @Volatile var isRunning = false
            private set
    }

    override fun onBind(intent: Intent?) = super.onBind(intent)
}
