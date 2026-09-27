/** Tokenization helpers. */

/** Splits on anything that is not a letter or digit; keeps digits as tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0);
}

/** Like `tokenize` but drops digits — useful for word-only matching. */
export function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0);
}

export function isNumericToken(token: string): boolean {
  return /^\d+$/.test(token);
}
