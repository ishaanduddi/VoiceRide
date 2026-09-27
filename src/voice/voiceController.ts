/**
 * Ties the voice front-end to the NLP pipeline.
 *
 *   utterance -> ASR -> interpretCommand() -> dispatch()
 *
 * Deliberately React-free so it can be driven from the Ride Mode hook, a test,
 * or the ML evaluation harness.
 */

import type { AppContext } from '@/nlp/context/types';
import { interpretCommand } from '@/nlp/pipeline';
import type { AsrResult, Interpretation } from '@/nlp/types';
import { createLogger } from '@/utils/logger';

import type { AsrProvider, AudioUtterance } from './asr';

const log = createLogger('voice:controller');

export interface VoiceControllerDeps {
  asr: AsrProvider;
  getContext: () => AppContext;
  /** Execute threshold from Settings. */
  confidenceThreshold: number;
  dispatch: (interpretation: Interpretation) => Promise<{ ok: boolean; spoken: string }>;
}

export interface UtteranceResult {
  asr: AsrResult;
  interpretation: Interpretation;
  outcome?: { ok: boolean; spoken: string };
  /** True when the ASR text was too short to be a command. */
  skipped: boolean;
}

export class VoiceController {
  constructor(private readonly deps: VoiceControllerDeps) {}

  /** Keeps the ASR provider swappable at runtime (e.g. after a model download). */
  async replaceAsrProvider(provider: AsrProvider): Promise<void> {
    const previous = this.deps.asr;
    this.deps.asr = provider;
    // Free native resources (e.g. a loaded whisper context) without blocking.
    if (previous.dispose) {
      await previous.dispose().catch((error: unknown) =>
        log.warn('failed to dispose the previous ASR provider', error),
      );
    }
  }

  async handleUtterance(utterance: AudioUtterance): Promise<UtteranceResult> {
    const startedAt = Date.now();
    const asr = await this.deps.asr.transcribe(utterance);
    const transcript = asr.text.trim();

    const interpretation = interpretCommand(transcript, {
      asrConfidence: asr.confidence,
      context: this.deps.getContext(),
      confidenceThreshold: this.deps.confidenceThreshold,
    });

    log.info(
      `"${transcript}" -> ${interpretation.prediction.intent} ` +
        `(${interpretation.confidence.toFixed(2)}, ${interpretation.decision})`,
      { reasons: interpretation.reasons },
    );

    // Too short to be a command: don't scold the rider for a cough.
    if (transcript.length < 2) {
      return { asr, interpretation, skipped: true };
    }

    const outcome = await this.deps.dispatch(interpretation);
    log.debug(`handled in ${Date.now() - startedAt}ms`);
    return { asr, interpretation, outcome, skipped: false };
  }
}
