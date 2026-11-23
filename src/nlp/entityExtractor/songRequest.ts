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

/** Words between "play" and the title that are not part of it: "play me the song X". */
const LEADING_FILLERS = new Set(['me', 'the', 'a', 'song', 'track', 'songs', 'tracks', 'music']);
/** Words after the title that are not part of it: "play X song please". */
const TRAILING_FILLERS = new Set(['song', 'track', 'please', 'now', 'pls', 'plz']);

export function extractSongRequest(normalized: NormalizedCommand): SongRequest {
  /*
   * Titles come from the CLEANED words, not the canonical ones: canonical
   * tokens have stop-words removed and synonyms rewritten, which turned
   * "shape of you" into "shape" and would mangle any title containing "of",
   * "you", "me", "the"… — most real titles, and many regional ones.
   */
  const cleaned = normalized.tokens;
  let playIndex = cleaned.lastIndexOf('play');
  let source = cleaned;

  if (playIndex < 0) {
    // A synonym ("put on X") only exists in canonical form.
    source = normalized.canonicalTokens;
    playIndex = source.lastIndexOf('play');
  }
  if (playIndex < 0) return {};

  let rest = source.slice(playIndex + 1);

  // "play me the song X" -> drop the leading fillers (but never the whole title).
  while (rest.length > 1 && LEADING_FILLERS.has(rest[0] as string)) rest = rest.slice(1);
  if (rest.length === 1 && (rest[0] === 'song' || rest[0] === 'track')) return {};

  // "play X song please" -> drop trailing fillers.
  while (rest.length > 1 && TRAILING_FILLERS.has(rest[rest.length - 1] as string)) {
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
