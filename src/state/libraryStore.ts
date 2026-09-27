/** Playlists, the selected playlist, and the playlist->track map. */

import { AppError, toUserMessage } from '@/utils/errors';
import { createLogger } from '@/utils/logger';
import { getPlaylistTrackItems, getUserPlaylists } from '@/spotify/api/playlists';
import { isPlaylistReadable } from '@/spotify/playlistUtils';
import {
  buildPlaylistTrackMap,
  type PlaylistTrackMap,
} from '@/spotify/playback/playlistTrackMap';
import { loadCachedProfile } from '@/spotify/auth/authService';
import type { SpotifyPlaylist } from '@/spotify/types';

import { contextManager } from './contextStore';
import { ObservableStore } from './observable';
import { settingsStore, updateSettings } from './settingsStore';

const log = createLogger('state:library');

export interface LibraryState {
  playlists: SpotifyPlaylist[];
  playlistsLoading: boolean;
  playlistsError?: string;

  /** Spotify user id of the connected account (used to judge readability). */
  userId?: string;
  /**
   * How many loaded playlists cannot be read by this app.
   *
   * Spotify only exposes a playlist's items to its **owner or collaborators**,
   * so playlists owned by others return 403 and cannot be used at all.
   */
  unreadableCount: number;

  selectedPlaylistId?: string;
  selectedPlaylistName?: string;
  trackMap: PlaylistTrackMap | null;
  tracksLoading: boolean;
  tracksError?: string;
}

export const libraryStore = new ObservableStore<LibraryState>({
  playlists: [],
  playlistsLoading: false,
  unreadableCount: 0,
  trackMap: null,
  tracksLoading: false,
});

/** Loads the user's playlists (idempotent unless `force`). */
export async function loadPlaylists(force = false): Promise<void> {
  const state = libraryStore.getState();
  if (!force && (state.playlistsLoading || state.playlists.length > 0)) return;

  libraryStore.setState({ playlistsLoading: true, playlistsError: undefined });
  try {
    const profile = await loadCachedProfile().catch(() => null);
    const userId = profile?.id;

    const playlists = await getUserPlaylists();
    const unreadableCount = playlists.filter(
      (playlist) => !isPlaylistReadable(playlist, userId),
    ).length;

    libraryStore.setState({ playlists, playlistsLoading: false, userId, unreadableCount });

    if (unreadableCount > 0) {
      log.info(`${unreadableCount}/${playlists.length} playlists are not readable by this app`);
    }

    // Restore the previously selected playlist.
    const lastPlaylistId = settingsStore.getState().lastPlaylistId;
    if (lastPlaylistId && !libraryStore.getState().selectedPlaylistId) {
      const previous = playlists.find((playlist) => playlist.id === lastPlaylistId);
      if (previous && isPlaylistReadable(previous, userId)) {
        await selectPlaylist(lastPlaylistId).catch((error) =>
          log.warn('could not restore the previous playlist', error),
        );
      }
    }
  } catch (error) {
    libraryStore.setState({ playlistsLoading: false, playlistsError: toUserMessage(error) });
    throw error;
  }
}

/** Loads a playlist's tracks and builds the numbered track map. */
export async function selectPlaylist(playlistId: string): Promise<void> {
  const playlist = libraryStore
    .getState()
    .playlists.find((candidate) => candidate.id === playlistId);

  if (!playlist) {
    throw new AppError('NO_PLAYLIST_SELECTED', 'That playlist could not be found. Reload your playlists.');
  }

  libraryStore.setState({
    selectedPlaylistId: playlistId,
    selectedPlaylistName: playlist.name,
    tracksLoading: true,
    tracksError: undefined,
  });

  try {
    const items = await getPlaylistTrackItems(playlistId);
    const trackMap = buildPlaylistTrackMap(playlist, items);

    libraryStore.setState({ trackMap, tracksLoading: false });

    contextManager.setState({
      playlistId: playlist.id,
      playlistName: playlist.name,
      playlistUri: playlist.uri,
      trackCount: trackMap.entries.length,
      currentTrackIndex: undefined,
      currentTrackName: undefined,
    });

    await updateSettings({ lastPlaylistId: playlistId });
    log.info(`selected "${playlist.name}" (${trackMap.entries.length} playable tracks)`);
  } catch (error) {
    libraryStore.setState({ tracksLoading: false, tracksError: toUserMessage(error), trackMap: null });
    throw error;
  }
}

export function clearLibrary(): void {
  libraryStore.setState({
    playlists: [],
    playlistsError: undefined,
    userId: undefined,
    unreadableCount: 0,
    selectedPlaylistId: undefined,
    selectedPlaylistName: undefined,
    trackMap: null,
    tracksError: undefined,
  });
}
