/**
 * Ties the voice front-end to the NLP pipeline.
 *
 *   utterance -> ASR -> interpretCommand() -> dispatch()
 *
 * Also owns the yes/no confirmation flow: when a command is plausible but not
 * certain, the app asks "Did you mean X? Say yes or no." and the next utterance
 * answers it instead of being interpreted as a new command.
 *
 * Deliberately React-free so it can be driven from the Ride Mode hook, a test,
 * or the ML evaluation harness.
 */

import type { AppContext } from '@/nlp/context/types';
import { responses } from '@/nlp/dispatcher/responses';
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

export interface VoiceControllerDeps {
  asr: AsrProvider;
  getContext: () => AppContext;
  /** Execute threshold from Settings. */
  confidenceThreshold: number;
  dispatch: (
    interpretation: Interpretation,
    options?: { confirmed?: boolean },
  ) => Promise<{ ok: boolean; spoken: string }>;
}

export interface UtteranceResult {
  asr: AsrResult;
  interpretation: Interpretation;
  outcome?: { ok: boolean; spoken: string };
  /** True when the transcript was too short or too long to be a command. */
  skipped: boolean;
}

const YES_WORDS = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'correct',
  'right',
  'ok',
  'okay',
  'do it',
  'go ahead',
  'affirmative',
];

const NO_WORDS = [
  'no',
  'nope',
  'nah',
  'cancel',
  'stop',
  'negative',
  'never mind',
  'nevermind',
  'dont',
  'do not',
];

/** Interprets a one-word answer to a confirmation question. */
export function parseYesNo(text: string): 'yes' | 'no' | 'unknown' {
  const normalised = text
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalised) return 'unknown';

  if (YES_WORDS.some((word) => normalised === word || normalised.startsWith(`${word} `))) {
    return 'yes';
  }
  if (NO_WORDS.some((word) => normalised === word || normalised.startsWith(`${word} `))) {
    return 'no';
  }
  return 'unknown';
}

export class VoiceController {
  /** A question we asked, waiting for a yes/no answer. */
  private pending: Interpretation | null = null;

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

  /** Drops a pending question (e.g. when Ride Mode stops). */
  reset(): void {
    this.pending = null;
  }

  async handleUtterance(utterance: AudioUtterance): Promise<UtteranceResult> {
    const startedAt = Date.now();
    const asr = await this.deps.asr.transcribe(utterance);
    const transcript = asr.text.trim();

    // 1. Is this the answer to a yes/no question we asked?
    if (this.pending) {
      const pending = this.pending;
      const answer = parseYesNo(transcript);

      if (answer === 'yes') {
        this.pending = null;
        const outcome = await this.deps.dispatch(pending, { confirmed: true });
        log.info(`confirmed ${pending.prediction.intent} verbally`);
        return { asr, interpretation: pending, outcome, skipped: false };
      }

      if (answer === 'no') {
        this.pending = null;
        log.info('confirmation declined');
        return {
          asr,
          interpretation: pending,
          outcome: { ok: false, spoken: responses.cancelled },
          skipped: false,
        };
      }

      // Neither yes nor no: drop the question and treat this as a fresh command,
      // so the rider can never get stuck answering.
      this.pending = null;
    }

    const interpretation = interpretCommand(transcript, {
      asrConfidence: asr.confidence,
      context: this.deps.getContext(),
      confidenceThreshold: this.deps.confidenceThreshold,
    });

    const words = transcript.split(/\s+/).filter(Boolean);

    // 2. Too short to be a command, or long enough to be a conversation.
    if (transcript.length < 2 || words.length > MAX_COMMAND_WORDS) {
      log.info(`ignored "${transcript}" (${words.length} words) - not a command`);
      return { asr, interpretation, skipped: true };
    }

    log.info(
      `"${transcript}" -> ${interpretation.prediction.intent} ` +
        `(${interpretation.confidence.toFixed(2)}, ${interpretation.decision})`,
      { reasons: interpretation.reasons },
    );

    const outcome = await this.deps.dispatch(interpretation);

    // 3. If we just asked a question, the next utterance answers it.
    if (
      interpretation.decision === 'confirm' &&
      interpretation.prediction.intent !== 'UNKNOWN' &&
      !(interpretation.prediction.intent === 'PLAY_SONG' && !interpretation.entities.songTitle)
    ) {
      this.pending = interpretation;
    }

    log.debug(`handled in ${Date.now() - startedAt}ms`);
    return { asr, interpretation, outcome, skipped: false };
  }
}
