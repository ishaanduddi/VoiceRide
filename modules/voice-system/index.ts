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
}

const VoiceSystem = requireOptionalNativeModule<VoiceSystemNativeModule>('VoiceSystem');

export default VoiceSystem;
