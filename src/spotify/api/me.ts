import type { SpotifyPaging, SpotifyUserProfile } from '../types';
import { spotifyRequest } from './client';

/** `GET /me` — used to show who is connected and whether they have Premium. */
export async function getCurrentUserProfile(): Promise<SpotifyUserProfile> {
  return spotifyRequest<SpotifyUserProfile>('/me');
}
