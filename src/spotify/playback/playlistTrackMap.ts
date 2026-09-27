/**
 * Local mapping: playlist position -> Spotify track.
 *
 * This is the table that makes "play song number seven" work. It preserves the
 * playlist's ordering AND records each entry's raw position inside the Spotify
 * playlist, because `PUT /me/player/play` expects `offset.position` to count
 * every item (including the non-playable ones we hide from the rider).
 */

import { AppError } from '@/utils/errors';

import type { PlaylistTrackItem, SpotifyPlaylist, SpotifyTrack } from '../types';

export interface TrackEntry {
  /** 1-based number shown to the rider and used in voice commands. */
  displayIndex: number;
  /** 0-based position inside the raw Spotify playlist. */
  spotifyPosition: number;
  trackId: string;
  uri: string;
  name: string;
  artists: string;
  albumName: string;
  durationMs: number;
}

export interface PlaylistTrackMap {
  playlistId: string;
  playlistName: string;
  playlistUri: string;
  entries: TrackEntry[];
  /** Number of raw items returned by Spotify (including skipped ones). */
  totalItems: number;
}

export function artistLine(track: SpotifyTrack): string {
  const names = (track.artists ?? []).map((artist) => artist.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Unknown artist';
}

/** Builds a playable, ordered track map from a playlist and its raw items. */
export function buildPlaylistTrackMap(
  playlist: SpotifyPlaylist,
  items: PlaylistTrackItem[],
): PlaylistTrackMap {
  const entries: TrackEntry[] = [];

  items.forEach((item, rawIndex) => {
    // `item` is the current field name; `track` is the deprecated alias.
    const track = item?.item ?? item?.track;
    // Local files and removed tracks cannot be played through the Web API.
    if (!track || !track.id || !track.uri || item?.is_local) return;

    entries.push({
      displayIndex: entries.length + 1,
      spotifyPosition: rawIndex,
      trackId: track.id,
      uri: track.uri,
      name: track.name,
      artists: artistLine(track),
      albumName: track.album?.name ?? '',
      durationMs: track.duration_ms ?? 0,
    });
  });

  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    playlistUri: playlist.uri,
    entries,
    totalItems: items.length,
  };
}

/** Resolves a spoken song number to a track, validating the playlist range. */
export function resolveTrackNumber(
  map: PlaylistTrackMap | null | undefined,
  songNumber: number,
): TrackEntry {
  if (!map) {
    throw new AppError('NO_PLAYLIST_SELECTED', 'Select a playlist first.');
  }
  if (map.entries.length === 0) {
    throw new AppError('EMPTY_PLAYLIST', 'That playlist has no playable songs.');
  }
  if (!Number.isInteger(songNumber) || songNumber < 1) {
    throw new AppError('INVALID_SONG_NUMBER', 'That is not a valid song number.');
  }
  if (songNumber > map.entries.length) {
    throw new AppError('SONG_OUT_OF_RANGE', `That playlist has only ${map.entries.length} songs.`);
  }
  return map.entries[songNumber - 1] as TrackEntry;
}

export function describeTrack(entry: TrackEntry): string {
  return entry.artists ? `${entry.name} by ${entry.artists}` : entry.name;
}
