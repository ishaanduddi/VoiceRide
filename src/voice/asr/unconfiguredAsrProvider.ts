/**
 * Used when no ASR engine is configured. Fails loudly (with an actionable
 * message) instead of silently returning an empty transcript, which would look
 * like "the app ignored me".
 */

import type { AsrResult } from '@/nlp/types';
import { AsrNotConfiguredError } from '@/utils/errors';

import type { AudioUtterance, AsrProvider } from './types';

export class UnconfiguredAsrProvider implements AsrProvider {
  readonly name = 'unconfigured';
  readonly isConfigured = false;

  async transcribe(_utterance: AudioUtterance): Promise<AsrResult> {
    throw new AsrNotConfiguredError(
      'No speech recogniser configured. Set EXPO_PUBLIC_ASR_ENDPOINT in .env, or type commands with the manual box in Ride Mode.',
    );
  }
}
