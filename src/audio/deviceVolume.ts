/**
 * The phone's own media volume.
 *
 * Voice volume commands must change what the rider actually hears, in the same
 * way the volume keys do. Spotify's `PUT /me/player/volume` changes Spotify's
 * *internal* volume instead, and many devices (this project's test phone
 * included) reject it with "Restriction violated".
 *
 * The actual change is done with `react-native-volume-manager`, which sets the
 * `music` stream with `showUI` + `playSound`. `playSound` matters on a Bluetooth
 * headset: it makes Android route the change through the active output, exactly
 * like a hardware key press.
 *
 * The local `voice-system` module is still used for what the library does not
 * expose: the hardware step count, the audio route, and the diagnostics card.
 */

import { Platform } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';

import { microphoneControl } from '@/voice/microphone/micControl';

import VoiceSystem, {
  type VolumeDiagnostics,
  type VolumeStepResult,
} from '../../modules/voice-system';

export type { VolumeDiagnostics, VolumeStepResult };

/** Non-null only on Android, where the native module exists. */
const native = Platform.OS === 'android' ? VoiceSystem : null;

/** True when the phone volume can be read and written from JS. */
export const isDeviceVolumeAvailable = Platform.OS === 'android';

/** Used only when the native step count is unavailable. */
const DEFAULT_VOLUME_STEPS = 15;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** The library exposes 0-1; the app speaks and shows percentages. */
function toPercent(volume: number): number {
  return Math.round(clamp01(volume) * 100);
}

/** Device media volume, 0-100. `undefined` when unsupported. */
export async function getDeviceVolumePercent(): Promise<number | undefined> {
  try {
    const { volume } = await VolumeManager.getVolume();
    return Number.isFinite(volume) ? toPercent(volume) : undefined;
  } catch {
    // Library not linked (e.g. Expo Go) — use the local module instead.
  }

  if (!native) return undefined;
  try {
    const value = await native.getMediaVolume();
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  } catch {
    return undefined;
  }
}

/** Sets media volume to `percent` and resolves with the level actually applied. */
export async function setDeviceVolumePercent(percent: number): Promise<number | undefined> {
  const target = clamp01(percent / 100);

  try {
    await VolumeManager.setVolume(target, { type: 'music', showUI: true, playSound: true });
    return getDeviceVolumePercent();
  } catch {
    // Library not linked — use the local module instead.
  }

  if (!native) return undefined;
  try {
    const applied = await native.setMediaVolume(percent);
    return Number.isFinite(applied) && applied >= 0 ? Math.round(applied) : undefined;
  } catch {
    return undefined;
  }
}

/** Number of hardware volume steps (e.g. 15). */
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
 * Moves the media volume by `deltaPercent`.
 *
 * This is deliberately the plain version: read the volume, move by whole
 * hardware steps (so "+5%" is never rounded back to the same step), and set the
 * `music` stream with the system UI and the key-press sound. The raw levels are
 * returned so the UI can say whether the stream really moved instead of guessing.
 */
export async function stepDeviceVolumePercent(
  deltaPercent: number,
): Promise<VolumeStepResult | undefined> {
  /*
   * Release the microphone for the moment of the change.
   *
   * While a recording stream is open, a headset can stay in its voice (SCO)
   * route, where some phones ignore music-stream changes — which is why a spoken
   * command could fail while the same call from the test button worked. pausing
   * capture for ~100 ms makes both paths use the identical audio state.
   */
  const wasCapturing = microphoneControl.isActive?.() === true;
  if (wasCapturing) {
    try {
      microphoneControl.pause?.();
    } catch {
      // The microphone is already stopped; continue with the volume change.
    }
  }

  try {
    const max = (await getDeviceVolumeSteps()) ?? DEFAULT_VOLUME_STEPS;

    try {
      const before = await VolumeManager.getVolume();
      const levelBefore = Math.round(clamp01(before.volume) * max);
      const direction = deltaPercent >= 0 ? 1 : -1;
      const magnitude = Math.max(1, Math.round((Math.abs(deltaPercent) / 100) * max));
      const levelAfterTarget = Math.max(0, Math.min(max, levelBefore + direction * magnitude));

      await VolumeManager.setVolume(levelAfterTarget / max, {
        type: 'music',
        showUI: true,
        playSound: true,
      });

      const after = await VolumeManager.getVolume();
      const levelAfter = Math.round(clamp01(after.volume) * max);

      return {
        percent: toPercent(after.volume),
        levelBefore,
        levelAfter,
        max,
        bluetooth: await isBluetoothAudioActive(),
      };
    } catch {
      // Library not linked — use the local module instead.
    }

    if (!native) return undefined;
    try {
      const result = await native.stepMediaVolume(deltaPercent);
      return result && typeof result.percent === 'number' && Number.isFinite(result.percent)
        ? result
        : undefined;
    } catch {
      return undefined;
    }
  } finally {
    if (wasCapturing) {
      try {
        await microphoneControl.resume?.();
      } catch {
        // Ride Mode's own start/stop cycle will restore capture on next mount.
      }
    }
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
 * allowed to change it, and where the sound is going.
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