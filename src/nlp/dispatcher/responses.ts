/** All rider-facing strings in one place (easy to localise or later TTS-tune). */

export const responses = {
  paused: 'Paused.',
  stopped: 'Stopped.',
  resuming: 'Resuming.',
  playing: 'Playing.',
  next: 'Next song.',
  previous: 'Previous song.',

  volume: (percent: number) => `Volume ${Math.round(percent)} percent.`,
  playingNumber: (number: number, name: string) => `Playing number ${number}, ${name}.`,

  /** Low confidence: do not guess, ask again. */
  lowConfidence: "Sorry, I didn't catch that.",
  confirm: "Sorry, I didn't catch that. Please say it again.",

  outOfRange: (count: number) => `That playlist has only ${count} songs.`,
  noPlaylist: 'Select a playlist first.',
  noDevice: 'No active Spotify device. Open Spotify and press play once.',
  premiumRequired: 'Spotify Premium is required for playback control.',
  notConnected: 'Connect your Spotify account first.',
  network: 'No internet connection.',
} as const;
