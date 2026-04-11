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
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import app.keryx.bridge.network.RelayClient
import app.keryx.bridge.network.ServiceRestartWorker
import app.keryx.bridge.util.PhoneNormalizer
import app.keryx.bridge.util.Prefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant

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
        // Startup backfill: catch any sent SMS that arrived while the service was down.
        // On fresh install this also initialises the checkpoint so we don't flood the
        // server with the user's entire SMS history.
        checkForNewSentSms()
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
     * Queries new sent SMS rows and relays them with checkpoint safety.
     *
     * Design note — immediate send vs. debounce buffer:
     * The notification listener (incoming messages) uses [RelayClient.enqueue] which batches
     * via a 2.5s debounce buffer. The SMS content-observer path intentionally uses
     * [RelayClient.sendOrQueue] (immediate send) because it requires a per-message durability
     * acknowledgement to safely advance the `_id` checkpoint. Batching multiple rows into the
     * debounce buffer would make it impossible to know which individual `_id` values are safe
     * to checkpoint on a partial success.
     *
     * Flow for each new row:
     * 1. Call [RelayClient.sendOrQueue] — attempts immediate HTTP POST first.
     *    - On 2xx success: delivered; returns `true`.
     *    - On 5xx/network error: durably written to Room for [RetryWorker]; returns `true`.
     *    - On 4xx (bad config): dropped permanently; returns `false`.
     * 2. Advance [Prefs.lastSentSmsId] ONLY when `sendOrQueue` returns `true` — meaning the
     *    message is either confirmed delivered or durably queued for retry.
     *    If `false` (4xx): stop processing further rows without advancing checkpoint.
     *
     * At-least-once semantics: if the process dies between successful relay and checkpoint write,
     * the same row is re-queried on next observer callback and relayed again — acceptable.
     */
    private fun checkForNewSentSms() {
        val prefs = Prefs.get(applicationContext)
        if (!prefs.enabled || !prefs.isConfigured()) return

        lifecycleScope.launch(Dispatchers.IO) {
            val lastId = prefs.lastSentSmsId

            // Fresh install: initialise checkpoint to the current max _id so we
            // only relay NEW messages going forward and avoid flooding the server
            // with the user's entire SMS history on first run.
            if (lastId < 0) {
                val maxId = queryMaxSentSmsId()
                prefs.lastSentSmsId = if (maxId >= 0) maxId else 0L
                Log.d(TAG, "Fresh install: SMS checkpoint initialised to _id=$maxId")
                return@launch
            }

            val projection = arrayOf("_id", "address", "body", "date")
            val selection = "_id > ?"
            val selectionArgs = arrayOf(lastId.toString())

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

            val relay = RelayClient.get(applicationContext)

            for (row in newRows) {
                val normalizedAddress = PhoneNormalizer.normalize(row.address)
                val timestampIso = Instant.ofEpochMilli(row.dateMs).toString()

                val payload = RelayClient.RelayPayload(
                    address = normalizedAddress,
                    body = row.body,
                    direction = "sent",
                    timestamp = timestampIso
                )

                // Step 1: attempt immediate relay; Room-queue on transient failure.
                // Returns true when message is either delivered OR durably in Room.
                val durable = relay.sendOrQueue(payload)

                if (durable) {
                    // Step 2: advance checkpoint ONLY after durable outcome confirmed.
                    prefs.lastSentSmsId = row.rowId
                    Log.d(TAG, "Checkpoint advanced to _id=${row.rowId} for $normalizedAddress")
                } else {
                    // 4xx — message dropped due to bad config; stop processing further rows
                    // to avoid silently dropping the rest (they'll retry on next observer event).
                    Log.e(TAG, "Stopping checkpoint at _id=${row.rowId} — 4xx error (check API key)")
                    break
                }
            }
        }
    }

    /**
     * Returns the largest _id currently in content://sms/sent, or -1 if empty.
     * Used to set the initial checkpoint on fresh install so we don't relay
     * the user's entire SMS history.
     */
    private fun queryMaxSentSmsId(): Long {
        return try {
            contentResolver.query(
                SMS_SENT_URI,
                arrayOf("_id"),
                null, null,
                "_id DESC"
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val col = cursor.getColumnIndex("_id")
                    if (col >= 0) cursor.getLong(col) else -1L
                } else -1L
            } ?: -1L
        } catch (e: Exception) {
            Log.e(TAG, "Error querying max SMS _id: ${e.message}")
            -1L
        }
    }

    companion object {
        @Volatile var isRunning = false
            private set
    }
}
