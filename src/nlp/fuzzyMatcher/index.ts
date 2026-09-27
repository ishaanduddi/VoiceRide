/**
 * Combined fuzzy similarity.
 *
 * Combines orthographic (Levenshtein, Jaro-Winkler) and phonetic evidence.
 * This module only ever answers "how similar are these two strings" — it never
 * decides an intent, which is what prevents `increase volume` from collapsing
 * into `decrease volume` (that decision belongs to the classifier + confidence
 * engine, see nlp/confidence/confidenceEngine.ts).
 */

import { jaroWinkler } from './jaroWinkler';
import { levenshteinRatio } from './levenshtein';
import { phoneticMatch } from './phonetic';

/** Similarity of two single tokens, in [0, 1]. */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const orthographic = Math.max(levenshteinRatio(a, b), jaroWinkler(a, b));
  const phonetic = phoneticMatch(a, b) * 0.95;
  return Math.max(orthographic, phonetic);
}

/**
 * Symmetric, order-insensitive similarity of two phrases in [0, 1].
 *
 * Each token is matched to its best counterpart in the other phrase; the score
 * is damped when the phrases differ a lot in length.
 */
export function phraseSimilarity(a: string, b: string): number {
  const tokensA = a.split(' ').filter(Boolean);
  const tokensB = b.split(' ').filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  if (a === b) return 1;

  const bestAverage = (source: string[], target: string[]): number => {
    let sum = 0;
    for (const token of source) {
      let best = 0;
      for (const candidate of target) {
        const score = tokenSimilarity(token, candidate);
        if (score > best) best = score;
      }
      sum += best;
    }
    return sum / source.length;
  };

  const forward = bestAverage(tokensA, tokensB);
  const backward = bestAverage(tokensB, tokensA);
  const symmetric = (forward + backward) / 2;

  const lengthPenalty = Math.min(tokensA.length, tokensB.length) / Math.max(tokensA.length, tokensB.length);
  return symmetric * (0.7 + 0.3 * lengthPenalty);
}

/** Highest similarity of `text` against any of `candidates`. */
export function bestPhraseSimilarity(text: string, candidates: string[]): number {
  let best = 0;
  for (const candidate of candidates) {
    const score = phraseSimilarity(text, candidate);
    if (score > best) best = score;
  }
  return best;
}
