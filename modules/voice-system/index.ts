/**
 * TypeScript surface of the local `voice-system` Expo module.
 *
 * `requireOptionalNativeModule` returns null in Expo Go, on iOS, and in any
 * build that predates the module, so callers can degrade gracefully instead of
 * crashing.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

export interface VoiceSystemNativeModule {
  /** Current device media volume, 0-100. */
  getMediaVolume(): Promise<number>;
  /** Sets device media volume (0-100); resolves with the level actually applied. */
  setMediaVolume(percent: number): Promise<number>;
  /** Number of hardware volume steps (Android only, for diagnostics). */
  getMediaVolumeSteps(): Promise<number>;
  /** Starts the microphone foreground service so screen-off listening works. */
  startForegroundService(): void;
  /** Stops the foreground service. */
  stopForegroundService(): void;
}

const VoiceSystem =
  requireOptionalNativeModule<VoiceSystemNativeModule>('VoiceSystem');

export default VoiceSystem;
