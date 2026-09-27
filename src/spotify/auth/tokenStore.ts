/**
 * Persistence of Spotify OAuth tokens.
 *
 * Tokens are written ONLY to the OS keychain via `storage/secureStore`.
 */

import { deleteSecure, loadJsonSecure, saveJsonSecure } from '@/storage/secureStore';
import type { TokenResponse } from 'expo-auth-session';

const TOKEN_KEY = 'voiceriders.spotify.tokens';
const PROFILE_KEY = 'voiceriders.spotify.profile';

export interface StoredTokens {
  accessToken: string;
  /** May be absent if Spotify did not rotate the refresh token. */
  refreshToken?: string;
  /** Absolute epoch ms after which the access token is considered stale. */
  expiresAt: number;
  scope?: string;
  tokenType: string;
}

export interface StoredProfile {
  id: string;
  displayName: string | null;
  product?: string;
  imageUrl?: string;
}

/** Refresh a minute early to avoid racing the expiry while a request is in flight. */
const EXPIRY_MARGIN_MS = 60_000;

export function tokensFromResponse(response: TokenResponse): StoredTokens {
  const issuedAtMs = (response.issuedAt ?? Math.floor(Date.now() / 1000)) * 1000;
  const expiresInMs = (response.expiresIn ?? 3600) * 1000;
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: issuedAtMs + expiresInMs - EXPIRY_MARGIN_MS,
    scope: response.scope,
    tokenType: response.tokenType ?? 'Bearer',
  };
}

export function isTokenExpired(tokens: StoredTokens): boolean {
  return Date.now() >= tokens.expiresAt;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await saveJsonSecure(TOKEN_KEY, tokens);
}

export async function loadTokens(): Promise<StoredTokens | null> {
  return loadJsonSecure<StoredTokens>(TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  await deleteSecure(TOKEN_KEY);
}

export async function saveProfile(profile: StoredProfile): Promise<void> {
  await saveJsonSecure(PROFILE_KEY, profile);
}

export async function loadProfile(): Promise<StoredProfile | null> {
  return loadJsonSecure<StoredProfile>(PROFILE_KEY);
}

export async function clearProfile(): Promise<void> {
  await deleteSecure(PROFILE_KEY);
}
