/**
 * Explicit volume amount, e.g. "increase volume by 5 percent".
 *
 * The number is only read for a command the pipeline has already classified as
 * INCREASE_VOLUME / DECREASE_VOLUME, so the same digits in "play 7" stay a song
 * reference. When nothing is said, the step from Settings is used instead.
 */

import type { NormalizedCommand } from '../types';

/** Volume percentages are whole numbers; anything outside 1-100 is not a step. */
const MIN_PERCENT = 1;
const MAX_PERCENT = 100;

export function extractVolumeAmount(normalized: NormalizedCommand): number | undefined {
  const value = normalized.numberValue;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;

  const rounded = Math.round(value);
  if (rounded < MIN_PERCENT || rounded > MAX_PERCENT) return undefined;

  return rounded;
}
