/**
 * Ties the voice front-end to the NLP pipeline.
 *
 *   utterance -> ASR -> interpretCommand() -> dispatch()
 *
 * There is deliberately no "did you mean…?" step: a question mid-ride is more
 * disruptive than a missed command, so an utterance either executes or is
 * ignored. Noise stays silent — including uncertain commands and the wind
 * transcripts below.
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

/**
 * Commands are short. A transcript much longer than this is almost certainly
 * conversation (another person, a TV, a passenger) and merging it into a command
 * only corrupts the result.
 */
const MAX_COMMAND_WORDS = 12;

/**
 * Single tokens Whisper emits for wind, engine noise and road rumble.
 *
 * The VAD fires on gusts; without this the model transcribes a stray word and
 * the app used to answer "Say that again?" at every gust. These are discarded
 * before dispatch so nothing is spoken or displayed as a command.
 */
const NOISE_TRANSCRIPTS = new Set([
  'wind',
  'windy',
  'wind noise',
  'whoosh',
  'whooshing',
  'shh',
  'shhh',
  'hush',
  'hmm',
  'hmmm',
  'mmm',
  'uh',
  'um',
  'noise',
  'static',
  'rustle',
  'rustling',
  'background noise',
]);

export interface VoiceControllerDeps {
  asr: AsrProvider;
  getContext: () => AppContext;
  /** Execute threshold from Settings. */
  confidenceThreshold: number;
  dispatch: (
    interpretation: Interpretation,
  ) => Promise<{ ok: boolean; spoken: string }>;
}

export interface UtteranceResult {
  asr: AsrResult;
  interpretation: Interpretation;
  outcome?: { ok: boolean; spoken: string };
  /** True when the transcript was too short or too long to be a command. */
  skipped: boolean;
}

export class VoiceController {
  constructor(private readonly deps: VoiceControllerDeps) {}

  /** Keeps the ASR provider swappable at runtime (e.g. after a model download). */
  async replaceAsrProvider(provider: AsrProvider): Promise<void> {
    const previous = this.deps.asr;
    this.deps.asr = provider;
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

    const words = transcript.split(/\s+/).filter(Boolean);

    // Too short to be a command, or long enough to be a conversation.
    if (transcript.length < 2 || words.length > MAX_COMMAND_WORDS) {
      log.info(`ignored "${transcript}" (${words.length} words) - not a command`);
      return { asr, interpretation, skipped: true };
    }

    const noiseKey = transcript
      .toLowerCase()
      .replace(/[^a-z ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (NOISE_TRANSCRIPTS.has(noiseKey)) {
      log.info(`ignored noise transcript "${transcript}"`);
      return { asr, interpretation, skipped: true };
    }

    log.info(
      `"${transcript}" -> ${interpretation.prediction.intent} ` +
        `(${interpretation.confidence.toFixed(2)}, ${interpretation.decision})`,
      { reasons: interpretation.reasons },
    );

    const outcome = await this.deps.dispatch(interpretation);

    log.debug(`handled in ${Date.now() - startedAt}ms`);
    return { asr, interpretation, outcome, skipped: false };
  }
}
