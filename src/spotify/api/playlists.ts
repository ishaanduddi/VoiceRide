import type { PlaylistTrackItem, SpotifyPaging, SpotifyPlaylist } from '../types';
import { spotifyRequest } from './client';

const PAGE_SIZE = 50;
const TRACK_PAGE_SIZE = 100;

/** Only request the fields we render — keeps payloads small on mobile data. */
const TRACK_FIELDS = [
  'items(is_local,track(id,name,uri,duration_ms,is_playable,artists(id,name),album(id,name,images)))',
  'next',
  'total',
  'offset',
  'limit',
].join(',');

/** Fetches all of the user's playlists, following pagination up to `maxItems`. */
export async function getUserPlaylists(maxItems = 200): Promise<SpotifyPlaylist[]> {
  const playlists: SpotifyPlaylist[] = [];
  let offset = 0;

  while (playlists.length < maxItems) {
    const page = await spotifyRequest<SpotifyPaging<SpotifyPlaylist>>('/me/playlists', {
      query: { limit: PAGE_SIZE, offset },
    });

    for (const playlist of page.items ?? []) {
      if (playlist && playlist.id) playlists.push(playlist);
    }

    if (!page.next || (page.items ?? []).length === 0) break;
    offset += PAGE_SIZE;
  }

  return playlists;
}

export async function getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
  return spotifyRequest<SpotifyPlaylist>(`/playlists/${playlistId}`);
}

/**
 * Fetches every entry of a playlist in order.
 *
 * The returned array preserves the playlist's own ordering AND includes
 * non-playable / null entries, so the array index can be used directly as the
 * Spotify `offset.position` when starting playback.
 */
export async function getPlaylistTrackItems(
  playlistId: string,
  maxItems = 1000,
): Promise<PlaylistTrackItem[]> {
  const items: PlaylistTrackItem[] = [];
  let offset = 0;

  while (items.length < maxItems) {
    const page = await spotifyRequest<SpotifyPaging<PlaylistTrackItem>>(
      `/playlists/${playlistId}/tracks`,
      {
        query: {
          limit: TRACK_PAGE_SIZE,
          offset,
          fields: TRACK_FIELDS,
        },
      },
    );

    items.push(...(page.items ?? []));

    if (!page.next || (page.items ?? []).length === 0) break;
    offset += TRACK_PAGE_SIZE;
  }

  return items;
}
