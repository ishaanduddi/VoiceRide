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
import { extractVolumeTarget } from './entityExtractor/volumeTarget';
import { bestPhraseSimilarity } from './fuzzyMatcher';
import { classifyIntent } from './intentClassifier/classifier';
import { INTENT_KEYWORDS } from './intentClassifier/labels';
import { normalizeCommand } from './preprocessing/normalize';
import { applyVolumeDirection, isExplicitVolumeCommand } from './preprocessing/volumeDirection';
import type { Entities, Intent, Interpretation, NormalizedCommand } from './types';

export interface InterpretOptions {
  /** Confidence reported by the ASR provider, when available. */
  asrConfidence?: number;
  context: AppContext;
  /** Execute threshold; comes from user Settings. */
  confidenceThreshold?: number;
}

/** Words allowed before "play" in a song request: "could you please play X". */
const POLITE_PREFIX = new Set(['could', 'can', 'would', 'will', 'you', 'please', 'just', 'hey', 'ok', 'okay', 'now']);

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

/**
 * True when a short utterance literally contains its intent's own command
 * phrase. Single-word phrases ("next", "stop") only count when they are
 * nearly the whole utterance, so "turn left next" never skips a song.
 */
function isExplicitCommand(intent: Intent, normalized: NormalizedCommand, entities: Entities): boolean {
  if (intent === 'UNKNOWN') return false;
  const words = normalized.tokens;

  if (intent === 'PLAY_SONG') {
    if (!entities.songTitle) return false;
    const playIndex = words.lastIndexOf('play');
    const putOn = words.indexOf('put') >= 0 && words[words.indexOf('put') + 1] === 'on';
    if (playIndex < 0 && !putOn) return false;
    const prefix = playIndex >= 0 ? words.slice(0, playIndex) : words.slice(0, words.indexOf('put'));
    return prefix.every((word) => POLITE_PREFIX.has(word));
  }

  for (const phrase of INTENT_KEYWORDS[intent] ?? []) {
    const phraseWords = phrase.split(' ').length;
    const limit = phraseWords === 1 ? 2 : phraseWords + 3;
    if (words.length > limit) continue;
    if (containsPhrase(normalized.cleaned, phrase) || containsPhrase(normalized.canonicalText, phrase)) {
      return true;
    }
  }
  return false;
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

  // "set volume to 70" / "make it 70 percent" / "full volume": an absolute level.
  const volumeTarget = extractVolumeTarget(normalized);
  if (volumeTarget !== undefined) {
    intent = 'SET_VOLUME';
    entities = { volumeTarget };
    reasons.push(`absolute volume ${volumeTarget}%`);
  }

  const fuzzyScore = (INTENT_KEYWORDS[intent] ?? []).length
    ? bestPhraseSimilarity(normalized.canonicalText, INTENT_KEYWORDS[intent] ?? [])
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

  /*
   * The same reasoning for every other command: a SHORT utterance that
   * contains the intent's own phrase ("next song", "pause the music", "could
   * you play kesariya") is unambiguous, and rejecting it only makes the rider
   * repeat themselves. Measured on ml/data + everyday speech, ordinary talk
   * scores 0.45-0.55, so the global threshold is left alone and only these
   * explicit commands are lifted.
   */
  // An absolute level is a pattern match on an explicit number: always safe to run.
  if (intent === 'SET_VOLUME') {
    decision = 'execute';
    confidence = Math.max(confidence, 0.85);
  }

  if (decision === 'reject' && isExplicitCommand(intent, normalized, entities)) {
    computed.reasons.push('explicit command phrase -> execute');
    decision = 'execute';
    confidence = Math.max(confidence, 0.72);
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
