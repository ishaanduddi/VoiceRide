/**
 * Speech recognition is behind this interface so the app can swap engines
 * without touching the pipeline:
 *
 *   - CloudAsrProvider        (works today, including in Expo Go)
 *   - MockAsrProvider         (deterministic; used for tests/demos)
 *   - UnconfiguredAsrProvider (fails loudly with a helpful message)
 *
 * A native/offline engine (whisper.cpp, whisper.rn, or a platform
 * SpeechRecognizer) only has to implement `transcribe()` — the rest of the app
 * is unchanged. See docs/ARCHITECTURE.md#asr-providers.
 */

import type { AsrResult } from '@/nlp/types';

/** One detected utterance, already VAD-gated and downmixed to mono. */
export interface AudioUtterance {
  pcm: Float32Array;
  sampleRate: number;
  durationMs: number;
}

export interface AsrProvider {
  readonly name: string;
  /** False when required configuration (endpoint, model, key) is missing. */
  readonly isConfigured: boolean;
  /** Converts an utterance into text. */
  transcribe(utterance: AudioUtterance): Promise<AsrResult>;
  /** Optional: release native resources when this provider is replaced. */
  dispose?(): Promise<void>;
}
