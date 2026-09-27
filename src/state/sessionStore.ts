/** Spotify session state (who is connected) and connect/disconnect actions. */

import { getConnectionState, connectSpotify, disconnectSpotify, loadCachedProfile, cacheProfile } from '@/spotify/auth/authService';
import { getCurrentUserProfile } from '@/spotify/api/me';
import { toUserMessage } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

import { clearLibrary } from './libraryStore';
import { ObservableStore } from './observable';
import { contextManager } from './contextStore';

const log = createLogger('state:session');

export type SessionStatus = 'unknown' | 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SessionState {
  status: SessionStatus;
  displayName?: string;
  product?: string;
  imageUrl?: string;
  error?: string;
}

export const sessionStore = new ObservableStore<SessionState>({ status: 'unknown' });

/** Reads the persisted session and refreshes the profile when possible. */
export async function refreshSession(): Promise<void> {
  const connection = await getConnectionState();
  if (connection === 'disconnected') {
    sessionStore.setState({ status: 'disconnected', displayName: undefined, error: undefined });
    contextManager.setState({ spotifyConnected: false });
    return;
  }

  // Show the cached profile immediately, then refresh it in the background.
  const cached = await loadCachedProfile();
  if (cached) {
    sessionStore.setState({
      status: 'connected',
      displayName: cached.displayName ?? cached.id,
      product: cached.product,
      imageUrl: cached.imageUrl,
    });
    contextManager.setState({ spotifyConnected: true });
  }

  try {
    const profile = await getCurrentUserProfile();
    const displayName = profile.display_name ?? profile.id;
    const imageUrl = profile.images?.[0]?.url;
    await cacheProfile({
      id: profile.id,
      displayName,
      product: profile.product,
      imageUrl,
    });
    sessionStore.setState({
      status: 'connected',
      displayName,
      product: profile.product,
      imageUrl,
      error: undefined,
    });
    contextManager.setState({ spotifyConnected: true });
  } catch (error) {
    log.warn('could not load the Spotify profile', error);
    if (!cached) {
      sessionStore.setState({ status: 'error', error: toUserMessage(error) });
      contextManager.setState({ spotifyConnected: false });
    }
  }
}

/** Runs the full OAuth + PKCE flow, then loads the profile. */
export async function connectSpotifyAccount(): Promise<void> {
  sessionStore.setState({ status: 'connecting', error: undefined });
  try {
    await connectSpotify();
    await refreshSession();
  } catch (error) {
    sessionStore.setState({ status: 'error', error: toUserMessage(error) });
    throw error;
  }
}

export async function disconnectSpotifyAccount(): Promise<void> {
  await disconnectSpotify();
  clearLibrary();
  sessionStore.setState({ status: 'disconnected', displayName: undefined, product: undefined, imageUrl: undefined, error: undefined });
  contextManager.setState({ spotifyConnected: false, playlistId: undefined, playlistName: undefined, playlistUri: undefined, trackCount: 0, isPlaying: false });
}
