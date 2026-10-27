/**
 * Screen-off listening.
 *
 * Android 9+ blocks microphone access for apps that are in the background, and
 * Android 12+ freezes background processes. A foreground service of type
 * `microphone` is the supported way to keep capturing audio while the phone sits
 * in a pocket with the screen off.
 *
 * A foreground service is not always enough: aggressive OEM battery managers
 * (vivo/OriginOS, MIUI, EMUI, …) can still freeze the app, which shows up as
 * "the mic light is on but commands are only heard occasionally". The native
 * module therefore also holds a partial wake lock, and exposes whether the
 * service is running plus the battery-optimisation exemption so the UI can tell
 * the rider the truth instead of assuming it works.
 *
 * Every call is defensive: in Expo Go / older builds the module is absent and
 * Ride Mode simply works only while the app is in the foreground.
 */

import { requestNotificationPermissionsAsync } from 'expo-audio';

import VoiceSystem from '../../../modules/voice-system';
import { createLogger } from '@/utils/logger';

export const log = createLogger('voice:background');

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

export interface BackgroundStatus {
  /** The microphone foreground service is running. */
  serviceRunning: boolean;
  /** Android may freeze the app; the rider should grant the exemption. */
  batteryOptimised: boolean;
  /** The native module is present, so screen-off listening is possible at all. */
  supported: boolean;
}

export async function getBackgroundStatus(): Promise<BackgroundStatus> {
  if (!VoiceSystem) {
    return { serviceRunning: false, batteryOptimised: true, supported: false };
  }

  try {
    const [serviceRunning, ignoring] = await Promise.all([
      VoiceSystem.isForegroundServiceRunning(),
      VoiceSystem.isIgnoringBatteryOptimizations(),
    ]);
    return { serviceRunning, batteryOptimised: !ignoring, supported: true };
  } catch {
    return { serviceRunning: false, batteryOptimised: true, supported: true };
  }
}

/** Opens Android's "don't optimise this app" dialog for VoiceRiders. */
export function requestBatteryExemption(): void {
  try {
    VoiceSystem?.requestIgnoreBatteryOptimizations();
  } catch (error) {
    log.warn('could not open the battery optimisation settings', error);
  }
}
