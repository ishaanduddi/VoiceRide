/**
 * Intent classifier (step 6 of the pipeline).
 *
 * Two complementary signals are fused:
 *
 *  1. A small TF-IDF + Logistic Regression model trained in Python
 *     (`ml/train_intent_classifier.py`) and exported as `model.json`. Inference
 *     is a handful of dot products, so it is cheap enough for a phone.
 *
 *     TRAIN/SERVE CONSISTENCY: the Python side uses
 *     `TfidfVectorizer(ngram_range=(1, 2), token_pattern=r"(?u)\b\w+\b")` with
 *     default L2 normalisation and `LogisticRegression`. `tfidfVector()` below
 *     reproduces exactly that transform (unigrams + adjacent bigrams, IDF
 *     weighting, L2 norm), so the exported weights behave on-device the way
 *     they behaved in evaluation.
 *
 *  2. A rule/keyword baseline scored with the fuzzy matcher, which keeps the
 *     app useful before the model is trained and helps rare phrasings.
 *
 * The classifier never lets fuzzy similarity alone choose the intent; see
 * `nlp/confidence/confidenceEngine.ts`.
 */

import { bestPhraseSimilarity } from '../fuzzyMatcher';
import { tokenize } from '../preprocessing/tokenize';
import type { Intent, IntentPrediction } from '../types';

import { INTENT_KEYWORDS, INTENT_LIST } from './labels';
import rawModel from './model.json';

interface ExportedLinearModel {
  version: number;
  classes: string[];
  /** feature (unigram or "a b" bigram) -> column index */
  vocab: Record<string, number>;
  /** inverse document frequency per column */
  idf: number[];
  /** coefficients[class][feature] */
  coef: number[][];
  intercept: number[];
}

const model = rawModel as unknown as ExportedLinearModel;

const ML_AVAILABLE =
  Array.isArray(model.classes) && model.classes.length > 0 && model.coef.length > 0;

/** Weight of the ML model when both signals are available. */
const ML_WEIGHT = 0.65;
const RULE_WEIGHT = 0.35;

/** Unigrams + adjacent bigrams — mirrors `ngram_range=(1, 2)` in sklearn. */
function extractFeatures(rawText: string): string[] {
  const words = tokenize(rawText);
  const features = [...words];
  for (let i = 0; i + 1 < words.length; i += 1) {
    features.push(`${words[i]} ${words[i + 1]}`);
  }
  return features;
}

/** Counts features, applies IDF and L2-normalises — mirrors sklearn's transform. */
function tfidfVector(rawText: string): Float64Array {
  const size = model.idf.length;
  const vector = new Float64Array(size);
  if (size === 0) return vector;

  const counts = new Map<number, number>();
  for (const feature of extractFeatures(rawText)) {
    const index = model.vocab[feature];
    if (index === undefined) continue;
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }

  let norm = 0;
  for (const [index, count] of counts) {
    const value = count * (model.idf[index] ?? 1);
    vector[index] = value;
    norm += value * value;
  }

  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < size; i += 1) vector[i] = (vector[i] as number) / norm;
  }
  return vector;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - max));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return total === 0 ? exponentials : exponentials.map((value) => value / total);
}

function mlScores(rawText: string): Partial<Record<Intent, number>> {
  const vector = tfidfVector(rawText);
  const logits = model.classes.map((_, classIndex) => {
    const coefficients = model.coef[classIndex] ?? [];
    let sum = model.intercept[classIndex] ?? 0;
    for (let feature = 0; feature < vector.length; feature += 1) {
      sum += (coefficients[feature] ?? 0) * (vector[feature] as number);
    }
    return sum;
  });

  const probabilities = softmax(logits);
  const scores: Partial<Record<Intent, number>> = {};
  model.classes.forEach((className, index) => {
    scores[className as Intent] = probabilities[index] ?? 0;
  });
  return scores;
}

/** Whole-word (or whole-phrase) containment, so "play" cannot match "play track 7". */
function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^| )${escaped}(?: |$)`).test(text);
}

function ruleScores(canonicalText: string): Partial<Record<Intent, number>> {
  const scores: Partial<Record<Intent, number>> = {};
  for (const intent of INTENT_LIST) {
    const keywords = INTENT_KEYWORDS[intent];
    if (!keywords || keywords.length === 0) continue;

    let best = bestPhraseSimilarity(canonicalText, keywords);
    // Exact containment is strong evidence, but ONLY for specific multi-word
    // keywords: short ones ("play", "next") are substrings of longer commands
    // and would otherwise outrank the correct, more specific intent.
    if (keywords.some((keyword) => keyword.includes(' ') && containsPhrase(canonicalText, keyword))) {
      best = Math.max(best, 0.95);
    }
    scores[intent] = best;
  }
  return scores;
}

/** True when a trained model.json has been exported into the bundle. */
export function isMlModelAvailable(): boolean {
  return ML_AVAILABLE;
}

/**
 * Classifies an utterance.
 *
 * @param rawText       original (lowercased) utterance — ML features
 * @param canonicalText normalized command — rule/fuzzy keywords
 */
export function classifyIntent(rawText: string, canonicalText: string): IntentPrediction {
  const rules = ruleScores(canonicalText);
  const scores: Partial<Record<Intent, number>> = {};
  let method: IntentPrediction['method'];

  if (ML_AVAILABLE) {
    const ml = mlScores(rawText);
    for (const intent of INTENT_LIST) {
      scores[intent] = ML_WEIGHT * (ml[intent] ?? 0) + RULE_WEIGHT * (rules[intent] ?? 0);
    }
    method = 'hybrid';
  } else {
    for (const intent of INTENT_LIST) {
      if (rules[intent] !== undefined) scores[intent] = rules[intent] as number;
    }
    method = 'rules';
  }

  let bestIntent: Intent = 'UNKNOWN';
  let bestScore = 0;
  let secondScore = 0;

  for (const intent of INTENT_LIST) {
    const score = scores[intent] ?? 0;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestIntent = intent;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // Nothing meaningful matched at all.
  if (bestScore < 0.2) {
    return {
      intent: 'UNKNOWN',
      confidence: Math.max(0, bestScore),
      scores,
      margin: bestScore - secondScore,
      method,
    };
  }

  return {
    intent: bestIntent,
    confidence: bestScore,
    scores,
    margin: bestScore - secondScore,
    method,
  };
}
