package expo.modules.voicesystem

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

/**
 * Two things the Spotify Web API cannot do for a rider:
 *
 *  1. Change the phone's own media volume. `PUT /me/player/volume` changes
 *     Spotify's internal volume, which many devices refuse ("Restriction
 *     violated"). Riders want the phone volume keys' effect, so this module
 *     drives `AudioManager.STREAM_MUSIC` directly.
 *
 *  2. Keep the microphone alive with the screen off. See
 *     [VoiceRideForegroundService].
 *
 * All values cross the bridge as percentages (0-100) so the JS side never has
 * to know the device's step count.
 */
class VoiceSystemModule : Module() {

  private fun audioManager(): AudioManager? =
    appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun maxVolume(audio: AudioManager): Int =
    audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)

  override fun definition() = ModuleDefinition {
    Name("VoiceSystem")

    /** Current media volume as 0-100. */
    AsyncFunction("getMediaVolume") {
      val audio = audioManager() ?: return@AsyncFunction 0.0
      val max = maxVolume(audio)
      (audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100.0) / max
    }

    /** Sets media volume from 0-100 and returns the level actually applied. */
    AsyncFunction("setMediaVolume") { percent: Double ->
      val audio = audioManager() ?: return@AsyncFunction 0.0
      val max = maxVolume(audio)

      val level = ((percent.coerceIn(0.0, 100.0) / 100.0) * max)
        .roundToInt()
        .coerceIn(0, max)

      // Flag 0: no volume UI. The rider's screen is off and a system popup would
      // be both pointless and distracting.
      audio.setStreamVolume(AudioManager.STREAM_MUSIC, level, 0)

      (level * 100.0) / max
    }

    /** Media volume in device steps, for diagnostics. */
    AsyncFunction("getMediaVolumeSteps") {
      val audio = audioManager() ?: return@AsyncFunction 0
      maxVolume(audio)
    }

    /** Starts the microphone foreground service (no-op if already running). */
    Function("startForegroundService") {
      val context = appContext.reactContext
      if (context != null) {
        val intent = Intent(context, VoiceRideForegroundService::class.java)

        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
          } else {
            context.startService(intent)
          }
        } catch (error: Exception) {
          // Android 12+ can refuse a background start; Ride Mode is started
          // from the foreground, so this is only a safety net.
          android.util.Log.w("VoiceSystem", "could not start the ride service", error)
        }
      }
    }

    /** Stops the foreground service (called when Ride Mode stops). */
    Function("stopForegroundService") {
      val context = appContext.reactContext
      if (context != null) {
        context.stopService(Intent(context, VoiceRideForegroundService::class.java))
      }
    }
  }
}
