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
import type { AppContext } from './context/types';
import { evaluateContext, resolveIntentWithContext } from './context/contextManager';
import { extractEntities } from './entityExtractor/songNumber';
import { bestPhraseSimilarity } from './fuzzyMatcher';
import { classifyIntent } from './intentClassifier/classifier';
import { INTENT_KEYWORDS } from './intentClassifier/labels';
import { normalizeCommand } from './preprocessing/normalize';
import type { Intent, Interpretation } from './types';

export interface InterpretOptions {
  /** Confidence reported by the ASR provider, when available. */
  asrConfidence?: number;
  context: AppContext;
  /** Execute threshold; comes from user Settings. */
  confidenceThreshold?: number;
}

/** Intents whose meaning depends on a `songNumber` entity. */
const SELECTION_VERBS = /(play|track)/;

/** Converts free text into a fully-scored interpretation. */
export function interpretCommand(transcript: string, options: InterpretOptions): Interpretation {
  const reasons: string[] = [];

  const normalized = normalizeCommand(transcript);
  const prediction = classifyIntent(normalized.original, normalized.canonicalText);
  const entities = extractEntities(normalized);

  let intent: Intent = prediction.intent;

  // Entity-driven refinement: "play 7" may classify as PLAY, but the presence
  // of a song number means the rider wants PLAY_SONG.
  if (entities.songNumber !== undefined) {
    if (intent === 'PLAY' || intent === 'PLAY_SONG') {
      intent = 'PLAY_SONG';
    } else if (intent === 'UNKNOWN' && SELECTION_VERBS.test(normalized.canonicalText)) {
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

  const { confidence, decision, reasons: confidenceReasons } = computeConfidence({
    prediction: { ...prediction, intent },
    fuzzyScore,
    asrConfidence: options.asrConfidence,
    contextScore: contextEvaluation.score,
    hasSongNumber: entities.songNumber !== undefined,
    requiresSongNumber: contextEvaluation.requiresSongNumber,
    threshold: options.confidenceThreshold,
  });

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
    reasons: [...reasons, ...contextEvaluation.reasons, ...confidenceReasons],
  };
}
