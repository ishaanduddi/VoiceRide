/** Plain Levenshtein edit distance and its normalised similarity. */

/** Classic dynamic-programming edit distance (with an O(min(n,m)) buffer). */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep the shorter string on the "previous row" for memory efficiency.
  let s1 = a;
  let s2 = b;
  if (s1.length > s2.length) [s1, s2] = [s2, s1];

  const previous = new Array<number>(s1.length + 1);
  const current = new Array<number>(s1.length + 1);
  for (let i = 0; i <= s1.length; i += 1) previous[i] = i;

  for (let j = 1; j <= s2.length; j += 1) {
    current[0] = j;
    for (let i = 1; i <= s1.length; i += 1) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      const deletion = (previous[i] as number) + 1;
      const insertion = (current[i - 1] as number) + 1;
      const substitution = (previous[i - 1] as number) + cost;
      current[i] = Math.min(deletion, insertion, substitution);
    }
    for (let i = 0; i <= s1.length; i += 1) previous[i] = current[i] as number;
  }

  return previous[s1.length] as number;
}

/** Similarity in [0, 1] derived from the edit distance. */
export function levenshteinRatio(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}
