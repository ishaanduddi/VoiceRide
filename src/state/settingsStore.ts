/** User preferences (persisted with AsyncStorage). */

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
  loadPreferences,
  savePreferences,
  type Preferences,
} from '@/storage/preferences';
import { ObservableStore } from './observable';

export interface SettingsState extends Preferences {
  /** False until AsyncStorage has been read once. */
  loaded: boolean;
}

export const settingsStore = new ObservableStore<SettingsState>({
  ...DEFAULT_PREFERENCES,
  loaded: false,
});

export async function loadSettings(): Promise<void> {
  const preferences = await loadPreferences();
  settingsStore.setState({ ...preferences, loaded: true });
}

export async function updateSettings(patch: Partial<Preferences>): Promise<void> {
  const next: SettingsState = { ...settingsStore.getState(), ...patch, loaded: true };
  settingsStore.setState(patch);
  await savePreferences({
    preferencesVersion: PREFERENCES_VERSION,
    adaptiveAudioEnabled: next.adaptiveAudioEnabled,
    confirmationSpeechEnabled: next.confirmationSpeechEnabled,
    hapticsEnabled: next.hapticsEnabled,
    confidenceThreshold: next.confidenceThreshold,
    volumeStepPercent: next.volumeStepPercent,
    adaptiveAudioProfile: next.adaptiveAudioProfile,
    lastPlaylistId: next.lastPlaylistId,
  });
}
