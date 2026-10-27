package expo.modules.voicesystem

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Foreground service that keeps VoiceRiders' microphone usable with the screen
 * off.
 *
 * Android 9+ blocks microphone access for apps that are merely in the
 * background, and Android 12+ freezes background processes. A foreground
 * service of type `microphone` is the supported way to keep listening.
 *
 * A foreground service alone is not always enough on aggressive OEM builds
 * (vivo/OriginOS, MIUI, EMUI): they can still throttle or freeze the process.
 * Two extra measures are taken here:
 *
 *  - a **partial wake lock**, so the CPU does not suspend between audio buffers
 *    (the mic indicator can stay lit while the JS thread never runs);
 *  - the service reports [isRunning] so the UI can show whether background
 *    listening is really active instead of assuming it.
 *
 * Deliberately built on the platform `Notification.Builder` (no androidx
 * dependency) so the module stays easy to compile.
 */
class VoiceRideForegroundService : Service() {

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    isRunning = true
    acquireWakeLock()

    // If the OS kills the process, there is no JS left to consume audio, so
    // restarting the service would only show a stale notification.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    isRunning = false
    releaseWakeLock()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    super.onDestroy()
  }

  private fun acquireWakeLock() {
    if (wakeLock != null) return

    val manager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    try {
      wakeLock = manager
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VoiceRiders:ride")
        .apply {
          setReferenceCounted(false)
          acquire()
        }
    } catch (error: Exception) {
      android.util.Log.w("VoiceSystem", "could not acquire the ride wake lock", error)
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.release()
    } catch (error: Exception) {
      android.util.Log.w("VoiceSystem", "could not release the ride wake lock", error)
    }
    wakeLock = null
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Ride Mode",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Keeps voice commands working while the screen is off"
      setShowBadge(false)
    }

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    manager?.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle("VoiceRiders is listening")
      .setContentText("Say a command — the screen can stay off")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(Notification.PRIORITY_LOW)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setContentIntent(contentIntent)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "voiceriders_ride_mode"
    private const val NOTIFICATION_ID = 4711

    /** True while the service is in the foreground; read from JS for diagnostics. */
    @Volatile
    var isRunning: Boolean = false
      private set
  }
}
