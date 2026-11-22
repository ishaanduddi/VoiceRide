package expo.modules.voicesystem

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.session.MediaController
import android.media.session.MediaSession
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Three things the Spotify Web API and `expo-audio` cannot do for a rider:
 *
 *  1. Change the phone's own media volume. `PUT /me/player/volume` changes
 *     Spotify's internal volume, which many devices refuse ("Restriction
 *     violated").
 *
 *  2. Keep the microphone alive with the screen off. See
 *     [VoiceRideForegroundService].
 *
 *  3. Choose WHICH microphone is used. `expo-audio`'s `AudioStream` always opens
 *     the platform default input, so with earphones connected the rider could not
 *     force the headset mic. This module opens its own [AudioRecord] and calls
 *     `setPreferredDevice`, which is the only Android API that actually pins the
 *     input.
 *
 * Volume values cross the bridge as percentages (0-100, or -1 when the audio
 * service cannot be reached) so the JS side never has to know the device's step
 * count. Captured audio is emitted as 100 ms chunks of mono little-endian
 * float32 (`audioBuffer` event).
 */
class VoiceSystemModule : Module() {

  private var captureRecord: AudioRecord? = null
  private var captureJob: Job? = null
  private val captureScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private var activeInputName: String? = null

  /**
   * Application context held for the life of the module.
   *
   * `appContext.reactContext` can be unavailable while the app sits in the
   * background with the screen off — exactly when a rider says "increase
   * volume". Falling back to a stored application context keeps `AudioManager`
   * reachable, instead of the volume APIs silently reporting 0%.
   */
  private var applicationContext: Context? = null

  /**
   * A private, never-activated media session used only to send volume steps.
   *
   * `MediaController.adjustVolume` on a local-playback session is forwarded by
   * the system's media session service to AudioService — the route the
   * hardware volume keys take. It is never set active, so it never takes
   * media buttons or the "now playing" slot away from Spotify.
   */
  private var volumeSession: MediaSession? = null

  private fun volumeController(): MediaController? {
    val context = applicationContext ?: appContext.reactContext ?: return null
    val session = volumeSession ?: try {
      MediaSession(context, "VoiceRidersVolume").also { created ->
        created.setPlaybackToLocal(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()
        )
        volumeSession = created
      }
    } catch (error: Exception) {
      android.util.Log.w("VoiceSystem", "could not create the volume session", error)
      return null
    }
    return session.controller
  }

