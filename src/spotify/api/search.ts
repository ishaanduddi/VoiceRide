import type { SpotifyPaging, SpotifyTrack } from '../types';
import { spotifyRequest } from './client';

export interface TrackSearchInput {
  /** Song title, e.g. "believer". */
  title: string;
  /** Optional artist, from "<title> by <artist>". */
  artist?: string;
}

interface TrackSearchResponse {
  tracks?: SpotifyPaging<SpotifyTrack>;
}

/**
 * Searches Spotify for tracks.
 *
 * Field filters (`track:` / `artist:`) are used so that "believer by imagine
 * dragons" does not simply return every track containing either word.
 */
export async function searchTracks(
  input: TrackSearchInput,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const title = input.title.trim();
  if (!title) return [];

  const parts = [`track:"${title}"`];
  const artist = input.artist?.trim();
  if (artist) parts.push(`artist:"${artist}"`);

  const response = await spotifyRequest<TrackSearchResponse>('/search', {
    query: {
      q: parts.join(' '),
      type: 'track',
      limit: Math.min(Math.max(limit, 1), 20),
    },
  });

  return (response.tracks?.items ?? []).filter(
    (track): track is SpotifyTrack => Boolean(track && track.id && track.uri),
  );
}
