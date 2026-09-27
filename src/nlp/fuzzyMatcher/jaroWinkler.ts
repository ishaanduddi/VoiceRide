/**
 * Jaro-Winkler similarity.
 *
 * Complements Levenshtein: it rewards matching prefixes, which fits command
 * words such as "volum(e)" or "skip/next" style prefix damage.
 */

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  const m = matches;
  return (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
}

/** Jaro-Winkler with the conventional prefix scaling factor p = 0.1. */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const jaroScore = jaro(a, b);
  if (jaroScore === 0) return 0;

  const maxPrefix = 4;
  let prefix = 0;
  const limit = Math.min(maxPrefix, Math.min(a.length, b.length));
  while (prefix < limit && a[prefix] === b[prefix]) prefix += 1;

  return jaroScore + prefix * prefixScale * (1 - jaroScore);
}
