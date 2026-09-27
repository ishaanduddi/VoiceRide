/** Shape of the application context maintained while the app runs. */

import type { Intent } from '../types';

export interface AppContext {
  spotifyConnected: boolean;
  /** Track index currently playing, 1-based, inside the selected playlist. */
  currentTrackIndex?: number;
  currentTrackName?: string;
  isPlaying: boolean;
  volumePercent?: number;
  playlistId?: string;
  playlistName?: string;
  playlistUri?: string;
  trackCount: number;
  rideMode: boolean;
  adaptiveAudio: boolean;
  /** Last recognized transcript, useful for debugging and "did you mean". */
  lastTranscript?: string;
  lastIntent?: Intent;
  lastCommandAt?: number;
}

export const INITIAL_CONTEXT: AppContext = {
  spotifyConnected: false,
  isPlaying: false,
  trackCount: 0,
  rideMode: false,
  adaptiveAudio: false,
};
