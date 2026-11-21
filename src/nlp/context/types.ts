/** Shape of the application context maintained while the app runs. */

import type { Intent } from '../types';

/** Result of the most recent volume command, for the Ride Mode diagnostics card. */
export interface VolumeCommandRecord {
  at: number;
  /** Percentage points requested (+5, -5). */
  delta: number;
  /** Hardware steps before/after, when the phone could report them. */
  levelBefore?: number;
  levelAfter?: number;
  max?: number;
  /** Volume the app reports after the change, 0-100. */
  percent: number;
  bluetooth: boolean;
  /** The voice (SCO / communication) route was active during the step. */
  voiceRoute?: boolean;
  /** Raw AudioManager mode (0 = normal, 3 = communication). */
  audioMode?: number;
  outcome: 'applied' | 'maximum' | 'minimum' | 'headset';
}

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
  lastVolumeCommand?: VolumeCommandRecord;
}

export const INITIAL_CONTEXT: AppContext = {
  spotifyConnected: false,
  isPlaying: false,
  trackCount: 0,
  rideMode: false,
  adaptiveAudio: false,
};