  private fun audioManager(): AudioManager? =
    (applicationContext ?: appContext.reactContext)
      ?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun maxVolume(audio: AudioManager): Int =
    audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)

  /**
   * Whether the current output is a Bluetooth device that may own its volume.
   *
   * The deprecated `isBluetoothA2dpOn` / `isBluetoothScoOn` flags miss LE Audio
   * and can flip false while the microphone is open, which made the app report a
   * failure on a route where the step was actually delivered. The output device
   * list is the authoritative answer.
   */
  private fun isBluetoothOutput(audio: AudioManager): Boolean =
    audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { device ->
      device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
        (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
          (device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
            device.type == AudioDeviceInfo.TYPE_BLE_SPEAKER))
    }

  /**
   * Applies `magnitude` volume key presses and returns what actually happened.
   *
   * Shared by `stepMediaVolume(percent)` and `adjustMediaVolume(direction)` so
   * there is literally one implementation of "change the phone's volume".
   */
  private fun applyVolumeStep(
    audio: AudioManager,
    direction: Int,
    magnitude: Int,
  ): Map<String, Any?> {
    val max = maxVolume(audio)
    val before = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
    val delta = if (direction == AudioManager.ADJUST_RAISE) magnitude else -magnitude
    val target = (before + delta).coerceIn(0, max)

    /*
     * Measured on the test phone (vivo I2221, `dumpsys audio` + logcat):
     * AudioService RECEIVES every app volume call but only applies it within a
     * few seconds of the user touching this app's own window. A test-button tap
     * always qualifies; a spoken command (or a typed one — the taps go to the
     * keyboard, a different window) does not, so it is dropped silently, with
     * no error and no VOLUME_CHANGED. The hardware keys always work: they reach
     * AudioService through the media session service, as the system.
     *
     * So after the direct call, try that same media-session route ("session").
     * Try each method in turn and stop the moment the level actually moves, so
     * one command can never apply more than the requested step.
     */
    val attempts: List<Pair<String, () -> Unit>> = listOf(
      "set" to {
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
      },
      "session" to {
        val controller = volumeController()
        if (controller != null) {
          repeat(magnitude) { controller.adjustVolume(direction, 0) }
          // The session service applies it on its own thread: wait for it.
          var waited = 0
          while (waited < 400 && audio.getStreamVolume(AudioManager.STREAM_MUSIC) == before) {
            Thread.sleep(50)
            waited += 50
          }
        }
      },
      "adjust" to {
        repeat(magnitude) {
          audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, 0)
        }
      },
      "set+ui" to {
        // Panel is open by now (or this opens it); a second call applies.
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, AudioManager.FLAG_SHOW_UI)
        if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) == before) {
          Thread.sleep(150)
          audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, AudioManager.FLAG_SHOW_UI)
        }
      },
    )

    /*
     * Last resort: the path the hardware keys take. Two calls, because the
     * first one may only open the volume panel.
     */
    val suggested: Pair<String, () -> Unit> = "suggested" to {
      audio.adjustSuggestedStreamVolume(direction, AudioManager.STREAM_MUSIC, AudioManager.FLAG_SHOW_UI)
      if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) == before) {
        Thread.sleep(150)
        audio.adjustSuggestedStreamVolume(direction, AudioManager.STREAM_MUSIC, AudioManager.FLAG_SHOW_UI)
      }
    }

    var after = before
    var method = "none"

    /*
     * On-screen trace of every attempt and the phone state around it. The
     * button and a voice command run this same function, yet the phone only
     * applies it for the button, so the state at call time is the evidence.
     * Format: "set=2 adjust=2 … | mode=0 music=1 ring=2 dnd=1 late=2".
     */
    val trace = StringBuilder()

    if (target != before) {
      // Two rounds: voice commands sometimes succeed, so the refusal is
      // transient. The second round runs after a short pause.
      rounds@ for (round in 0 until 2) {
        if (round > 0) {
          Thread.sleep(300)
          trace.append("| retry ")
        }
        for ((name, attempt) in attempts + suggested) {
          try {
            attempt()
          } catch (error: Exception) {
            android.util.Log.w("VoiceSystem", "volume $name refused", error)
            trace.append("$name!${error.javaClass.simpleName} ")
          }
          after = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
          trace.append("$name=$after ")
          if (after != before) {
            method = if (round > 0) "$name(retry)" else name
            break@rounds
          }
        }
      }
    }

    val dnd = (appContext.reactContext ?: applicationContext)
      ?.getSystemService(Context.NOTIFICATION_SERVICE)
      ?.let { (it as? android.app.NotificationManager)?.currentInterruptionFilter }
    Thread.sleep(400)
    val late = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
    trace.append(
      "| mode=${audio.mode} music=${if (audio.isMusicActive) 1 else 0} " +
        "ring=${audio.ringerMode} dnd=${dnd ?: "?"} late=$late " +
        "thread=${Thread.currentThread().name.take(16)}"
    )

    /*
     * While the microphone records through a Bluetooth headset, Android can keep
     * music on the voice (SCO) route. Its level is STREAM_VOICE_CALL, not
     * STREAM_MUSIC, so a command issued with the mic open changes a stream the
     * rider cannot hear. Step the call stream too while that route is active; on
     * normal media routing this branch is skipped.
     */
    @Suppress("DEPRECATION")
    val voiceRouteActive =
      audio.isBluetoothScoOn || audio.mode == AudioManager.MODE_IN_COMMUNICATION

    if (voiceRouteActive) {
      val callMax = audio.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL).coerceAtLeast(1)
      val callBefore = audio.getStreamVolume(AudioManager.STREAM_VOICE_CALL)
      val callTarget = (callBefore + delta).coerceIn(0, callMax)

      try {
        audio.setStreamVolume(
          AudioManager.STREAM_VOICE_CALL,
          callTarget,
          AudioManager.FLAG_SHOW_UI
        )
      } catch (error: SecurityException) {
        android.util.Log.w("VoiceSystem", "call volume set refused", error)
      }
    }

    val bluetooth = isBluetoothOutput(audio)

    android.util.Log.i(
      "VoiceSystem",
      "volume step delta=$delta before=$before after=$after max=$max method=$method " +
        "bluetooth=$bluetooth voiceRoute=$voiceRouteActive $trace"
    )

    return mapOf(
      "percent" to (after * 100.0) / max,
      "levelBefore" to before,
      "levelAfter" to after,
      "max" to max,
      "bluetooth" to bluetooth,
      "voiceRoute" to voiceRouteActive,
      "audioMode" to audio.mode,
      "method" to method,
      "trace" to trace.toString().trim()
    )
  }

  /** Inputs that are actually microphones (headset, USB, Bluetooth), best first. */
  private fun preferredInputTypes(): List<Int> {
    val types = mutableListOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      types.add(AudioDeviceInfo.TYPE_BLE_HEADSET)
    }
    return types
  }

  /**
   * `requestedId > 0` pins that exact device; otherwise a connected headset wins
   * over the built-in microphone, which is the "always use my earphones" default.
   */
  private fun chooseInput(devices: List<AudioDeviceInfo>, requestedId: Int): AudioDeviceInfo? {
    if (requestedId > 0) {
      devices.firstOrNull { it.id == requestedId }?.let { return it }
    }

    val preferred = preferredInputTypes()
    return devices.firstOrNull { it.type in preferred }
      ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }
      ?: devices.firstOrNull()
  }

  private fun inputTypeName(type: Int): String = when (type) {
    AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Built-in microphone"
    AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired headset"
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "Wired headphones"
    AudioDeviceInfo.TYPE_USB_HEADSET -> "USB headset"
    AudioDeviceInfo.TYPE_USB_DEVICE -> "USB audio"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth headset"
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "Bluetooth audio"
    AudioDeviceInfo.TYPE_TELEPHONY -> "Call audio"
    else ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && type == AudioDeviceInfo.TYPE_BLE_HEADSET) {
        "Bluetooth LE headset"
      } else {
        "Audio input"
      }
  }

  private fun stopCapture() {
    captureJob?.cancel()
    captureJob = null

    captureRecord?.let { record ->
      try {
        record.stop()
      } catch (_: IllegalStateException) {
        // Already stopped.
      }
      record.release()
    }
    captureRecord = null
    activeInputName = null
  }

  override fun definition() = ModuleDefinition {
    Name("VoiceSystem")

    OnCreate {
      applicationContext = appContext.reactContext?.applicationContext
    }

    Events("audioBuffer")

    // ---------------------------------------------------------------- volume

    /** Current media volume as 0-100, or -1 when the audio service is unreachable. */
    AsyncFunction("getMediaVolume") {
      val audio = audioManager() ?: return@AsyncFunction -1.0
      val max = maxVolume(audio)
      (audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100.0) / max
    }

    /** Sets media volume from 0-100 and returns the level actually applied (-1 on failure). */
    AsyncFunction("setMediaVolume") { percent: Double ->
      val audio = audioManager() ?: return@AsyncFunction -1.0
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

    /**
     * Whether sound is currently going out over Bluetooth. Phone media volume
     * does not adjust a headset's own volume, so the reply has to say so instead
     * of pretending the level changed.
     */
    AsyncFunction("isBluetoothAudioActive") {
      val audio = audioManager() ?: return@AsyncFunction false
      isBluetoothOutput(audio)
    }

    /**
     * Moves media volume by at least one hardware step.
     *
     * `adjustStreamVolume` is exactly what the hardware volume keys call. It also
     * copes with Bluetooth absolute volume and devices where `setStreamVolume`
     * is silently ignored, which is why plain percentage maths was not enough.
     * If the OEM framework still ignores it, the stream index is set directly.
     *
     * Returns the raw levels around the change, not just a percentage: a caller
     * must know whether the stream *moved* before it can claim "maximum" or
     * "minimum", and a percentage alone cannot tell that apart from rounding.
     */
    AsyncFunction("stepMediaVolume") { deltaPercent: Double ->
      val audio = audioManager() ?: return@AsyncFunction emptyMap<String, Any?>()
      val direction = if (deltaPercent >= 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
      val magnitude = max(1, (kotlin.math.abs(deltaPercent) / 100.0 * maxVolume(audio)).roundToInt())
      applyVolumeStep(audio, direction, magnitude)
    }

    /**
     * One hardware volume step, exactly what a volume key press does.
     *
     * Voice commands and the Ride Mode test buttons use this, so the amount is
     * fixed and predefined instead of being derived from a percentage.
     */
    AsyncFunction("adjustMediaVolume") { direction: Int ->
      val audio = audioManager() ?: return@AsyncFunction emptyMap<String, Any?>()
      val key = if (direction >= 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
      applyVolumeStep(audio, key, 1)
    }

    /**
     * Everything needed to explain why a volume command did nothing: the raw
     * level, whether apps are allowed to change it, and whether the sound is
     * going to a Bluetooth device that owns its own volume.
     */
    AsyncFunction("getVolumeDiagnostics") {
      val audio = audioManager() ?: return@AsyncFunction emptyMap<String, Any?>()
      val context = appContext.reactContext
      val max = maxVolume(audio)
      val level = audio.getStreamVolume(AudioManager.STREAM_MUSIC)

      val permissionGranted = context != null && context.checkSelfPermission(
        Manifest.permission.MODIFY_AUDIO_SETTINGS
      ) == PackageManager.PERMISSION_GRANTED

      val bluetooth = isBluetoothOutput(audio)

      mapOf(
        "level" to level,
        "max" to max,
        "percent" to (level * 100.0 / max),
        "isFixedVolume" to audio.isVolumeFixed,
        "hasModifyPermission" to permissionGranted,
        "isBluetooth" to bluetooth
      )
    }

    // ------------------------------------------------------------ microphone

    /**
     * Every available microphone, so the rider can pick one.
     * `id` is Android's AudioDeviceInfo id — pass it to `startCapture`.
     */
    AsyncFunction("listInputs") {
      val audio = audioManager() ?: return@AsyncFunction emptyList<Map<String, Any?>>()

      audio.getDevices(AudioManager.GET_DEVICES_INPUTS)
        .filter { it.isSource }
        .map { device ->
          mapOf(
            "id" to device.id,
            "name" to (device.productName?.toString()?.takeIf { it.isNotBlank() }
              ?: inputTypeName(device.type)),
            "type" to inputTypeName(device.type),
            "isBuiltIn" to (device.type == AudioDeviceInfo.TYPE_BUILTIN_MIC)
          )
        }
    }

    /** Name of the input actually capturing, once `startCapture` has run. */
    AsyncFunction("getActiveInputName") {
      activeInputName
    }

    /**
     * Starts PCM capture. `inputId <= 0` means "automatic": a connected headset
     * is preferred, otherwise the built-in microphone.
     *
     * Returns false when the microphone could not be opened, so JS can fall back
     * to `expo-audio` instead of going silent.
     */
    AsyncFunction("startCapture") { sampleRate: Int, inputId: Int ->
      val context = appContext.reactContext
      val audio = audioManager()

      if (context == null || audio == null) {
        return@AsyncFunction false
      }

      val granted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED

      if (!granted) {
        return@AsyncFunction false
      }

      stopCapture()

      val devices = audio.getDevices(AudioManager.GET_DEVICES_INPUTS).toList()
      val chosenInput = chooseInput(devices, inputId)

      val channelConfig = AudioFormat.CHANNEL_IN_MONO
      val encoding = AudioFormat.ENCODING_PCM_FLOAT
      val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channelConfig, encoding)

      if (minBuffer <= 0) {
        return@AsyncFunction false
      }

      val chunkSamples = max(sampleRate / 10, 160) // ~100 ms
      val bufferBytes = max(minBuffer, chunkSamples * 4 * 2)

      val record = AudioRecord(
        MediaRecorder.AudioSource.MIC,
        sampleRate,
        channelConfig,
        encoding,
        bufferBytes
      )

      if (record.state != AudioRecord.STATE_INITIALIZED) {
        record.release()
        return@AsyncFunction false
      }

      // This is the whole point: pin the input instead of taking the default.
      if (chosenInput != null) {
        record.setPreferredDevice(chosenInput)
      }

      try {
        record.startRecording()
      } catch (error: IllegalStateException) {
        record.release()
        android.util.Log.w("VoiceSystem", "could not start the microphone", error)
        return@AsyncFunction false
      }

      captureRecord = record
      activeInputName = record.routedDevice?.productName?.toString()?.takeIf { it.isNotBlank() }
        ?: chosenInput?.productName?.toString()?.takeIf { it.isNotBlank() }

      captureJob = captureScope.launch {
        val floats = FloatArray(chunkSamples)

        while (isActive) {
          val read = record.read(floats, 0, floats.size, AudioRecord.READ_BLOCKING)

          if (read > 0) {
            val bytes = ByteArray(read * 4)
            ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
              .put(floats, 0, read)

            val payload = mapOf(
              "data" to bytes,
              "sampleRate" to sampleRate,
              "channels" to 1
            )

            // Same delivery path expo-audio uses for its stream: marshal to the
            // app queue, which keeps events flowing when the app is backgrounded.
            appContext.mainQueue.launch {
              sendEvent("audioBuffer", payload)
            }
          } else if (read < 0) {
            break
          }
        }
      }

      true
    }

    /** Stops capture and releases the microphone. */
    Function("stopCapture") {
      stopCapture()
    }

    // ------------------------------------------------------ background service

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

    // --------------------------------------------------------- battery policy

    /** Whether the microphone foreground service is actually in the foreground. */
    AsyncFunction("isForegroundServiceRunning") {
      VoiceRideForegroundService.isRunning
    }

    /**
     * Whether Android is allowed to freeze the app. When this is false, OEM
     * battery managers (vivo/OriginOS especially) can suspend voice processing
     * even though the microphone indicator stays on.
     */
    AsyncFunction("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val manager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        ?: return@AsyncFunction false

      manager.isIgnoringBatteryOptimizations(context.packageName)
    }

    /** Opens the system dialog that exempts the app from battery optimisation. */
    Function("requestIgnoreBatteryOptimizations") {
      val context = appContext.reactContext

      if (context != null) {
        try {
          val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
          intent.data = Uri.parse("package:${context.packageName}")
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        } catch (error: Exception) {
          // Some OEM builds do not ship that dialog; fall back to the list.
          android.util.Log.w("VoiceSystem", "battery optimisation dialog missing", error)
          try {
            context.startActivity(
              Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
          } catch (fallbackError: Exception) {
            android.util.Log.w("VoiceSystem", "battery settings unavailable", fallbackError)
          }
        }
      }
    }

    OnDestroy {
      stopCapture()
      volumeSession?.release()
      volumeSession = null
    }
  }
}
