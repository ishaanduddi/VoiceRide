/**
 * Microphone selection.
 *
 * Android chooses the default input for an app, and with earphones connected it
 * does not always choose the headset mic. The native `voice-system` module opens
 * its own `AudioRecord` and pins the input with `setPreferredDevice`, which the
 * `expo-audio` stream does not expose.
 *
 * `inputId === null` means automatic: a connected headset wins over the phone's
 * own microphone.
 */

import { Platform } from 'react-native';

import VoiceSystem, { type VoiceInputDevice } from '../../modules/voice-system';

export type { VoiceInputDevice };

const native = Platform.OS === 'android' ? VoiceSystem : null;

/** True when the microphone can be chosen explicitly. */
export const isInputSelectionAvailable = native !== null;

/** Every available microphone, best (headset) first. */
export async function listVoiceInputs(): Promise<VoiceInputDevice[]> {
  if (!native) return [];
  try {
    const inputs = await native.listInputs();
    return Array.isArray(inputs) ? inputs : [];
  } catch {
    return [];
  }
}

/** Name of the input currently capturing, when the native module knows it. */
export async function getActiveInputName(): Promise<string | undefined> {
  if (!native) return undefined;
  try {
    return (await native.getActiveInputName()) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Describes the saved preference for the Settings screen and diagnostics. */
export function describeInputPreference(
  inputId: number | null | undefined,
  inputs: VoiceInputDevice[],
): string {
  if (!inputId) return 'Automatic (prefer headset)';
  const match = inputs.find((input) => input.id === inputId);
  return match ? `${match.name} · ${match.type}` : `Saved device #${inputId}`;
}
