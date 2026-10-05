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

/**
 * Bump when a default changes in a way that must reach existing installs.
 *
 * v2: lowered the execute threshold. v1 shipped 0.72, which was high enough that
 * correctly-heard commands (especially "increase volume" / "decrease volume",
 * which the ambiguity penalty reduces further) fell below it and asked the rider
 * to repeat instead of acting.
 */
export const PREFERENCES_VERSION = 2;

export interface Preferences {
  preferencesVersion: number;
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
  preferencesVersion: PREFERENCES_VERSION,
  adaptiveAudioEnabled: false,
  confirmationSpeechEnabled: true,
  hapticsEnabled: true,
  confidenceThreshold: 0.6,
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
    const merged: Preferences = { ...DEFAULT_PREFERENCES, ...parsed };

    if ((parsed.preferencesVersion ?? 1) < PREFERENCES_VERSION) {
      // Thresholds: the old default was not a deliberate choice, so migrate it.
      merged.confidenceThreshold = DEFAULT_PREFERENCES.confidenceThreshold;
      merged.preferencesVersion = PREFERENCES_VERSION;
      log.info('migrated preferences to v2 (execute threshold lowered to 0.60)');
      await savePreferences(merged);
    }

    return merged;
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
