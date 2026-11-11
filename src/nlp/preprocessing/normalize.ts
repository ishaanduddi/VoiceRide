/**
 * Text normalization (step 5 of the pipeline).
 *
 *   raw ASR text
 *     -> lowercase, strip punctuation
 *     -> phrase rewrites ("make it louder" -> "increase volume")
 *     -> tokenize
 *     -> spoken number -> digits ("seventh" -> 7, "the seventh one" -> 7)
 *     -> drop stop-words
 *     -> synonym canonicalisation ("song" -> "track")
 *
 * The result feeds both the fuzzy matcher and the intent classifier.
 */

import type { NormalizedCommand } from '../types';

import { findNumberPhrase } from './numberWords';
import { PHRASE_REWRITES, STOP_WORDS, TOKEN_SYNONYMS } from './synonyms';
import { tokenize } from './tokenize';

/**
 * Re-joins a word the ASR spelled out letter by letter.
 *
 * "play f e i n" -> "play fein". Whisper does this for unfamiliar strings such
 * as song titles with punctuation ("FE!N"), and a title split into single
 * letters can never match anything. Runs of three or more single letters are
 * joined; two are left alone so real words like "a" and "i" survive.
 */
export function joinSpelledLetters(tokens: string[]): string[] {
  const output: string[] = [];
  let run: string[] = [];

  const flush = (): void => {
    if (run.length >= 3) output.push(run.join(''));
    else output.push(...run);
    run = [];
  };

  for (const token of tokens) {
    if (token.length === 1 && /[a-z]/.test(token)) {
      run.push(token);
    } else {
      flush();
      output.push(token);
    }
  }
  flush();

  return output;
}

export function normalizeCommand(input: string): NormalizedCommand {
  const original = (input ?? '').trim();

  let working = original.toLowerCase();
  // Apostrophes join letters ("don't" -> "dont"), everything else becomes space.
  working = working.replace(/[\u2019']/g, '');
  working = working.replace(/[^a-z0-9\s]/g, ' ');
  working = working.replace(/\s+/g, ' ').trim();

  for (const [pattern, replacement] of PHRASE_REWRITES) {
    working = working.replace(pattern, replacement);
  }
  working = working.replace(/\s+/g, ' ').trim();

  const rawTokens = joinSpelledLetters(tokenize(working));

  // Collapse a spoken number into a single digit token.
  const phrase = findNumberPhrase(rawTokens);
  let tokens = rawTokens;
  let numberValue: number | undefined;
  if (phrase) {
    numberValue = phrase.value;
    tokens = [
      ...rawTokens.slice(0, phrase.start),
      String(phrase.value),
      ...rawTokens.slice(phrase.end),
    ];
  }

  const contentTokens = tokens.filter((token) => !STOP_WORDS.has(token));

  const canonicalTokens = contentTokens
    .map((token) => (token in TOKEN_SYNONYMS ? (TOKEN_SYNONYMS[token] as string) : token))
    .filter((token) => token.length > 0);

  return {
    original,
    cleaned: tokens.join(' '),
    tokens,
    contentTokens,
    canonicalTokens,
    canonicalText: canonicalTokens.join(' '),
    numberValue,
  };
}
