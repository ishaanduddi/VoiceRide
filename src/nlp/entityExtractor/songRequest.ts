/**
 * Song-request entity extraction.
 *
 * Replaces the old playlist-number entity. The rider now names a song:
 *
 *   "play believer"                     -> title: "believer"
 *   "play believer by imagine dragons"  -> title: "believer", artist: "imagine dragons"
 *   "play song thunder"                 -> title: "thunder"
 *   "play music"                        -> no title (that is a resume/play command)
 *
 * The resolved title is used for a Spotify search; see
 * spotify/playback/trackSelection.ts for how the best match is chosen.
 */

import type { Entities, NormalizedCommand } from '../types';

/** Words that carry no song identity on their own. */
const GENERIC_TITLES = new Set([
  'music',
  'track',
  'song',
  'something',
  'anything',
  'it',
  'this',
  'that',
  'some',
]);

export interface SongRequest {
  title?: string;
  artist?: string;
}

export function extractSongRequest(normalized: NormalizedCommand): SongRequest {
  const tokens = normalized.canonicalTokens;

  // Use the LAST "play": "could you play believer" still works.
  const playIndex = tokens.lastIndexOf('play');
  if (playIndex < 0) return {};

  let rest = tokens.slice(playIndex + 1);

  // "play song X" / "play track X" -> drop the leading noun.
  while (rest.length > 0 && (rest[0] === 'track' || rest[0] === 'song')) rest = rest.slice(1);

  // A trailing noun ("play the seventh song" -> "... 7 track") is not part of the title.
  while (rest.length > 1 && (rest[rest.length - 1] === 'track' || rest[rest.length - 1] === 'song')) {
    rest = rest.slice(0, -1);
  }

  if (rest.length === 0) return {};

  const byIndex = rest.lastIndexOf('by');
  let titleTokens = rest;
  let artistTokens: string[] = [];
  if (byIndex > 0 && byIndex < rest.length - 1) {
    titleTokens = rest.slice(0, byIndex);
    artistTokens = rest.slice(byIndex + 1);
  }

  const title = titleTokens.join(' ').trim();
  if (!title) return {};
  if (titleTokens.length === 1 && GENERIC_TITLES.has(title)) return {};

  const artist = artistTokens.join(' ').trim();
  return { title, artist: artist.length > 0 ? artist : undefined };
}

/** Extracts entities from an already-normalized command. */
export function extractEntities(normalized: NormalizedCommand): Entities {
  const request = extractSongRequest(normalized);
  return { songTitle: request.title, artist: request.artist };
}
