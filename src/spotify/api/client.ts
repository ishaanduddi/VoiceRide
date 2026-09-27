/**
 * Authenticated JSON client for the Spotify Web API.
 *
 * Responsibilities:
 *  - inject the bearer token (never a client secret)
 *  - transparently refresh once on 401
 *  - translate Spotify/network failures into typed AppErrors
 */

import { spotifyConfig } from '@/config';
import {
  NetworkUnavailableError,
  NoActiveDeviceError,
  PremiumRequiredError,
  SpotifyApiError,
  SpotifyAuthError,
} from '@/utils/errors';
import { createLogger } from '@/utils/logger';

import { forceRefreshAccessToken, getAccessToken } from '../auth/authService';

const log = createLogger('spotify:api');

type QueryValue = string | number | boolean | undefined;

export interface SpotifyRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Internal guard so a 401 is only retried once. */
  retriedAuth?: boolean;
}

function appendQuery(url: string, query?: Record<string, QueryValue>): string {
  if (!query) return url;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  if (parts.length === 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${parts.join('&')}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorFromResponse(status: number, payload: unknown): Error {
  const body = payload as { error?: { status?: number; message?: string; reason?: string } } | undefined;
  const message = body?.error?.message ?? `Spotify request failed (HTTP ${status}).`;
  const reason = body?.error?.reason;

  if (status === 401) return new SpotifyAuthError(message);
  if (status === 403) {
    if (/premium/i.test(message)) return new PremiumRequiredError(message);
    if (/(restricted|not available)/i.test(message)) {
      return new SpotifyApiError(status, message, reason);
    }
    return new SpotifyApiError(status, message, reason);
  }
  if (status === 404) {
    return new NoActiveDeviceError(
      'No active Spotify device was found. Open the Spotify app on your phone, press play once, then try again.',
    );
  }
  if (status === 429) {
    return new SpotifyApiError(status, 'Spotify is rate limiting requests. Try again in a moment.', reason);
  }
  return new SpotifyApiError(status, message, reason);
}

async function execute<T>(
  path: string,
  accessToken: string,
  options: SpotifyRequestOptions,
): Promise<T> {
  const url = appendQuery(
    path.startsWith('http') ? path : `${spotifyConfig.apiBase}${path}`,
    options.query,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    log.warn('network failure', error);
    throw new NetworkUnavailableError('Could not reach Spotify. Check your connection.');
  }

  if (response.status === 401 && !options.retriedAuth) {
    log.debug('401 received, refreshing token and retrying');
    const refreshed = await forceRefreshAccessToken();
    return execute<T>(path, refreshed, { ...options, retriedAuth: true });
  }

  // 204 No Content is a normal success for playback mutation endpoints.
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? safeJson(text) : undefined;

  if (!response.ok) throw errorFromResponse(response.status, payload);

  return payload as T;
}

/** Performs an authenticated request against the Spotify Web API. */
export async function spotifyRequest<T>(
  path: string,
  options: SpotifyRequestOptions = {},
): Promise<T> {
  const accessToken = await getAccessToken();
  return execute<T>(path, accessToken, options);
}
