/**
 * Sound-alike spellings for a song title.
 *
 * Spotify titles are often not words ("FE!N", "SICKO MODE"), and the ASR hears
 * the sound rather than the spelling: "FE!N" comes back as "fine", "fein" or
 * "fe in". Searching only the transcript misses the track entirely when its
 * spelling is unusual — "fine" returns songs literally called "Fine", not
 * "FE!N".
 *
 * These rules rewrite the common vowel/consonant swaps the recogniser makes, so
 * the same sound is searched more than one way. Ranking (trackSelection.ts) then
 * lets popularity pick the real song among the extra candidates.
 */

/** Ordered by usefulness; the first few applicable rules are used. */
const RULES: [RegExp, string][] = [
  // "fine" -> "fein": the exact FE!N case.
  [/ine\b/g, 'ein'],
  // "fein" -> "fien", "beleiver" -> "believer" and vice versa.
  [/ei/g, 'ie'],
  [/ie/g, 'ei'],
  // "feen" / "fein" and other long-vowel spellings.
  [/ee/g, 'i'],
  [/ai/g, 'ei'],
  // Consonants that sound identical.
  [/ph/g, 'f'],
  [/ck/g, 'k'],
  [/c(?=[aou])/g, 'k'],
  // "u" and "oo" are routinely swapped by the recogniser.
  [/oo/g, 'u'],
  [/ou/g, 'o'],
];

/** How many alternatives are worth spending a search request on. */
const MAX_VARIANTS = 2;

/**
 * Alternative spellings of `title` that sound the same, excluding the title
 * itself. Each rule is applied once, so the result stays close to what was said.
 */
export function soundAlikeSpellings(title: string, max = MAX_VARIANTS): string[] {
  const base = title.toLowerCase().trim();
  if (!base) return [];

  const variants: string[] = [];

  for (const [pattern, replacement] of RULES) {
    const candidate = base.replace(pattern, replacement).trim();
    if (!candidate || candidate === base) continue;
    if (variants.includes(candidate)) continue;

    variants.push(candidate);
    if (variants.length >= max) break;
  }

  return variants;
}