/** Tunables for the confidence engine. Tune these with real ride data. */

import type { Intent } from '../types';

export const CONFIDENCE_WEIGHTS = {
  /** How much the fused classifier believes in the winning intent. */
  intent: 0.45,
  /** How close the utterance is to that intent's vocabulary. */
  fuzzy: 0.25,
  /** How clean the ASR output was. */
  asr: 0.2,
  /** How plausible the command is right now. */
  context: 0.1,
} as const;

/** Confidence at or above which a command is executed immediately. */
export const EXECUTE_THRESHOLD = 0.72;

/** Between CONFIRM and EXECUTE the app asks the rider to repeat. */
export const CONFIRM_THRESHOLD = 0.5;

/**
 * If the top two intents are closer than this AND form a known confusable
 * pair, the result is deliberately pushed down instead of guessed.
 */
export const MIN_MARGIN = 0.12;

/** Multiplier applied to ambiguous, semantically-opposite interpretations. */
export const AMBIGUITY_PENALTY = 0.7;

/** Used when the ASR provider cannot report a confidence. */
export const DEFAULT_ASR_CONFIDENCE = 0.75;

export const CONFUSABLE_INTENT_PAIRS: ReadonlyArray<readonly [Intent, Intent]> = [
  ['INCREASE_VOLUME', 'DECREASE_VOLUME'],
  ['NEXT_SONG', 'PREVIOUS_SONG'],
  ['PLAY', 'PAUSE'],
  ['PLAY', 'RESUME'],
  ['PAUSE', 'STOP'],
  ['RESUME', 'STOP'],
];
