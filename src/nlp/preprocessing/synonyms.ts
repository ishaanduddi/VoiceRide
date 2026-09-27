/**
 * Domain lexicons: filler words to drop and command synonyms to canonicalise.
 *
 * The actual data lives in `src/nlp/shared/lexicon.json` so that the Python
 * training/evaluation code applies byte-for-byte the same normalization as the
 * running app (train/serve consistency). Keep edits in the JSON file.
 */

import lexicon from '../shared/lexicon.json';

export const STOP_WORDS = new Set<string>(lexicon.stopWords);

export const TOKEN_SYNONYMS: Record<string, string> = lexicon.tokenSynonyms;

/**
 * Phrase-level rewrites applied to the cleaned string BEFORE tokenizing.
 * Order matters: longer, more specific phrases first.
 */
export const PHRASE_REWRITES: [RegExp, string][] = lexicon.phraseRewrites.map(
  ([pattern, replacement]) => [new RegExp(pattern ?? '', 'g'), replacement ?? ''],
);

/** Words that signal a specific track is being requested. */
export const SELECTION_MARKERS = new Set<string>(['track', 'song', 'number', 'item', 'selection']);
