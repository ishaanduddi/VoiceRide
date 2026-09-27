/**
 * Cloud ASR provider.
 *
 * POSTs a mono 16-bit WAV body to `EXPO_PUBLIC_ASR_ENDPOINT` and expects JSON
 * `{ text, confidence? }` (a `transcript` key is also accepted).
 *
 * IMPORTANT: this is a development convenience. An `EXPO_PUBLIC_*` value ends
 * up inside the shipped bundle, so `EXPO_PUBLIC_ASR_API_KEY` is NOT a secret.
 * For production, point `EXPO_PUBLIC_ASR_ENDPOINT` at your own backend and keep
 * the real provider key on the server (see docs/SECURITY.md).
 */

import { AsrNotConfiguredError } from '@/utils/errors';
import { createLogger } from '@/utils/logger';
import { withTimeout } from '@/utils/async';
import type { AsrResult } from '@/nlp/types';

import { encodeWav16 } from '../audioProcessing/wav';

import type { AudioUtterance, AsrProvider } from './types';

const log = createLogger('voice:asr:cloud');

const REQUEST_TIMEOUT_MS = 15_000;

export interface CloudAsrOptions {
  endpoint: string;
  apiKey?: string;
  model?: string;
}

export class CloudAsrProvider implements AsrProvider {
  readonly name = 'cloud';

  constructor(private readonly options: CloudAsrOptions) {}

  get isConfigured(): boolean {
    return this.options.endpoint.trim().length > 0;
  }

  async transcribe(utterance: AudioUtterance): Promise<AsrResult> {
    if (!this.isConfigured) throw new AsrNotConfiguredError();

    const startedAt = Date.now();
    const wav = encodeWav16(utterance.pcm, utterance.sampleRate);

    const response = await withTimeout(
      fetch(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
          ...(this.options.model ? { 'X-Asr-Model': this.options.model } : {}),
        },
        body: wav.buffer as ArrayBuffer,
      }),
      REQUEST_TIMEOUT_MS,
    ).catch((error: unknown) => {
      log.warn('ASR request failed', error);
      throw new AsrNotConfiguredError('Speech recognition service is unreachable.');
    });

    if (!response.ok) {
      log.warn(`ASR responded ${response.status}`);
      throw new AsrNotConfiguredError(`Speech recognition failed (HTTP ${response.status}).`);
    }

    const payload = (await response.json()) as {
      text?: string;
      transcript?: string;
      confidence?: number;
    };

    const text = (payload.text ?? payload.transcript ?? '').trim();

    return {
      text,
      confidence: typeof payload.confidence === 'number' ? payload.confidence : undefined,
      provider: this.name,
      latencyMs: Date.now() - startedAt,
    };
  }
}
