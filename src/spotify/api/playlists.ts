import { SpotifyApiError } from '@/utils/errors';

import type { PlaylistTrackItem, SpotifyPaging, SpotifyPlaylist } from '../types';
import { spotifyRequest } from './client';

const PLAYLIST_PAGE_SIZE = 50;

/**
 * `/playlists/{id}/items` accepts a maximum of 50 items per page. The old
 * `/tracks` endpoint also capped at 50, so asking for 100 was rejected.
 */
const ITEM_PAGE_SIZE = 50;

/**
 * Only request the fields we render — keeps payloads small on mobile data.
 *
 * NOTE: the current response wraps each entry as `item`; the deprecated
 * `/tracks` endpoint used `track`. Both are handled in
 * `buildPlaylistTrackMap`, and if Spotify rejects this filter the request is
 * retried without it.
 */
const ITEM_FIELDS = [
  'items(is_local,item(id,name,uri,duration_ms,is_playable,artists(id,name),album(id,name,images)))',
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
      query: { limit: PLAYLIST_PAGE_SIZE, offset },
    });

    for (const playlist of page.items ?? []) {
      if (playlist && playlist.id) playlists.push(playlist);
    }

    if (!page.next || (page.items ?? []).length === 0) break;
    offset += PLAYLIST_PAGE_SIZE;
  }

  return playlists;
}

export async function getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
  return spotifyRequest<SpotifyPlaylist>(`/playlists/${playlistId}`);
}

/**
 * Fetches every entry of a playlist in order.
 *
 * Uses the current `/items` endpoint (the `/tracks` path is deprecated). The
 * returned array preserves the playlist's own ordering AND includes
 * non-playable / null entries, so the array index can be used directly as the
 * Spotify `offset.position` when starting playback.
 */
export async function getPlaylistTrackItems(
  playlistId: string,
  maxItems = 500,
): Promise<PlaylistTrackItem[]> {
  const items: PlaylistTrackItem[] = [];
  let offset = 0;
  let useFieldFilter = true;

  while (items.length < maxItems) {
    let page: SpotifyPaging<PlaylistTrackItem>;

    try {
      page = await spotifyRequest<SpotifyPaging<PlaylistTrackItem>>(
        `/playlists/${playlistId}/items`,
        {
          query: {
            limit: ITEM_PAGE_SIZE,
            offset,
            // Playlists may contain episodes as well as tracks.
            additional_types: 'track,episode',
            ...(useFieldFilter ? { fields: ITEM_FIELDS } : {}),
          },
        },
      );
    } catch (error) {
      // A rejected field filter is recoverable: retry once without it.
      if (useFieldFilter && error instanceof SpotifyApiError && error.status === 400) {
        useFieldFilter = false;
        continue;
      }
      throw error;
    }

    items.push(...(page.items ?? []));

    if (!page.next || (page.items ?? []).length === 0) break;
    offset += ITEM_PAGE_SIZE;
  }

  return items;
}
