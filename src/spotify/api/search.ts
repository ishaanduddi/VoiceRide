import { createLogger } from '@/utils/logger';

import type { SpotifyPaging, SpotifyTrack } from '../types';
import { spotifyRequest } from './client';

const log = createLogger('spotify:search');

export interface TrackSearchInput {
  /** Song title, e.g. "believer". */
  title: string;
  /** Optional artist, from "<title> by <artist>". */
  artist?: string;
}

interface TrackSearchResponse {
  tracks?: SpotifyPaging<SpotifyTrack>;
}

async function searchOnce(query: string, limit: number): Promise<SpotifyTrack[]> {
  const response = await spotifyRequest<TrackSearchResponse>('/search', {
    query: { q: query, type: 'track', limit },
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
 *
 * Ranking then happens locally (see playback/trackSelection.ts), so an early
 * imprecise result set does not decide the outcome.
 */
export async function searchTracks(
  input: TrackSearchInput,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const title = input.title.trim();
  if (!title) return [];

  const artist = input.artist?.trim();
  const perQuery = Math.min(Math.max(limit, 1), 20);

  const queries = [
    artist ? `track:"${title}" artist:"${artist}"` : `track:"${title}"`,
    `track:"${title}"`,
    artist ? `${title} ${artist}` : title,
  ];

  const seen = new Set<string>();
  const merged: SpotifyTrack[] = [];

  for (const query of [...new Set(queries)]) {
    let items: SpotifyTrack[] = [];
    try {
      items = await searchOnce(query, perQuery);
    } catch (error) {
      log.warn(`search failed for "${query}"`, error);
    }

    log.debug(`"${query}" -> ${items.length} tracks`);

    for (const track of items) {
      if (seen.has(track.uri)) continue;
      seen.add(track.uri);
      merged.push(track);
    }

    // Enough candidates to rank confidently; do not spend more rate limit.
    if (merged.length >= perQuery) break;
  }

  return merged;
}
