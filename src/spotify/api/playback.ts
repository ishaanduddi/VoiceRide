import type { SpotifyDevice, SpotifyPlaybackState } from '../types';
import { spotifyRequest } from './client';

/** Payload accepted by `PUT /me/player/play`. */
export interface PlayRequest {
  /** Play a whole playlist/album context… */
  contextUri?: string;
  /** …or an explicit list of track URIs. */
  uris?: string[];
  /** 0-based position inside the context (playlist) to start from. */
  offsetPosition?: number;
  positionMs?: number;
}

export async function getPlaybackState(): Promise<SpotifyPlaybackState | null> {
  const state = await spotifyRequest<SpotifyPlaybackState | undefined>('/me/player');
  return state ?? null;
}

export async function getAvailableDevices(): Promise<SpotifyDevice[]> {
  const response = await spotifyRequest<{ devices: SpotifyDevice[] }>('/me/player/devices');
  return response.devices ?? [];
}

export async function play(request: PlayRequest = {}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (request.contextUri) body.context_uri = request.contextUri;
  if (request.uris) body.uris = request.uris;
  if (request.offsetPosition !== undefined) body.offset = { position: request.offsetPosition };
  if (request.positionMs !== undefined) body.position_ms = request.positionMs;

  await spotifyRequest<void>('/me/player/play', {
    method: 'PUT',
    body: Object.keys(body).length > 0 ? body : undefined,
  });
}

export async function pause(): Promise<void> {
  await spotifyRequest<void>('/me/player/pause', { method: 'PUT' });
}

export async function next(): Promise<void> {
  await spotifyRequest<void>('/me/player/next', { method: 'POST' });
}

export async function previous(): Promise<void> {
  await spotifyRequest<void>('/me/player/previous', { method: 'POST' });
}

export async function setVolume(volumePercent: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(volumePercent)));
  await spotifyRequest<void>('/me/player/volume', {
    method: 'PUT',
    query: { volume_percent: clamped },
  });
}

export async function setShuffle(state: boolean): Promise<void> {
  await spotifyRequest<void>('/me/player/shuffle', { method: 'PUT', query: { state } });
}

export async function seek(positionMs: number): Promise<void> {
  await spotifyRequest<void>('/me/player/seek', {
    method: 'PUT',
    query: { position_ms: Math.max(0, Math.round(positionMs)) },
  });
}

/** Moves playback to another device (used to wake an idle phone). */
export async function transferPlayback(deviceId: string, startPlaying = true): Promise<void> {
  await spotifyRequest<void>('/me/player', {
    method: 'PUT',
    body: { device_ids: [deviceId], play: startPlaying },
  });
}
