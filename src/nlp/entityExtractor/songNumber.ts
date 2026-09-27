/**
 * Entity extraction (step 7 of the pipeline).
 *
 * Currently a single entity: `songNumber`, 1-based, referring to the position
 * of a track inside the currently selected playlist.
 */

import { extractNumber } from '../preprocessing/numberWords';
import { tokenize } from '../preprocessing/tokenize';
import type { Entities, NormalizedCommand } from '../types';

export interface SongNumberExtraction {
  songNumber?: number;
  /** Confidence of the extraction in [0, 1]. */
  confidence: number;
  /** The exact substring that carried the number. */
  raw?: string;
}

/** Extracts `songNumber` from free text (digits, cardinals or ordinals). */
export function extractSongNumber(text: string): SongNumberExtraction {
  const value = extractNumber(text);
  if (value === undefined) return { confidence: 0 };
  return { songNumber: value, confidence: 0.95 };
}

/**
 * Extracts all entities from an already-normalized command.
 *
 * Normalization guarantees spoken numbers are digits, so this is more
 * reliable than parsing raw ASR output.
 */
export function extractEntities(normalized: NormalizedCommand): Entities {
  const entities: Entities = {};

  if (normalized.numberValue !== undefined) {
    entities.songNumber = normalized.numberValue;
    return entities;
  }

  // Defensive second pass in case normalization missed a numeric token.
  const digitToken = tokenize(normalized.original).find((token) => /^\d+$/.test(token));
  if (digitToken) entities.songNumber = Number(digitToken);

  return entities;
}
