/**
 * Spotify OAuth 2.0 Authorization Code flow with PKCE.
 *
 * There is deliberately NO client secret here. The client only proves itself
 * with the PKCE `code_verifier`, which never leaves the device.
 *
 * Flow:
 *   authorize()  -> open Spotify consent -> redirect back with `code`
 *   exchange()   -> swap `code` + `code_verifier` for tokens
 *   refresh()    -> swap `refresh_token` for a new access token
 */

import * as AuthSession from 'expo-auth-session';
import {
  AuthRequest,
  CodeChallengeMethod,
  ResponseType,
  type TokenResponse,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { isSpotifyConfigured, spotifyConfig } from '@/config';
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
 * The redirect URI that must be registered verbatim in the Spotify dashboard.
 * Dev build / production: `voiceriders://spotify-callback`
 * Expo Go (dev only):     `exp://<host>/--/spotify-callback`
 */
export function getSpotifyRedirectUri(): string {
  return AuthSession.makeRedirectUri({
    scheme: spotifyConfig.scheme,
    path: spotifyConfig.redirectPath,
  });
}

/** Opens the Spotify consent screen and exchanges the returned code. */
export async function authorizeWithSpotify(): Promise<StoredTokens> {
  if (!isSpotifyConfigured()) {
    throw new SpotifyAuthError(
      'No Spotify client id configured. Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID in your .env file.',
    );
  }

  const redirectUri = getSpotifyRedirectUri();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createState();

  const request = new AuthRequest({
    clientId: spotifyConfig.clientId,
    scopes: spotifyConfig.scopes,
    redirectUri,
    responseType: ResponseType.Code,
    // We generate the PKCE pair ourselves (see pkce.ts) so the verifier is
    // available for the token exchange below.
    usePKCE: false,
    codeChallenge,
    codeChallengeMethod: CodeChallengeMethod.S256,
    state,
    extraParams: { show_dialog: 'false' },
  });

  log.info('opening Spotify consent', { redirectUri });
  const result = await request.promptAsync(spotifyDiscovery);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new SpotifyAuthError('Spotify sign-in was cancelled.');
  }
  if (result.type !== 'success') {
    throw new SpotifyAuthError(`Spotify sign-in failed (${result.type}).`);
  }

  const returnedState = result.params.state;
  if (returnedState && returnedState !== state) {
    throw new SpotifyAuthError('OAuth state mismatch — the response was rejected.');
  }

  const code = result.params.code;
  if (!code) {
    throw new SpotifyAuthError('Spotify did not return an authorization code.');
  }

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: spotifyConfig.clientId,
      code,
      redirectUri,
      extraParams: { code_verifier: codeVerifier },
    },
    spotifyDiscovery,
  );

  const tokens = tokensFromResponse(tokenResponse);
  log.info('Spotify authorization complete');
  return tokens;
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
