package expo.modules.voicesystem

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
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
 * Volume values cross the bridge as percentages (0-100) so the JS side never has
 * to know the device's step count. Captured audio is emitted as 100 ms chunks of
 * mono little-endian float32 (`audioBuffer` event).
 */
class VoiceSystemModule : Module() {

  private var captureRecord: AudioRecord? = null
  private var captureJob: Job? = null
  private val captureScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private var activeInputName: String? = null

  private fun audioManager(): AudioManager? =
    appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun maxVolume(audio: AudioManager): Int =
    audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)

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

    Events("audioBuffer")

    // ---------------------------------------------------------------- volume

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

    /**
     * Moves media volume by at least one hardware step.
     *
     * Phones quantise volume to 15-25 steps, so a "5%" request can round to the
     * step it is already on: the reply then repeats the same percentage and the
     * rider hears no change. Working in steps guarantees a real direction change
     * whenever one is possible.
     */
    AsyncFunction("stepMediaVolume") { deltaPercent: Double ->
      val audio = audioManager() ?: return@AsyncFunction 0.0
      val max = maxVolume(audio)
      val current = audio.getStreamVolume(AudioManager.STREAM_MUSIC)

      val magnitude = max(1, (kotlin.math.abs(deltaPercent) / 100.0 * max).roundToInt())
      val direction = if (deltaPercent >= 0) 1 else -1
      val next = (current + direction * magnitude).coerceIn(0, max)

      audio.setStreamVolume(AudioManager.STREAM_MUSIC, next, 0)
      (next * 100.0) / max
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

            // Delivery is marshalled to the JS queue by expo-modules-core.
            sendEvent("audioBuffer", payload)
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

    OnDestroy {
      stopCapture()
    }
  }
}
