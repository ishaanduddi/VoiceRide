/**
 * Intent vocabulary (step 6 of the pipeline).
 *
 * The canonical phrases live in `src/nlp/shared/intentKeywords.json` because
 * they are BOTH the rule/fuzzy knowledge base and the reference used by the
 * Python evaluation harness (see ml/evaluate_intent_classifier.py).
 */

import intentKeywords from '../shared/intentKeywords.json';
import { INTENTS, type Intent } from '../types';

export const INTENT_LIST: Intent[] = INTENTS;

export const INTENT_KEYWORDS = intentKeywords as unknown as Record<Intent, string[]>;

/**
 * Intent pairs that are semantically opposite or easily confused. When the
 * classifier's top two candidates are one of these pairs and the margin is
 * small, the confidence engine applies a penalty.
 */
export const CONFUSABLE_PAIRS: ReadonlyArray<readonly [Intent, Intent]> = [
  ['INCREASE_VOLUME', 'DECREASE_VOLUME'],
  ['NEXT_SONG', 'PREVIOUS_SONG'],
  ['PLAY', 'PAUSE'],
  ['PLAY', 'RESUME'],
  ['PAUSE', 'STOP'],
  ['RESUME', 'STOP'],
];

export function isConfusablePair(a: Intent, b: Intent): boolean {
  return CONFUSABLE_PAIRS.some(
    ([left, right]) => (left === a && right === b) || (left === b && right === a),
  );
}
