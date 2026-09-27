/**
 * Session lifecycle: connect, refresh (single-flight), disconnect.
 *
 * Every Spotify call in the app obtains its bearer token from
 * `getAccessToken()`. Callers never touch raw tokens.
 */

import { SpotifyAuthError, SpotifyNotConnectedError } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

import { authorizeWithSpotify, refreshSpotifyTokens } from './spotifyAuth';
import {
  clearProfile,
  clearTokens,
  isTokenExpired,
  loadProfile,
  loadTokens,
  saveProfile,
  saveTokens,
  type StoredProfile,
  type StoredTokens,
} from './tokenStore';

const log = createLogger('spotify:session');

export type ConnectionState = 'connected' | 'expired' | 'disconnected';

/**
 * Concurrent refreshes are collapsed into one request: mobile radios are
 * expensive and Spotify invalidates rotated refresh tokens.
 */
let refreshInFlight: Promise<StoredTokens> | null = null;

async function refreshSingleFlight(tokens: StoredTokens): Promise<StoredTokens> {
  if (!tokens.refreshToken) {
    await clearTokens();
    throw new SpotifyNotConnectedError('Your Spotify session expired. Please reconnect.');
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const refreshed = await refreshSpotifyTokens(tokens.refreshToken as string);
        await saveTokens(refreshed);
        log.info('access token refreshed');
        return refreshed;
      } catch (error) {
        log.warn('token refresh failed, clearing session', error);
        await clearTokens();
        throw new SpotifyAuthError('Could not refresh your Spotify session. Please reconnect.', error);
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

/** Returns tokens, refreshing transparently when they are (nearly) expired. */
export async function getValidTokens(): Promise<StoredTokens> {
  const tokens = await loadTokens();
  if (!tokens) throw new SpotifyNotConnectedError();
  if (!isTokenExpired(tokens)) return tokens;
  return refreshSingleFlight(tokens);
}

export async function getAccessToken(): Promise<string> {
  return (await getValidTokens()).accessToken;
}

/** Unconditional refresh, used by the API client after a 401 response. */
export async function forceRefreshAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new SpotifyNotConnectedError();
  return (await refreshSingleFlight(tokens)).accessToken;
}

export async function connectSpotify(): Promise<StoredTokens> {
  const tokens = await authorizeWithSpotify();
  await saveTokens(tokens);
  return tokens;
}

export async function disconnectSpotify(): Promise<void> {
  await clearTokens();
  await clearProfile();
  log.info('Spotify disconnected');
}

export async function getConnectionState(): Promise<ConnectionState> {
  const tokens = await loadTokens();
  if (!tokens) return 'disconnected';
  if (isTokenExpired(tokens) && !tokens.refreshToken) return 'expired';
  return 'connected';
}

export async function loadCachedProfile(): Promise<StoredProfile | null> {
  return loadProfile();
}

export async function cacheProfile(profile: StoredProfile): Promise<void> {
  await saveProfile(profile);
}

export type { StoredProfile, StoredTokens };
