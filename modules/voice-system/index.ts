/**
 * TypeScript surface of the local `voice-system` Expo module.
 *
 * `requireOptionalNativeModule` returns null in Expo Go, on iOS, and in any
 * build that predates the module, so callers can degrade gracefully instead of
 * crashing.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

/** One microphone the phone can capture from. */
export interface VoiceInputDevice {
  /** Android AudioDeviceInfo id; pass to `startCapture`. */
  id: number;
  name: string;
  /** Human-readable type, e.g. "Wired headset". */
  type: string;
  isBuiltIn: boolean;
}

/** 100 ms of mono float32 audio. */
export interface AudioBufferEvent {
  /** Little-endian float32 samples. */
  data: Uint8Array | ArrayBuffer;
  sampleRate: number;
  channels: number;
}

/** Raw volume state, used by the Ride Mode diagnostics card. */
export interface VolumeDiagnostics {
  /** Current hardware step, e.g. 7. */
  level: number;
  /** Number of steps the phone exposes, e.g. 15. */
  max: number;
  /** `level / max` as 0-100. */
  percent: number;
  /** True when the device refuses app volume changes entirely. */
  isFixedVolume: boolean;
  /** MODIFY_AUDIO_SETTINGS is granted. */
  hasModifyPermission: boolean;
  /** Sound is routed to Bluetooth, which may keep its own volume. */
  isBluetooth: boolean;
}

/**
 * What a volume step actually did.
 *
 * The raw levels matter: a percentage can stay the same after rounding even when
 * the stream moved, and claiming "already at maximum" from a rounded percentage
 * was wrong on this project's test phone.
 */
export interface VolumeStepResult {
  /** Resulting media volume, 0-100. */
  percent: number;
  /** Stream index before/after the step, in device units. */
  levelBefore: number;
  levelAfter: number;
  /** Number of steps the phone exposes. */
  max: number;
  /** Sound is routed to Bluetooth, which may keep its own volume. */
  bluetooth: boolean;
  /** The voice (SCO / communication) route was active during the step. */
  voiceRoute?: boolean;
  /** Raw AudioManager mode (0 = normal, 3 = communication). */
  audioMode?: number;
  /** Which call moved the level: set, adjust, set+ui, or none. */
  method?: string;
}

export interface VoiceSystemSubscription {
  remove(): void;
}

export interface VoiceSystemNativeModule {
  /** Current device media volume, 0-100. */
  getMediaVolume(): Promise<number>;
  /** Sets device media volume (0-100); resolves with the level actually applied. */
  setMediaVolume(percent: number): Promise<number>;
  /** Number of hardware volume steps (Android only, for diagnostics). */
  getMediaVolumeSteps(): Promise<number>;
  /**
   * Moves media volume by a percentage, by at least one hardware step.
   * Resolves with the raw levels around the change (see `VolumeStepResult`).
   */
  stepMediaVolume(deltaPercent: number): Promise<VolumeStepResult>;
  /**
   * Moves media volume by exactly one hardware step in `direction`
   * (1 = up, -1 = down). This is the fixed, predefined amount used by voice
   * commands and the Ride Mode test buttons.
   */
  adjustMediaVolume(direction: number): Promise<VolumeStepResult>;
  /** Whether sound is going out over Bluetooth right now. */
  isBluetoothAudioActive(): Promise<boolean>;
  /** Raw volume state, for the on-device diagnostics card. */
  getVolumeDiagnostics(): Promise<VolumeDiagnostics>;

  /** Every capture-capable input, so the rider can choose one. */
  listInputs(): Promise<VoiceInputDevice[]>;
  /** Which input is actually capturing after `startCapture`. */
  getActiveInputName(): Promise<string | null>;
  /**
   * Starts PCM capture. `inputId <= 0` means automatic: a connected headset is
   * preferred over the built-in microphone. Resolves false when the microphone
   * could not be opened.
   */
  startCapture(sampleRate: number, inputId: number): Promise<boolean>;
  stopCapture(): void;
  addListener(
    eventName: 'audioBuffer',
    listener: (event: AudioBufferEvent) => void,
  ): VoiceSystemSubscription;

  /** Starts the microphone foreground service so screen-off listening works. */
  startForegroundService(): void;
  /** Stops the foreground service. */
  stopForegroundService(): void;
  /** Whether the microphone foreground service is really in the foreground. */
  isForegroundServiceRunning(): Promise<boolean>;
  /** Whether Android is allowed to freeze the app (battery optimisation). */
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  /** Opens the system dialog that exempts the app from battery optimisation. */
  requestIgnoreBatteryOptimizations(): void;
}

const VoiceSystem = requireOptionalNativeModule<VoiceSystemNativeModule>('VoiceSystem');

export default VoiceSystem;
