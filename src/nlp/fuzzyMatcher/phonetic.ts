/**
 * Phonetic matching.
 *
 * Motorcycle noise and imperfect pronunciation damage phonemes before they
 * damage spelling ("volum" vs "volume", "sevven" vs "seven"). Soundex catches
 * many of those cases that plain edit distance misses.
 */

const SOUNDEX_CODES: Record<string, string> = {
  b: '1', f: '1', p: '1', v: '1',
  c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
  d: '3', t: '3',
  l: '4',
  m: '5', n: '5',
  r: '6',
};

/** Standard 4-character Soundex code (e.g. "robert" -> R163). */
export function soundex(word: string): string {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length === 0) return '';

  let code = '';
  let lastDigit = '';

  for (let i = 0; i < letters.length; i += 1) {
    const letter = letters[i] as string;
    const digit = SOUNDEX_CODES[letter] ?? '';

    if (letter === 'h' || letter === 'w') continue;
    if (letter === 'y') {
      lastDigit = '';
      continue;
    }

    if (digit === '') {
      // Vowel: resets so "B-A-R" does not collapse into one code.
      lastDigit = '';
      continue;
    }

    if (digit !== lastDigit) {
      code += digit;
      lastDigit = digit;
    }
  }

  return `${letters[0]?.toUpperCase() ?? ''}${code.padEnd(3, '0')}`.slice(0, 4);
}

/** Loose consonant-skeleton key, used as a second phonetic opinion. */
export function consonantSkeleton(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/[aeiou]/g, '');
}

/** 1 when the words sound alike, otherwise 0. */
export function phoneticMatch(a: string, b: string): number {
  if (a.length < 3 || b.length < 3) return 0;
  if (soundex(a) === soundex(b)) return 1;
  return consonantSkeleton(a) === consonantSkeleton(b) ? 0.8 : 0;
}
