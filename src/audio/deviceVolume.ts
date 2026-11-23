/**
 * The phone's own media volume.
 *
 * Voice volume commands must change what the rider actually hears, in the same
 * way the volume keys do. Spotify's `PUT /me/player/volume` changes Spotify's
 * *internal* volume instead, and many devices (this project's test phone
 * included) reject it with "Restriction violated".
 *
 * Backed by the local `voice-system` native module (Android only). When the
 * module is unavailable — Expo Go, iOS, or a build made before it was added —
 * callers fall back to the Spotify API.
 */

import { Platform } from 'react-native';

import VoiceSystem, {
  type VolumeDiagnostics,
  type VolumeStepResult,
} from '../../modules/voice-system';

export type { VolumeDiagnostics, VolumeStepResult };

/** Non-null only where the phone volume can be read and written from JS. */
const native = Platform.OS === 'android' ? VoiceSystem : null;

/** True when the phone volume can be read and written from JS. */
export const isDeviceVolumeAvailable = native !== null;

/** Device media volume, 0-100. `undefined` when unsupported. */
export async function getDeviceVolumePercent(): Promise<number | undefined> {
  if (!native) return undefined;
  try {
    const value = await native.getMediaVolume();
    // The native side answers -1 when the audio service cannot be reached.
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sets device media volume to `percent` and resolves with the level actually
 * applied. Phones have a fixed number of steps (often 15-25), so the result can
 * differ slightly from the request — the applied value is what the rider should
 * be told.
 */
export async function setDeviceVolumePercent(percent: number): Promise<number | undefined> {
  if (!native) return undefined;

  const target = Math.max(0, Math.min(100, Math.round(percent)));
  try {
    const applied = await native.setMediaVolume(target);
    return Number.isFinite(applied) && applied >= 0 ? Math.round(applied) : undefined;
  } catch {
    return undefined;
  }
}

/** Number of hardware volume steps (diagnostics only). */
export async function getDeviceVolumeSteps(): Promise<number | undefined> {
  if (!native) return undefined;
  try {
    const steps = await native.getMediaVolumeSteps();
    return Number.isFinite(steps) && steps > 0 ? steps : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One hardware volume step, in `direction` (1 = up, -1 = down).
 *
 * This is the fixed, predefined amount: the same call a volume key press makes.
 * Voice commands and the Ride Mode test buttons both use it, so neither depends
 * on a percentage or a Settings value.
 */
export async function adjustDeviceVolume(
  direction: 1 | -1,
): Promise<VolumeStepResult | undefined> {
  if (!native) return undefined;

  try {
    const result = await native.adjustMediaVolume(direction);
    if (!result || typeof result.percent !== 'number' || !Number.isFinite(result.percent)) {
      return undefined;
    }
    return result;
  } catch {
    return undefined;
  }
}

/**
 * Moves the volume by `deltaPercent` (e.g. +10, -20), converted on the native
 * side into whole hardware steps (at least one). Same fallbacks as a single
 * step, including the media-session route.
 */
export async function stepDeviceVolumePercent(
  deltaPercent: number,
): Promise<VolumeStepResult | undefined> {
  if (!native || !Number.isFinite(deltaPercent) || deltaPercent === 0) return undefined;

  try {
    const result = await native.stepMediaVolume(deltaPercent);
    if (!result || typeof result.percent !== 'number' || !Number.isFinite(result.percent)) {
      return undefined;
    }
    return result;
  } catch {
    return undefined;
  }
}

/** True when audio is routed to a Bluetooth device. */
export async function isBluetoothAudioActive(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isBluetoothAudioActive();
  } catch {
    return false;
  }
}

/**
 * Raw volume state for the diagnostics card: the hardware step, whether apps are
 * allowed to change it, and where the sound is going. This is what distinguishes
 * "the command did nothing" from "the headset owns its own volume".
 */
export async function getVolumeDiagnostics(): Promise<VolumeDiagnostics | undefined> {
  if (!native) return undefined;
  try {
    const value = await native.getVolumeDiagnostics();
    return value && typeof value.max === 'number' && value.max > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}
