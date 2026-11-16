/**
 * The NLP pipeline (steps 5-10).
 *
 *   text -> normalization -> intent classification -> entity extraction
 *        -> fuzzy matching -> context -> confidence
 *
 * Pure and synchronous: no I/O, no Spotify calls. That makes it trivially
 * testable and lets the same code run on the evaluation harness in `ml/`.
 */

import { computeConfidence } from './confidence/confidenceEngine';
import { evaluateContext, resolveIntentWithContext } from './context/contextManager';
import type { AppContext } from './context/types';
import { extractEntities } from './entityExtractor/songRequest';
import { extractVolumeAmount } from './entityExtractor/volumeAmount';
import { bestPhraseSimilarity } from './fuzzyMatcher';
import { classifyIntent } from './intentClassifier/classifier';
import { INTENT_KEYWORDS } from './intentClassifier/labels';
import { normalizeCommand } from './preprocessing/normalize';
import { applyVolumeDirection, isExplicitVolumeCommand } from './preprocessing/volumeDirection';
import type { Entities, Intent, Interpretation } from './types';

export interface InterpretOptions {
  /** Confidence reported by the ASR provider, when available. */
  asrConfidence?: number;
  context: AppContext;
  /** Execute threshold; comes from user Settings. */
  confidenceThreshold?: number;
}

/** Converts free text into a fully-scored interpretation. */
export function interpretCommand(transcript: string, options: InterpretOptions): Interpretation {
  const reasons: string[] = [];

  const normalized = normalizeCommand(transcript);
  const prediction = classifyIntent(normalized.original, normalized.canonicalText);
  let entities: Entities = extractEntities(normalized);

  let intent: Intent = prediction.intent;

  // Safety: an explicit direction word wins over the classifier, so a decrease
  // can never be executed as an increase (or vice versa).
  const direction = applyVolumeDirection(intent, normalized.canonicalTokens);
  if (direction.reason) reasons.push(direction.reason);
  intent = direction.intent;

  /*
   * An explicit amount ("increase volume by 5 percent") overrides the Settings
   * step. It is only read once the intent is known to be a volume command, so
   * digits in "play 7" never become a volume step.
   */
  if (intent === 'INCREASE_VOLUME' || intent === 'DECREASE_VOLUME') {
    const amount = extractVolumeAmount(normalized);
    if (amount !== undefined) {
      entities = { ...entities, volumePercent: amount };
      reasons.push(`explicit volume amount ${amount}%`);
    }
  }

  /*
   * Entity-driven refinement: a song name after "play" means PLAY_SONG,
   * regardless of how the classifier leant. "play believer" is a title request,
   * not a resume.
   */
  if (entities.songTitle) {
    if (intent === 'PLAY' || intent === 'PLAY_SONG') {
      intent = 'PLAY_SONG';
    } else if (intent === 'UNKNOWN' && normalized.canonicalTokens.includes('play')) {
      intent = 'PLAY_SONG';
    }
  }

  // Context-aware resolution ("play" while paused -> RESUME).
  const resolved = resolveIntentWithContext(intent, entities, options.context);
  intent = resolved.intent;
  reasons.push(...resolved.reasons);

  const fuzzyScore = INTENT_KEYWORDS[intent].length
    ? bestPhraseSimilarity(normalized.canonicalText, INTENT_KEYWORDS[intent])
    : 0;
  if (intent === 'UNKNOWN') reasons.push('nothing in the utterance matched a known intent');

  const contextEvaluation = evaluateContext(intent, entities, options.context);

  const computed = computeConfidence({
    prediction: { ...prediction, intent },
    fuzzyScore,
    asrConfidence: options.asrConfidence,
    contextScore: contextEvaluation.score,
    hasSongQuery: Boolean(entities.songTitle),
    requiresSongQuery: contextEvaluation.requiresSongQuery,
    threshold: options.confidenceThreshold,
  });

  let confidence = computed.confidence;
  let decision = computed.decision;

  /*
   * An explicit volume phrase ("increase volume", "turn the sound down") has
   * only one meaning and the direction guard already fixed which one, so it is
   * always safe to execute. Rejecting it on a noisy bike just means the rider
   * says it again — the worst outcome for a hands-free app.
   */
  if (
    (intent === 'INCREASE_VOLUME' || intent === 'DECREASE_VOLUME') &&
    isExplicitVolumeCommand(normalized.canonicalTokens)
  ) {
    if (decision === 'reject') computed.reasons.push('explicit volume phrase -> execute');
    decision = 'execute';
    confidence = Math.max(confidence, 0.75);
  }

  return {
    transcript,
    asrConfidence: options.asrConfidence,
    normalized,
    prediction: { ...prediction, intent },
    entities,
    fuzzyScore,
    contextScore: contextEvaluation.score,
    confidence,
    decision,
    reasons: [...reasons, ...contextEvaluation.reasons, ...computed.reasons],
  };
}
