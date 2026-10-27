/**
 * On-device speech recognition with whisper.cpp (via `whisper.rn`).
 *
 * Why this exists: cloud ASR needs a network round trip (bad on a bike) and
 * sends voice off the device. Running Whisper locally gives offline, private,
 * lower-latency recognition — at the cost of needing a development build and a
 * downloaded model.
 *
 * Pipeline fit: the VAD has already isolated one utterance, which is written as
 * a 16-bit mono 16 kHz WAV (what whisper.cpp expects) and transcribed.
 *
 * IMPORTANT — command biasing: `prompt` seeds the decoder with our command
 * vocabulary, which measurably improves accuracy on the short, noisy utterances
 * this app sees.
 */

import { File, Paths } from 'expo-file-system';

import { audioConfig, whisperConfig } from '@/config';
import type { AsrResult } from '@/nlp/types';
import { AsrNotConfiguredError } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

import { encodeWav16 } from '../../audioProcessing/wav';
import type { AudioUtterance, AsrProvider } from '../types';

import { getModelUri, isModelReady } from './modelManager';
import { cleanTranscript } from './cleanTranscript';
import { loadWhisperModule, type WhisperContext } from './whisperModule';

const log = createLogger('voice:asr:on-device');

/**
 * Initial prompt. Whisper conditions its output on this text, so listing the
 * command vocabulary makes "next song" far more likely than "text song".
 */
export const COMMAND_BIAS_PROMPT = [
  'Voice commands for Spotify music playback:',
  'play believer, play thunder, play believer by imagine dragons,',
  'next song, previous song, skip, pause, resume, stop,',
  'increase volume, decrease volume, turn it up, turn it down.',
].join(' ');

const UTTERANCE_FILENAME = 'voiceriders-utterance.wav';

export class OnDeviceWhisperProvider implements AsrProvider {
  readonly name = 'whisper-on-device';

  private context: WhisperContext | null = null;
  private loading: Promise<WhisperContext> | null = null;

  /** Configured = the model is actually on disk. */
  get isConfigured(): boolean {
    return isModelReady();
  }

  /** Loads the model once and keeps the context warm for the whole ride. */
  private async getContext(): Promise<WhisperContext> {
    if (this.context) return this.context;

    if (!this.loading) {
      this.loading = (async () => {
        const modelUri = getModelUri();
        if (!modelUri) {
          throw new AsrNotConfiguredError(
            'The on-device speech model is not downloaded yet. Open Settings and tap "Download speech model".',
          );
        }

        const whisper = await loadWhisperModule();
        log.info(`loading model ${modelUri}`);
        const context = await whisper.initWhisper({
          filePath: modelUri,
          useGpu: whisperConfig.useGpu,
        });
        log.info(
          `whisper ${whisper.libVersion ?? ''} ready (gpu=${String(context.gpu ?? false)})` +
            (context.reasonNoGPU ? ` reason=${context.reasonNoGPU}` : ''),
        );
        this.context = context;
        return context;
      })().finally(() => {
        this.loading = null;
      });
    }

    return this.loading;
  }

  /** Writes the utterance to a reusable WAV file in the cache directory. */
  private writeUtteranceWav(utterance: AudioUtterance): string {
    const bytes = encodeWav16(utterance.pcm, utterance.sampleRate || audioConfig.sampleRate);
    const file = new File(Paths.cache, UTTERANCE_FILENAME);
    file.create({ overwrite: true, intermediates: true });
    file.write(bytes);
    return file.uri;
  }

  async transcribe(utterance: AudioUtterance): Promise<AsrResult> {
    const startedAt = Date.now();
    const context = await this.getContext();
    const wavUri = this.writeUtteranceWav(utterance);

    const { promise } = context.transcribe(wavUri, {
      language: 'en',
      translate: false,
      maxThreads: whisperConfig.maxThreads,
      // Greedy with a small beam: short commands are cheap, and the beam removes
      // most of the "beat" / "next some" style errors tiny models make.
      temperature: 0,
      beamSize: 2,
      prompt: COMMAND_BIAS_PROMPT,
    });

    const result = await promise;
    // whisper.cpp annotates non-speech audio as "[Music]", "[BLANK_AUDIO]", etc.
    // Those must never reach the NLP pipeline (see cleanTranscript).
    const { text, nonSpeech } = cleanTranscript(result.result ?? '');

    log.info(
      `"${(result.result ?? '').trim()}" -> "${text}"` +
        `${nonSpeech ? ' (non-speech: music/noise)' : ''} ` +
        `(${Date.now() - startedAt}ms, ${utterance.pcm.length} samples)`,
    );

    return {
      text,
      // whisper.cpp does not expose a calibrated confidence; the confidence
      // engine falls back to DEFAULT_ASR_CONFIDENCE when this is undefined.
      confidence: undefined,
      provider: this.name,
      latencyMs: Date.now() - startedAt,
      nonSpeech,
    };
  }

  /** Frees the native context (e.g. when the engine is switched off). */
  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.release().catch((error: unknown) => log.warn('release failed', error));
      this.context = null;
    }
  }
}
