/**
 * Choosing which search result to play.
 *
 * The rider's rule: for a bare title, play the best-known version; if they name
 * an artist ("believer by imagine dragons"), only that artist's track.
 *
 * Spotify does NOT expose play counts or "views", so `popularity` (0-100, derived
 * from recent plays) is the closest available proxy for "most played".
 *
 * Matching is deliberately fuzzy and phonetic, because Spotify titles are not
 * words: "FE!N" is spoken as "fein", "Sicko Mode" as "sicko mode", and ASR
 * returns "fein", "fe in" or "f e i n". Exact string equality only worked when
 * the rider spelled the title out letter by letter.
 */

import { phraseSimilarity, tokenSimilarity } from '@/nlp/fuzzyMatcher';

import { artistLine } from '../playback/playlistTrackMap';
import type { SpotifyTrack } from '../types';

/** Lowercase, punctuation collapsed to single spaces. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase, every non-alphanumeric removed: "FE!N" -> "fen". */
function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Scored {
  track: SpotifyTrack;
  /** 0 = unrelated, 1 = identical (punctuation-insensitive). */
  titleScore: number;
  artistHit: boolean;
  popularity: number;
  rank: number;
}

/**
 * Similarity of a spoken title to a Spotify title.
 *
 * Three passes, best wins:
 *   1. compact equality      "fe!n" vs "fein" -> exact once punctuation is gone
 *   2. phrase similarity     word-level, order-insensitive, includes Soundex
 *   3. compact similarity    catches "fein" vs "fen" and other clipped words
 */
function titleSimilarity(trackName: string, wanted: string): number {
  const trackWords = normalise(trackName);
  const wantedWords = normalise(wanted);

  if (!trackWords || !wantedWords) return 0;

  if (compact(trackWords) === compact(wantedWords)) return 1;
  if (trackWords.includes(wantedWords) || wantedWords.includes(trackWords)) return 0.9;

  const phrase = phraseSimilarity(trackWords, wantedWords);
  // Whole-string comparison catches one-word titles that were misspelled or
  // punctuated ("fe!n" -> "fen" vs "fein", "stay" vs "stai").
  const whole = tokenSimilarity(compact(trackWords), compact(wantedWords));

  return Math.max(phrase * 0.95, whole);
}

function scoreTrack(track: SpotifyTrack, title: string, artist?: string): Scored {
  const titleScore = titleSimilarity(track.name, title);

  const names = (track.artists ?? []).map((entry) => compact(entry.name));
  const wantedArtist = artist ? compact(artist) : undefined;
  const artistHit = wantedArtist
    ? names.some(
        (name) =>
          name === wantedArtist ||
          name.includes(wantedArtist) ||
          wantedArtist.includes(name) ||
          tokenSimilarity(name, wantedArtist) >= 0.85,
      )
    : false;

  const popularity = track.popularity ?? 0;

  /*
   * Within a confident title band, popularity decides ("most played wins").
   * The 0.72 floor maps a title score of 1.0 to 0.72 + popularity, so an exact
   * match on a well-known recording beats a fuzzy match on an obscure one, while
   * a bad match cannot win on popularity alone.
   */
  const rank = titleScore * 0.72 + (popularity / 100) * 0.28;

  return { track, titleScore, artistHit, popularity, rank };
}

/** Minimum title similarity worth playing at all. */
const MIN_TITLE_SCORE = 0.55;

/**
 * Picks the track to play.
 *
 *  - with an artist: only that artist's tracks are considered (falls back to the
 *    full list if the filter would leave nothing)
 *  - then: title similarity, popularity, artist match
 */
export function pickBestTrack(
  tracks: SpotifyTrack[],
  title: string,
  artist?: string,
): SpotifyTrack | undefined {
  if (tracks.length === 0) return undefined;

  const scored = tracks.map((track) => scoreTrack(track, title, artist));
  const plausible = scored.filter((entry) => entry.titleScore >= MIN_TITLE_SCORE);
  const pool = plausible.length > 0 ? plausible : scored;

  const artistMatches = artist ? pool.filter((entry) => entry.artistHit) : [];
  const finalPool = artistMatches.length > 0 ? artistMatches : pool;

  finalPool.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (b.titleScore !== a.titleScore) return b.titleScore - a.titleScore;
    return b.popularity - a.popularity;
  });

  return finalPool[0]?.track;
}

/** "Believer — Imagine Dragons" for spoken confirmation. */
export function describeTrack(track: SpotifyTrack): string {
  const artist = artistLine(track);
  return artist && artist !== 'Unknown artist' ? `${track.name} by ${artist}` : track.name;
}
