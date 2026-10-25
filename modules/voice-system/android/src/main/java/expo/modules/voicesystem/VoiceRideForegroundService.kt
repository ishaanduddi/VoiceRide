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
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps VoiceRiders' microphone usable with the screen
 * off.
 *
 * Android 9+ blocks microphone access for apps that are merely in the
 * background, and Android 12+ freezes background processes. A foreground
 * service of type `microphone` is the supported way to keep listening, which is
 * exactly what a rider needs: the phone stays in a pocket with the screen off.
 */
class VoiceRideForegroundService : Service() {

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

    // If the OS kills the process, there is no JS left to consume audio, so
    // restarting the service would only show a stale notification.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    super.onDestroy()
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

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("VoiceRiders is listening")
      .setContentText("Say a command — the screen can stay off")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(contentIntent)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "voiceriders_ride_mode"
    private const val NOTIFICATION_ID = 4711
  }
}
