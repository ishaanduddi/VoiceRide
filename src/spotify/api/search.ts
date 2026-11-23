import { spotifyConfig } from '@/config';
import { createLogger } from '@/utils/logger';

import type { SpotifyPaging, SpotifyTrack } from '../types';
import { spotifyRequest } from './client';
import { soundAlikeSpellings } from './spellingVariants';

const log = createLogger('spotify:search');

export interface TrackSearchInput {
  /** Song title, e.g. "believer". */
  title: string;
  /** Optional artist, from "<title> by <artist>". */
  artist?: string;
  /**
   * Optional movie/album hint, from "<title> from <movie>". It widens the
   * query but is never used for title matching.
   */
  album?: string;
}

interface TrackSearchResponse {
  tracks?: SpotifyPaging<SpotifyTrack>;
}

async function searchOnce(query: string, limit: number): Promise<SpotifyTrack[]> {
  const response = await spotifyRequest<TrackSearchResponse>('/search', {
    // The rider's own market (IN etc.) is what makes regional titles show up;
    // from_token uses the account's country when none is configured.
    query: { q: query, type: 'track', limit, market: spotifyConfig.market ?? 'from_token' },
  });

  return (response.tracks?.items ?? []).filter(
    (track): track is SpotifyTrack => Boolean(track && track.id && track.uri),
  );
}

/**
 * Searches Spotify for tracks, widening the query until something matches.
 *
 * Titles are not words: "FE!N" is spoken "fein", and a field-filtered search for
 * `track:"fein"` can miss it because the punctuation is part of Spotify's index.
 * Three queries are tried in order, and the results are merged:
 *
 *   1. `track:"<title>" artist:"<artist>"` — precise, when both are known
 *   2. `track:"<title>"`                   — title only
 *   3. `<title> <artist>` / `<title>`      — Spotify's own fuzzy search, which
 *                                            copes with punctuation and spelling
 *   4. sound-alike spellings of the title — the ASR writes what it hears, so
 *                                            "FE!N" arrives as "fine" and only a
 *                                            "fein" search finds it
 *
 * The requests run in parallel (a rider should not wait for four round trips)
 * and the results are merged in query order. Ranking then happens locally (see
 * playback/trackSelection.ts), so an imprecise result set does not decide the
 * outcome.
 */
export async function searchTracks(
  input: TrackSearchInput,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const title = input.title.trim();
  if (!title) return [];

  const artist = input.artist?.trim();
  const album = input.album?.trim();
  const perQuery = Math.min(Math.max(limit, 1), 20);

  const plainQuery = (candidate: string, withArtist: boolean): string =>
    [candidate, withArtist && artist ? artist : '', album ?? '']
      .filter((part) => part.length > 0)
      .join(' ');

  const fieldQuery = (candidate: string, withArtist: boolean): string =>
    withArtist && artist
      ? `track:"${candidate}" artist:"${artist}"`
      : `track:"${candidate}"`;

  const queries = [
    fieldQuery(title, true),
    fieldQuery(title, false),
    plainQuery(title, true),
    ...(album ? [`track:"${title}" album:"${album}"`] : []),
    ...soundAlikeSpellings(title).flatMap((variant) => [
      fieldQuery(variant, true),
      plainQuery(variant, true),
    ]),
  ];

  const unique = [...new Set(queries)];

  const results = await Promise.all(
    unique.map(async (candidate) => {
      try {
        const items = await searchOnce(candidate, perQuery);
        log.debug(`"${candidate}" -> ${items.length} tracks`);
        return items;
      } catch (error) {
        log.warn(`search failed for "${candidate}"`, error);
        return [] as SpotifyTrack[];
      }
    }),
  );

  const seen = new Set<string>();
  const merged: SpotifyTrack[] = [];

  for (const items of results) {
    for (const track of items) {
      if (seen.has(track.uri)) continue;
      seen.add(track.uri);
      merged.push(track);
    }
  }

  return merged;
}
