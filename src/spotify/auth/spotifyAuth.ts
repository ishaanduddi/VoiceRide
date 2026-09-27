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
 * ── Why there are two entry points for the callback ────────────────────────
 * On Android the custom-scheme redirect can be delivered EITHER to the in-app
 * browser session (which resolves `openAuthSessionAsync`) OR to the app itself
 * as a deep link, which lands on the `/spotify-callback` route — and if the OS
 * killed the backgrounded app, only the second one happens. Both paths call
 * `completeAuthorization()`, and the single-use entry in `pendingAuth` guarantees
 * the code is exchanged exactly once.
 */

import * as AuthSession from 'expo-auth-session';
import type { TokenResponse } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { isRedirectConfigured, isSpotifyConfigured, spotifyConfig } from '@/config';
import { SpotifyAuthError } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

import { consumePendingAuth, savePendingAuth } from './pendingAuth';
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

/**
 * Turns an expo-auth-session `TokenError` into something actionable.
 *
 * The library reports only "the request failed"; the useful part is the OAuth
 * error the provider returned (`invalid_grant`, `invalid_client`, …) plus its
 * description, which `ResponseError` exposes via `code`/`description`/`params`.
 */
function describeProviderError(error: unknown): string {
  const failure = error as {
    code?: string;
    description?: string;
    params?: Record<string, string>;
    message?: string;
  };

  const providerError = failure?.params?.error ?? failure?.code;
  const providerDescription = failure?.params?.error_description ?? failure?.description;
  const detail = [providerError, providerDescription].filter(Boolean).join(' — ');

  if (detail) return `Spotify rejected the sign-in: ${detail}`;
  return failure?.message ?? 'Spotify rejected the sign-in.';
}

/**
 * Completes an authorization from a redirect URL.
 *
 * Used by both the in-app browser session and the `/spotify-callback` route.
 * The PKCE verifier comes from secure storage, so this also works after the app
 * was killed and cold-started by the deep link.
 */
export async function completeAuthorization(redirectUrl: string): Promise<StoredTokens> {
  const params = parseRedirectParams(redirectUrl);

  if (params.error) {
    throw new SpotifyAuthError(
      `Spotify rejected the sign-in: ${params.error}${
        params.error_description ? ` — ${params.error_description}` : ''
      }`,
    );
  }

  const state = params.state;
  if (!state) throw new SpotifyAuthError('Spotify did not return an OAuth state value.');

  // Single use: also validates the state, so a forged callback cannot be used.
  const pending = await consumePendingAuth(state);
  if (!pending) {
    throw new SpotifyAuthError(
      'This sign-in link has already been used or has expired. Please start again.',
    );
  }

  const code = params.code;
  if (!code) throw new SpotifyAuthError('Spotify did not return an authorization code.');

  let tokenResponse: TokenResponse;
  try {
    tokenResponse = await AuthSession.exchangeCodeAsync(
      {
        clientId: spotifyConfig.clientId,
        code,
        // Must be identical to the value used in the authorization request.
        redirectUri: pending.redirectUri,
        extraParams: { code_verifier: pending.verifier },
      },
      spotifyDiscovery,
    );
  } catch (error) {
    log.warn('token exchange failed', error);
    throw new SpotifyAuthError(describeProviderError(error));
  }

  log.info('Spotify authorization complete');
  return tokensFromResponse(tokenResponse);
}

/**
 * Guards against two overlapping authorizations.
 *
 * Two in-flight attempts would each persist a different PKCE verifier, so
 * completing the older one would fail with `invalid_grant`. A double-tap on
 * "Connect Spotify" must not be able to create that state.
 */
let authorizationInFlight = false;

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
  if (authorizationInFlight) {
    throw new SpotifyAuthError('A Spotify sign-in is already in progress.');
  }
  authorizationInFlight = true;

  try {
    const redirectUri = getSpotifyRedirectUri();
    const returnUri = getAppReturnUri();

    const codeVerifier = createCodeVerifier();
    const codeChallenge = await createCodeChallenge(codeVerifier);
    const state = createState();

    // Persist BEFORE leaving the app: the process may be killed while the user
    // signs in, and the cold-started callback still has to complete.
    await savePendingAuth({ state, verifier: codeVerifier, redirectUri, createdAt: Date.now() });

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

    if (result.type !== 'success' || !result.url) {
      // IMPORTANT: do NOT clear the pending authorization — on Android the
      // deep link may have been delivered to the app instead, and the
      // /spotify-callback route still needs to complete the exchange.
      log.info(`browser session ended as "${result.type}"; awaiting deep-link completion`);
      throw new SpotifyAuthError(
        'Spotify sign-in did not return to the app. If the browser closed without a message, reopen VoiceRiders — ' +
          'the sign-in may still complete.',
      );
    }

    return await completeAuthorization(result.url);
  } finally {
    authorizationInFlight = false;
  }
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
