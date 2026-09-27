/**
 * Central runtime configuration.
 *
 * Values prefixed with EXPO_PUBLIC_ are inlined into the JavaScript bundle by
 * Expo at build time (see `.env.example`). This file deliberately contains NO
 * secrets: the Spotify **client secret is never used anywhere in this app**,
 * because authentication uses the OAuth 2.0 Authorization Code flow with PKCE
 * (public client). Access/refresh tokens live only in the OS keychain via
 * expo-secure-store.
 */

import { Platform } from 'react-native';

const rawEnv = process.env;

function readEnv(key: string): string | undefined {
  const value = rawEnv[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Scopes required by the features implemented in this app. */
export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
] as const;

export const spotifyConfig = {
  /** Public client id from https://developer.spotify.com/dashboard */
  clientId: readEnv('EXPO_PUBLIC_SPOTIFY_CLIENT_ID') ?? '',
  market: readEnv('EXPO_PUBLIC_SPOTIFY_MARKET'),
  scopes: [...SPOTIFY_SCOPES],
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
  apiBase: 'https://api.spotify.com/v1',
  /** Deep-link path appended to the app scheme: voiceriders://spotify-callback */
  redirectPath: 'spotify-callback',
  scheme: 'voiceriders',
};

export const asrConfig = {
  endpoint: readEnv('EXPO_PUBLIC_ASR_ENDPOINT'),
  apiKey: readEnv('EXPO_PUBLIC_ASR_API_KEY'),
  model: readEnv('EXPO_PUBLIC_ASR_MODEL') ?? 'whisper-1',
} as const;

export const isSpotifyConfigured = (): boolean => spotifyConfig.clientId.length > 0;

export const isCloudAsrConfigured = (): boolean => Boolean(asrConfig.endpoint);

export const platformName = Platform.OS;

/** Audio/VAD tuning shared between the microphone hook and the adaptive audio engine. */
export const audioConfig = {
  sampleRate: 16000,
  channels: 1,
  /** ~30 ms frames are a good trade-off for mobile VAD. */
  frameMs: 30,
  /** Analyser window: how often we evaluate a frame. */
  frameIntervalMs: 30,
} as const;
