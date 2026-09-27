/**
 * Audible / haptic feedback.
 *
 * TTS is optional and can be disabled in Settings; haptics matter a lot while
 * riding because wind noise can mask a short confirmation.
 */

import * as Speech from 'expo-speech';
import { Vibration } from 'react-native';

import { createLogger } from '@/utils/logger';

const log = createLogger('effects:feedback');

export function speak(text: string, enabled: boolean): void {
  if (!enabled || text.trim().length === 0) return;
  try {
    void Speech.stop();
    Speech.speak(text, { rate: 1.0, pitch: 1.0 });
  } catch (error) {
    log.debug('text-to-speech failed', error);
  }
}

export function stopSpeaking(): void {
  try {
    void Speech.stop();
  } catch {
    // nothing was speaking
  }
}

export function hapticTap(enabled: boolean): void {
  if (!enabled) return;
  try {
    Vibration.vibrate(40);
  } catch (error) {
    log.debug('vibration failed', error);
  }
}

export function hapticDouble(enabled: boolean): void {
  if (!enabled) return;
  try {
    Vibration.vibrate([0, 40, 60, 40]);
  } catch (error) {
    log.debug('vibration failed', error);
  }
}
