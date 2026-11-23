/**
 * Applies a downloaded OTA update without asking the rider to cold-start the app.
 *
 * `checkAutomatically: ON_LOAD` downloads a new bundle in the background but
 * expo-updates only RUNS it on the next cold start, so a published fix seemed
 * to "not reflect" until the app was killed and reopened. This hook:
 *
 *  - reloads into the new bundle as soon as one is downloaded, and
 *  - checks again whenever the app returns to the foreground (ON_LOAD only
 *    checks at launch), at most every few minutes.
 *
 * It never reloads during Ride Mode — a reload would stop the microphone
 * mid-ride. A pending update is applied the moment Ride Mode ends.
 */

import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { contextManager } from '@/state/contextStore';
import { createLogger } from '@/utils/logger';

const log = createLogger('updates:auto');

const FOREGROUND_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useAutoApplyUpdates(): void {
  const { isUpdatePending } = Updates.useUpdates();
  const reloadingRef = useRef(false);
  const lastCheckRef = useRef(0);

  // Reload into a downloaded update, waiting for Ride Mode to end if needed.
  useEffect(() => {
    if (!Updates.isEnabled || !isUpdatePending) return undefined;

    const reloadIfIdle = () => {
      if (reloadingRef.current || contextManager.getState().rideMode) return;
      reloadingRef.current = true;
      log.info('applying the downloaded update');
      Updates.reloadAsync().catch((error: unknown) => {
        reloadingRef.current = false;
        log.warn('could not apply the update', error);
      });
    };

    reloadIfIdle();
    return contextManager.subscribe(reloadIfIdle);
  }, [isUpdatePending]);

  // Check again on returning to the foreground.
  useEffect(() => {
    if (!Updates.isEnabled) return undefined;

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (Date.now() - lastCheckRef.current < FOREGROUND_CHECK_INTERVAL_MS) return;
      lastCheckRef.current = Date.now();

      void (async () => {
        try {
          const result = await Updates.checkForUpdateAsync();
          if (result.isAvailable) await Updates.fetchUpdateAsync();
        } catch (error) {
          log.debug('foreground update check failed', error);
        }
      })();
    });

    return () => subscription.remove();
  }, []);
}
