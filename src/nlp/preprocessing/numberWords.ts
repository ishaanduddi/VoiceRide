/**
 * Spoken-number parsing: digits, cardinals and ordinals.
 *
 * Handles every form the brief lists and more:
 *   7   seven   seventh   number seven   song number seven   track 7
 *   twenty one   twenty-first   one hundred and seven   the seventh one
 */

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
};

const ORDINAL_UNITS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
};

const ORDINAL_TENS: Record<string, number> = {
  twentieth: 20,
  thirtieth: 30,
  fortieth: 40,
  fiftieth: 50,
  sixtieth: 60,
  seventieth: 70,
  eightieth: 80,
  ninetieth: 90,
};

export function isNumberWord(word: string): boolean {
  return (
    word === 'and' ||
    word in UNITS ||
    word in TENS ||
    word in SCALES ||
    word in ORDINAL_UNITS ||
    word in ORDINAL_TENS
  );
}

/**
 * Parses a run of number words into a value.
 *
 * Ordinals and plain tens/units terminate the run so that "the seventh one"
 * resolves to 7 rather than 8.
 */
export function parseNumberWords(words: string[]): number | null {
  let value = 0;
  let matched = false;
  let i = 0;

  while (i < words.length) {
    const word = words[i] as string;

    if (word in ORDINAL_UNITS) {
      value += ORDINAL_UNITS[word] as number;
      matched = true;
      break;
    }

    if (word in ORDINAL_TENS) {
      value += ORDINAL_TENS[word] as number;
      matched = true;
      const next = words[i + 1];
      if (next && next in ORDINAL_UNITS) value += ORDINAL_UNITS[next] as number;
      break;
    }

    if (word in TENS) {
      value += TENS[word] as number;
      matched = true;
      const next = words[i + 1];
      // Allow "twenty one", "twenty two".
      if (next && next in UNITS) value += UNITS[next] as number;
      break;
    }

    if (word in UNITS) {
      value += UNITS[word] as number;
      matched = true;
      i += 1;
      continue;
    }

    if (word in SCALES) {
      const scale = SCALES[word] as number;
      value = (value === 0 ? 1 : value) * scale;
      matched = true;
      i += 1;
      continue;
    }

    if (word === 'and') {
      i += 1;
      continue;
    }

    break;
  }

  return matched ? value : null;
}

export interface NumberPhrase {
  value: number;
  /** Index of the first token of the phrase. */
  start: number;
  /** Index just past the last token of the phrase. */
  end: number;
  raw: string;
}

/**
 * Finds the first numeric phrase (digit token or run of number words) in a
 * pre-tokenized utterance, returning its position so the caller can rewrite it.
 */
export function findNumberPhrase(tokens: string[]): NumberPhrase | null {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as string;

    if (/^\d+$/.test(token)) {
      return { value: Number(token), start: i, end: i + 1, raw: token };
    }

    if (!isNumberWord(token) || token === 'and') continue;

    const run: string[] = [];
    let j = i;
    while (j < tokens.length && (isNumberWord(tokens[j] as string) || tokens[j] === 'and')) {
      run.push(tokens[j] as string);
      j += 1;
    }

    // Prefer the longest prefix of the run that parses cleanly.
    for (let length = run.length; length >= 1; length -= 1) {
      const value = parseNumberWords(run.slice(0, length));
      if (value !== null) {
        return { value, start: i, end: i + length, raw: run.slice(0, length).join(' ') };
      }
    }
  }

  return null;
}

/** Convenience wrapper: extracts a number from free text. */
export function extractNumber(text: string): number | undefined {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return findNumberPhrase(tokens)?.value;
}
