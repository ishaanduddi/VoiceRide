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

import VoiceSystem from '../../modules/voice-system';

/** Non-null only where the phone volume can be read and written from JS. */
const native = Platform.OS === 'android' ? VoiceSystem : null;

/** True when the phone volume can be read and written from JS. */
export const isDeviceVolumeAvailable = native !== null;

/** Device media volume, 0-100. `undefined` when unsupported. */
export async function getDeviceVolumePercent(): Promise<number | undefined> {
  if (!native) return undefined;
  try {
    const value = await native.getMediaVolume();
    return Number.isFinite(value) ? Math.round(value) : undefined;
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
    return Number.isFinite(applied) ? Math.round(applied) : target;
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
 * Moves the phone's media volume by `deltaPercent`, by at least one hardware
 * step.
 *
 * Phones quantise volume to 15-25 steps, so adding 5% can round to the step it is
 * already on — "increase volume" then repeats the same number and nothing is
 * audible. Stepping in hardware units is the only way to guarantee a change.
 */
export async function stepDeviceVolumePercent(
  deltaPercent: number,
): Promise<number | undefined> {
  if (!native) return undefined;

  try {
    const applied = await native.stepMediaVolume(deltaPercent);
    return Number.isFinite(applied) ? Math.round(applied) : undefined;
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
