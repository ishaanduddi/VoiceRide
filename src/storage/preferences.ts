/**
 * Non-sensitive preferences, persisted with AsyncStorage.
 *
 * Anything that could be used to impersonate the user belongs in
 * `storage/secureStore.ts` instead.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { createLogger } from '@/utils/logger';

const log = createLogger('preferences');
const KEY = 'voiceriders.preferences.v1';

export type AdaptiveAudioProfile = 'conservative' | 'balanced' | 'aggressive';

export interface Preferences {
  /** Adaptive Audio Mode master switch. */
  adaptiveAudioEnabled: boolean;
  /** Speak a short confirmation after executing a command. */
  confirmationSpeechEnabled: boolean;
  /** Vibrate on command recognition (useful over engine noise). */
  hapticsEnabled: boolean;
  /** Minimum command confidence required to act without asking again. */
  confidenceThreshold: number;
  /** Percentage points added/removed by a voice volume command. */
  volumeStepPercent: number;
  /** How aggressively Adaptive Audio Mode shifts the volume. */
  adaptiveAudioProfile: AdaptiveAudioProfile;
  /** Playlist id the user last selected. */
  lastPlaylistId?: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  adaptiveAudioEnabled: false,
  confirmationSpeechEnabled: true,
  hapticsEnabled: true,
  confidenceThreshold: 0.72,
  // NOTE: section 4 of the project brief illustrates a 1-point step. 5 is the
  // default because it is perceptible while riding; set it to 1 in Settings to
  // reproduce the brief's example exactly.
  volumeStepPercent: 5,
  adaptiveAudioProfile: 'balanced',
  lastPlaylistId: undefined,
};

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch (error) {
    log.warn('failed to load preferences, using defaults', error);
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(preferences));
  } catch (error) {
    log.warn('failed to save preferences', error);
  }
}
