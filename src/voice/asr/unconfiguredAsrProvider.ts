/**
 * Used when no ASR engine is available. Fails loudly (with an actionable
 * message) instead of silently returning an empty transcript, which would look
 * like "the app ignored me".
 */

import type { AsrResult } from '@/nlp/types';
import { AsrNotConfiguredError } from '@/utils/errors';

import type { AudioUtterance, AsrProvider } from './types';

const DEFAULT_MESSAGE =
  'No speech recogniser configured. Download the on-device model in Settings, set EXPO_PUBLIC_ASR_ENDPOINT, ' +
  'or type commands with the manual box in Ride Mode.';

export class UnconfiguredAsrProvider implements AsrProvider {
  readonly name = 'unconfigured';
  readonly isConfigured = false;

  constructor(private readonly message: string = DEFAULT_MESSAGE) {}

  async transcribe(_utterance: AudioUtterance): Promise<AsrResult> {
    throw new AsrNotConfiguredError(this.message);
  }
}
