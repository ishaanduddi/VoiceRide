/**
 * Absolute volume requests: "set volume to 70", "volume 70 percent",
 * "make it 70%", "full volume", "volume to max".
 *
 * Deterministic on purpose. The phrasing is narrow and the cost of a mistake is
 * high (a sudden 100% in the rider's ears), so this is a pattern match, not a
 * classifier guess: it needs a volume word or "make it", an explicit number or
 * max/min word, and no relative wording ("by 10" is a step, see volumeAmount).
 *
 * Runs on `cleaned` text, where spoken numbers are already digits and "%" has
 * been stripped ("seventy percent" -> "70 percent").
 */

import type { NormalizedCommand } from '../types';

const MAX_WORDS = /\b(max|maximum|full|highest)\b/;
const MIN_WORDS = /\b(min|minimum|lowest|zero)\b/;
const VOLUME_WORD = /\b(volume|sound|audio)\b/;
const SETTER = /^(set|make|put|keep|change|bring|turn)\b/;

export function extractVolumeTarget(normalized: NormalizedCommand): number | undefined {
  const text = normalized.cleaned;
  const words = normalized.tokens;

  if (words.length === 0 || words.length > 8) return undefined;
  // "play 7 rings" is a song; "by 10" is a relative step.
  if (words.includes('play') || /\bby \d+\b/.test(text)) return undefined;

  const mentionsVolume = VOLUME_WORD.test(text);
  const makeIt = /^(make|set|put|keep|bring|turn) it\b/.test(text);
  if (!mentionsVolume && !makeIt) return undefined;

  // "full volume", "volume to max", "max volume"
  if (MAX_WORDS.test(text) && mentionsVolume) return 100;
  if (MIN_WORDS.test(text) && mentionsVolume && /\b(to|at)\b|^(set|make|put)/.test(text)) return 0;

  const match = text.match(/\b(\d{1,3})\b/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined;

  /*
   * Accept only clearly absolute shapes:
   *   "set (the) volume to 70", "volume at 30 percent", "make it 70 percent",
   *   "volume 70", "70 percent volume", "make the volume 100"
   */
  const toOrAt = new RegExp(`\\b(to|at) ${value}\\b`).test(text);
  const bareVolume = /^(the )?(volume|sound)( level)? \d{1,3}( percent)?$/.test(text);
  const numberFirst = /^\d{1,3}( percent)? (volume|sound)$/.test(text);
  const setterWithNumber = SETTER.test(text) && (mentionsVolume || makeIt);

  return toOrAt || bareVolume || numberFirst || setterWithNumber ? value : undefined;
}
