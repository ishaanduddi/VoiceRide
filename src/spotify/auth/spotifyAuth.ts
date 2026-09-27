/**
 * Spotify OAuth 2.0 Authorization Code flow with PKCE.
 *
 * There is deliberately NO client secret here: the client proves itself only
 * with the PKCE `code_verifier`, which never leaves the device.
 *
 * ── Why this file builds the authorization URL by hand ──────────────────────
 * Spotify now requires the redirect URI to be HTTPS (custom app schemes are
 * rejected and `localhost` is not allowed). A phone cannot listen on a public
 * HTTPS URL, so the redirect goes to a tiny relay (`relay/`) which bounces the
 * callback back to the app's custom scheme:
 *
 *   Spotify ──► https://<relay>/api/spotify-callback?code=…&state=…
 *                    │  (register THIS address in the Spotify dashboard)
 *                    └──► voiceriders://spotify-callback?code=…&state=…
 *                                 │  (what WebBrowser waits for)
 *                                 └──► code + verifier exchanged for tokens
 *
 * AuthRequest could not express this two-hop redirect, so the URL is assembled
 * explicitly and `WebBrowser.openAuthSessionAsync` watches for the app scheme.
 */

import * as AuthSession from 'expo-auth-session';
import type { TokenResponse } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { isRedirectConfigured, isSpotifyConfigured, spotifyConfig } from '@/config';
import { SpotifyAuthError } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

import { createCodeChallenge, createCodeVerifier, createState } from './pkce';
import { tokensFromResponse, type StoredTokens } from './tokenStore';

// Required so the browser tab closes itself after the redirect on web.
WebBrowser.maybeCompleteAuthSession();

const log = createLogger('spotify:auth');

/** Spotify does not publish a discovery document; declare the endpoints. */
export const spotifyDiscovery = {
  authorizationEndpoint: spotifyConfig.authorizationEndpoint,
  tokenEndpoint: spotifyConfig.tokenEndpoint,
};

/**
 * The HTTPS redirect URI to register in the Spotify dashboard
 * (`EXPO_PUBLIC_SPOTIFY_REDIRECT_URI`, e.g. the deployed relay).
 * Returns an empty string when not configured.
 */
export function getSpotifyRedirectUri(): string {
  return spotifyConfig.redirectUri ?? '';
}

/**
 * The URI the relay hands the user back to — the app's own scheme, which is what
 * `openAuthSessionAsync` watches for. Configurable for Expo Go, where the URI is
 * `exp://<host>/--/spotify-callback` and changes per machine.
 */
export function getAppReturnUri(): string {
  return (
    spotifyConfig.appReturnUri ??
    AuthSession.makeRedirectUri({
      scheme: spotifyConfig.scheme,
      path: spotifyConfig.redirectPath,
    })
  );
}

function buildQuery(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
    .join('&');
}

/** Extracts query (or fragment) parameters from a redirect URL without URLSearchParams. */
export function parseRedirectParams(url: string): Record<string, string> {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');

  let raw = '';
  if (queryIndex >= 0) {
    raw = url.slice(queryIndex + 1, hashIndex > queryIndex ? hashIndex : undefined);
  } else if (hashIndex >= 0) {
    raw = url.slice(hashIndex + 1);
  }

  const params: Record<string, string> = {};
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const equals = pair.indexOf('=');
    const key = decodeURIComponent(equals >= 0 ? pair.slice(0, equals) : pair);
    const value = equals >= 0 ? decodeURIComponent(pair.slice(equals + 1)) : '';
    params[key] = value;
  }
  return params;
}

/** Opens Spotify's consent screen and exchanges the returned code. */
export async function authorizeWithSpotify(): Promise<StoredTokens> {
  if (!isSpotifyConfigured()) {
    throw new SpotifyAuthError(
      'No Spotify client id configured. Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID in your .env file.',
    );
  }
  if (!isRedirectConfigured()) {
    throw new SpotifyAuthError(
      'No HTTPS redirect URI configured. Spotify rejects custom app schemes, so deploy the relay in relay/ ' +
        'and set EXPO_PUBLIC_SPOTIFY_REDIRECT_URI (see docs/SPOTIFY_SETUP.md).',
    );
  }

  const redirectUri = getSpotifyRedirectUri();
  const returnUri = getAppReturnUri();

  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createState();

  const authorizationUrl = `${spotifyConfig.authorizationEndpoint}?${buildQuery({
    response_type: 'code',
    client_id: spotifyConfig.clientId,
    scope: spotifyConfig.scopes.join(' '),
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    show_dialog: 'false',
  })}`;

  log.info('opening Spotify consent', { redirectUri, returnUri });

  const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, returnUri);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new SpotifyAuthError('Spotify sign-in was cancelled.');
  }
  if (result.type !== 'success' || !result.url) {
    throw new SpotifyAuthError('Spotify sign-in did not complete.');
  }

  const params = parseRedirectParams(result.url);

  if (params.error) {
    throw new SpotifyAuthError(
      `Spotify rejected the sign-in: ${params.error}${params.error_description ? ` — ${params.error_description}` : ''}`,
    );
  }
  // CSRF check: the value we generated must come back unchanged.
  if (params.state !== state) {
    throw new SpotifyAuthError('OAuth state mismatch — the response was rejected.');
  }
  const code = params.code;
  if (!code) {
    throw new SpotifyAuthError('Spotify did not return an authorization code.');
  }

  // NOTE: `redirectUri` must be identical to the one used above.
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: spotifyConfig.clientId,
      code,
      redirectUri,
      extraParams: { code_verifier: codeVerifier },
    },
    spotifyDiscovery,
  );

  log.info('Spotify authorization complete');
  return tokensFromResponse(tokenResponse);
}

/** Exchanges a refresh token for a fresh access token. */
export async function refreshSpotifyTokens(refreshToken: string): Promise<StoredTokens> {
  if (!isSpotifyConfigured()) {
    throw new SpotifyAuthError('No Spotify client id configured.');
  }

  const response: TokenResponse = await AuthSession.refreshAsync(
    { clientId: spotifyConfig.clientId, refreshToken },
    spotifyDiscovery,
  );

  const tokens = tokensFromResponse(response);
  // Spotify only returns a new refresh_token occasionally; keep the old one.
  if (!tokens.refreshToken) tokens.refreshToken = refreshToken;
  return tokens;
}

export { AuthSession };
