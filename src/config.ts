/**
 * Central runtime configuration.
 *
 * ⚠️ DO NOT refactor these into dynamic lookups such as `process.env[key]`.
 *
 * `babel-preset-expo` only inlines **statically written**
 * `process.env.EXPO_PUBLIC_*` member expressions. A dynamic index (`env[key]`)
 * is never substituted, so in a release build every value silently becomes
 * `undefined` — which is exactly what hid the Spotify client id and the relay
 * URL from the first APK. Keep the dotted form, one constant per variable.
 *
 * This file contains NO secrets: the Spotify client secret is never used
 * anywhere (authentication is OAuth 2.0 + PKCE), and access/refresh tokens live
 * only in the OS keychain via expo-secure-store.
 */

import { Platform } from 'react-native';

// --- Static reads (required for build-time inlining) ------------------------
const envSpotifyClientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
const envSpotifyMarket = process.env.EXPO_PUBLIC_SPOTIFY_MARKET;
const envSpotifyRedirectUri = process.env.EXPO_PUBLIC_SPOTIFY_REDIRECT_URI;
const envSpotifyAppReturnUri = process.env.EXPO_PUBLIC_SPOTIFY_APP_RETURN_URI;

const envAsrProvider = process.env.EXPO_PUBLIC_ASR_PROVIDER;
const envAsrEndpoint = process.env.EXPO_PUBLIC_ASR_ENDPOINT;
const envAsrApiKey = process.env.EXPO_PUBLIC_ASR_API_KEY;
const envAsrModel = process.env.EXPO_PUBLIC_ASR_MODEL;

const envWhisperModelUrl = process.env.EXPO_PUBLIC_WHISPER_MODEL_URL;
const envWhisperModelFilename = process.env.EXPO_PUBLIC_WHISPER_MODEL_FILENAME;
const envWhisperUseGpu = process.env.EXPO_PUBLIC_WHISPER_USE_GPU;
const envWhisperMaxThreads = process.env.EXPO_PUBLIC_WHISPER_MAX_THREADS;

/** Trims a value and treats an empty string as "not set". */
function clean(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const cleaned = clean(value);
  return cleaned && (allowed as readonly string[]).includes(cleaned) ? (cleaned as T) : fallback;
}

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number(clean(value) ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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
  clientId: clean(envSpotifyClientId) ?? '',
  market: clean(envSpotifyMarket),
  scopes: [...SPOTIFY_SCOPES],
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
  apiBase: 'https://api.spotify.com/v1',
  /**
   * HTTPS redirect URI registered in the Spotify dashboard.
   *
   * Spotify ENFORCES HTTPS redirect URIs (custom app schemes are rejected and
   * `localhost` is not allowed), so on mobile this must point at a small relay
   * that bounces the callback back to the app. See `relay/` and
   * docs/SPOTIFY_SETUP.md.
   */
  redirectUri: clean(envSpotifyRedirectUri),
  /** Where the relay returns into the app. Defaults to `<scheme>://spotify-callback`. */
  appReturnUri: clean(envSpotifyAppReturnUri),
  /** Deep-link path appended to the app scheme: voiceriders://spotify-callback */
  redirectPath: 'spotify-callback',
  scheme: 'voiceriders',
};

export type AsrProviderPreference = 'auto' | 'on-device' | 'cloud' | 'off';

const ASR_PREFERENCES: readonly AsrProviderPreference[] = ['auto', 'on-device', 'cloud', 'off'];

export const asrConfig = {
  /**
   * Which speech engine to use.
   *   auto      - on-device when the model is installed, else cloud, else none
   *   on-device - whisper.cpp on the phone (needs a development build)
   *   cloud     - POST each utterance to EXPO_PUBLIC_ASR_ENDPOINT
   *   off       - disable recognition
   */
  provider: readEnum<AsrProviderPreference>(envAsrProvider, ASR_PREFERENCES, 'auto'),
  endpoint: clean(envAsrEndpoint),
  apiKey: clean(envAsrApiKey),
  model: clean(envAsrModel) ?? 'whisper-1',
} as const;

/** On-device whisper.cpp configuration (see docs/ON_DEVICE_ASR.md). */
export const whisperConfig = {
  /** GGML model downloaded at runtime; never bundled in the repository. */
  modelUrl:
    clean(envWhisperModelUrl) ??
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  modelFilename: clean(envWhisperModelFilename) ?? 'ggml-tiny.en.bin',
  /** GPU (iOS Core ML / Metal, Android Vulkan + Hexagon NPU when available). */
  useGpu: clean(envWhisperUseGpu) !== 'false',
  maxThreads: readInt(envWhisperMaxThreads, 4),
} as const;

export const isSpotifyConfigured = (): boolean => spotifyConfig.clientId.length > 0;

/** True when an HTTPS redirect URI (the relay) has been configured. */
export const isRedirectConfigured = (): boolean => Boolean(spotifyConfig.redirectUri);

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
