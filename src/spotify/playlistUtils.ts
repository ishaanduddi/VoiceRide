/** Small pure helpers for playlist objects. */

import type { SpotifyPlaylist } from './types';

/**
 * Number of items in a playlist.
 *
 * Spotify renamed this field: `tracks` is deprecated and now reports 0, while
 * the live count is `items.total`. Reading only `tracks` is why every playlist
 * displayed "0 tracks".
 */
export function playlistTrackCount(playlist: SpotifyPlaylist): number {
  return playlist.items?.total ?? playlist.tracks?.total ?? 0;
}

/**
 * Whether VoiceRiders can actually read this playlist's items.
 *
 * Spotify's playlist-items endpoint is documented as only accessible for
 * playlists the user OWNS or COLLABORATES on; anything else returns 403 — which
 * makes it impossible to build the numbered track map the voice commands need.
 *
 * When the current user id is unknown we optimistically allow the attempt and
 * let the API report it.
 */
export function isPlaylistReadable(playlist: SpotifyPlaylist, currentUserId?: string): boolean {
  if (!currentUserId) return true;
  if (playlist.collaborative) return true;
  return playlist.owner?.id === currentUserId;
}
