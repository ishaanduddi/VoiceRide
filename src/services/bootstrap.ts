/** One-time app initialisation, executed by the root layout. */

import { createLogger } from '@/utils/logger';

import { loadPlaylists } from '@/state/libraryStore';
import { refreshSession, sessionStore } from '@/state/sessionStore';
import { loadSettings } from '@/state/settingsStore';

import { applyAdaptiveAudioProfile } from './appServices';

const log = createLogger('bootstrap');

let bootstrapped: Promise<void> | null = null;

/**
 * Loads preferences, restores the Spotify session, and preloads playlists.
 * Idempotent: repeated calls share the same promise.
 */
export function bootstrapApp(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      await loadSettings();
      applyAdaptiveAudioProfile();
      await refreshSession();

      if (sessionStore.getState().status === 'connected') {
        await loadPlaylists().catch((error) =>
          log.warn('playlist preload failed (will retry from the UI)', error),
        );
      }
      log.info('bootstrap complete');
    })().catch((error) => {
      // Never block the UI on a bootstrap failure.
      log.error('bootstrap failed', error);
    });
  }
  return bootstrapped;
}
