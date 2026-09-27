/**
 * Confidence engine (step 10 of the pipeline).
 *
 * Combines ASR confidence, intent confidence, fuzzy similarity and context
 * into one score, then decides execute / confirm / reject.
 *
 * The critical safety property: fuzzy similarity ALONE can never execute a
 * command. Because 45% of the score is the (fused) intent probability and
 * because semantically-opposite pairs get an explicit ambiguity penalty,
 * "increase volume" cannot silently become "decrease volume" just because the
 * strings are 90% alike.
 */

import { INTENT_LIST, isConfusablePair } from '../intentClassifier/labels';
import type { Decision, Intent, IntentPrediction } from '../types';

import {
  AMBIGUITY_PENALTY,
  CONFIDENCE_WEIGHTS,
  CONFIRM_THRESHOLD,
  DEFAULT_ASR_CONFIDENCE,
  MIN_MARGIN,
} from './config';

export interface ConfidenceInput {
  prediction: IntentPrediction;
  /** Similarity of the utterance to the winning intent's vocabulary, [0,1]. */
  fuzzyScore: number;
  asrConfidence?: number;
  /** Plausibility of the command in the current context, [0,1]. */
  contextScore: number;
  hasSongNumber: boolean;
  requiresSongNumber: boolean;
  /** Execute threshold; defaults to EXECUTE_THRESHOLD. */
  threshold?: number;
}

export interface ConfidenceResult {
  confidence: number;
  decision: Decision;
  reasons: string[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rankIntents(scores: Partial<Record<Intent, number>>): Array<{ intent: Intent; score: number }> {
  return INTENT_LIST.map((intent) => ({ intent, score: scores[intent] ?? 0 })).sort(
    (left, right) => right.score - left.score,
  );
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const reasons: string[] = [];
  const { prediction } = input;

  const asrConfidence = clamp01(input.asrConfidence ?? DEFAULT_ASR_CONFIDENCE);
  if (input.asrConfidence === undefined) {
    reasons.push('ASR did not report a confidence; assuming moderate');
  }

  let confidence =
    CONFIDENCE_WEIGHTS.intent * clamp01(prediction.confidence) +
    CONFIDENCE_WEIGHTS.fuzzy * clamp01(input.fuzzyScore) +
    CONFIDENCE_WEIGHTS.asr * asrConfidence +
    CONFIDENCE_WEIGHTS.context * clamp01(input.contextScore);

  reasons.push(
    `intent=${prediction.intent} (${prediction.method}, p=${prediction.confidence.toFixed(2)})`,
  );
  reasons.push(
    `fuzzy=${input.fuzzyScore.toFixed(2)} asr=${asrConfidence.toFixed(2)} context=${input.contextScore.toFixed(2)}`,
  );

  // 1. No intent at all -> never execute.
  if (prediction.intent === 'UNKNOWN') {
    confidence = Math.min(confidence, 0.3);
    reasons.push('no intent matched the vocabulary');
  }

  // 2. Semantically-opposite intents are not decided by a coin flip.
  const ranked = rankIntents(prediction.scores);
  const top = ranked[0];
  const second = ranked[1];
  if (top && second) {
    const margin = top.score - second.score;
    if (margin < MIN_MARGIN && isConfusablePair(top.intent, second.intent)) {
      confidence *= AMBIGUITY_PENALTY;
      reasons.push(
        `ambiguous between ${top.intent} and ${second.intent} (margin ${margin.toFixed(2)}) -> penalised`,
      );
    }
  }

  // 3. A song-selection command without a number cannot be actioned.
  if (input.requiresSongNumber && !input.hasSongNumber) {
    confidence = Math.min(confidence, 0.45);
    reasons.push('song number missing');
  }

  confidence = clamp01(confidence);

  const threshold = input.threshold ?? 0.72;
  const decision: Decision =
    confidence >= threshold ? 'execute' : confidence >= CONFIRM_THRESHOLD ? 'confirm' : 'reject';

  reasons.push(`final=${confidence.toFixed(2)} -> ${decision}`);

  return { confidence, decision, reasons };
}
