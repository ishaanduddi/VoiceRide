/**
 * Screen-off listening.
 *
 * Android 9+ blocks microphone access for apps that are in the background, and
 * Android 12+ freezes background processes. A foreground service of type
 * `microphone` is the supported way to keep capturing audio while the phone sits
 * in a pocket with the screen off.
 *
 * The service is started by the native `voice-system` module. Every call is
 * defensive: in Expo Go / older builds the module is absent and Ride Mode simply
 * works only while the app is in the foreground.
 */

import { requestNotificationPermissionsAsync } from 'expo-audio';

import VoiceSystem from '../../../modules/voice-system';
import { createLogger } from '@/utils/logger';

const log = createLogger('voice:background');

/** Keeps the process and the microphone alive when the screen turns off. */
export function startBackgroundListening(): void {
  if (!VoiceSystem) return;

  // Android 13+ hides the foreground-service notification without this. The
  // service still runs if the rider declines, so the result is ignored.
  void requestNotificationPermissionsAsync().catch(() => undefined);

  try {
    VoiceSystem.startForegroundService();
    log.info('microphone foreground service started');
  } catch (error) {
    log.warn('could not start the microphone foreground service', error);
  }
}

export function stopBackgroundListening(): void {
  if (!VoiceSystem) return;
  try {
    VoiceSystem.stopForegroundService();
    log.info('microphone foreground service stopped');
  } catch (error) {
    log.warn('could not stop the microphone foreground service', error);
  }
}
