/** All rider-facing strings in one place (easy to localise or later TTS-tune). */

import type { Intent } from '../types';

export const responses = {
  paused: 'Paused.',
  stopped: 'Stopped.',
  resuming: 'Resuming.',
  playing: 'Playing.',
  next: 'Next song.',
  previous: 'Previous song.',

  volume: (percent: number) => `Volume ${Math.round(percent)} percent.`,
  playingSong: (name: string, artists: string) =>
    artists ? `Playing ${name} by ${artists}.` : `Playing ${name}.`,

  /**
   * Low confidence: never guess. Used when nothing plausible was recognised, or
   * when the command is too doubtful to even confirm.
   */
  lowConfidence: "Sorry, I didn't catch that.",

  /**
   * Middling confidence: ask a yes/no question instead of making the rider
   * repeat the whole command. One word resolves it.
   */
  confirmQuestion: (phrase: string) => `Did you mean ${phrase}? Say yes or no.`,
  askYesNo: 'Please say yes or no.',
  cancelled: 'Cancelled.',

  /** The old playlist-number command was removed in favour of song names. */
  numberNotSupported:
    'Song numbers are no longer used. Say the song name, for example "play believer".',

  outOfRange: (count: number) => `That playlist has only ${count} songs.`,
  noPlaylist: 'Select a playlist first.',
  noDevice: 'No active Spotify device. Open Spotify and press play once.',
  premiumRequired: 'Spotify Premium is required for playback control.',
  notConnected: 'Connect your Spotify account first.',
  network: 'No internet connection.',
} as const;

/** Natural phrase for a yes/no confirmation, e.g. "turn the volume up". */
export function intentPhrase(intent: Intent): string {
  switch (intent) {
    case 'INCREASE_VOLUME':
      return 'turn the volume up';
    case 'DECREASE_VOLUME':
      return 'turn the volume down';
    case 'PLAY':
      return 'start playing';
    case 'PAUSE':
      return 'pause the music';
    case 'RESUME':
      return 'resume the music';
    case 'NEXT_SONG':
      return 'skip to the next song';
    case 'PREVIOUS_SONG':
      return 'go back to the previous song';
    case 'STOP':
      return 'stop the music';
    case 'PLAY_SONG':
      return 'play that song';
    default:
      return 'do that';
  }
}
