/**
 * Choosing which search result to play.
 *
 * The rider's rule: for a bare title, play the best-known version; if they name
 * an artist ("believer by imagine dragons"), only that artist's track.
 *
 * Spotify does NOT expose play counts or "views", so `popularity` (0-100, derived
 * from recent plays) is the closest available proxy for "most played".
 */

import { artistLine } from '../playback/playlistTrackMap';
import type { SpotifyTrack } from '../types';

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Scored {
  track: SpotifyTrack;
  /** 1 = exact title match, 0.6 = partial, 0 = unrelated. */
  titleScore: number;
  artistHit: boolean;
  popularity: number;
}

function scoreTrack(track: SpotifyTrack, title: string, artist?: string): Scored {
  const wantedTitle = normalise(title);
  const trackTitle = normalise(track.name);

  const titleScore =
    trackTitle === wantedTitle
      ? 1
      : trackTitle.includes(wantedTitle) || wantedTitle.includes(trackTitle)
        ? 0.6
        : 0;

  const artists = (track.artists ?? []).map((entry) => normalise(entry.name));
  const wantedArtist = artist ? normalise(artist) : undefined;
  const artistHit = wantedArtist
    ? artists.some(
        (name) => name === wantedArtist || name.includes(wantedArtist) || wantedArtist.includes(name),
      )
    : false;

  return { track, titleScore, artistHit, popularity: track.popularity ?? 0 };
}

/**
 * Picks the track to play.
 *
 *  - with an artist: only that artist's tracks are considered (falls back to the
 *    full list if the filter would leave nothing)
 *  - then: exact title beats partial, then artist match, then popularity
 */
export function pickBestTrack(
  tracks: SpotifyTrack[],
  title: string,
  artist?: string,
): SpotifyTrack | undefined {
  if (tracks.length === 0) return undefined;

  const scored = tracks.map((track) => scoreTrack(track, title, artist));

  const artistMatches = artist ? scored.filter((entry) => entry.artistHit) : [];
  const pool = artistMatches.length > 0 ? artistMatches : scored;

  pool.sort((a, b) => {
    if (b.titleScore !== a.titleScore) return b.titleScore - a.titleScore;
    if (b.artistHit !== a.artistHit) return Number(b.artistHit) - Number(a.artistHit);
    return b.popularity - a.popularity;
  });

  return pool[0]?.track;
}

/** "Believer — Imagine Dragons" for spoken confirmation. */
export function describeTrack(track: SpotifyTrack): string {
  const artist = artistLine(track);
  return artist && artist !== 'Unknown artist' ? `${track.name} by ${artist}` : track.name;
}
