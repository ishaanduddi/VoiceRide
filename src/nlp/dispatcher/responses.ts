/** All rider-facing strings in one place (easy to localise or later TTS-tune). */

export const responses = {
  paused: 'Paused.',
  stopped: 'Stopped.',
  resuming: 'Resuming.',
  playing: 'Playing.',
  next: 'Next song.',
  previous: 'Previous song.',

  volume: (percent: number) => `Volume ${Math.round(percent)} percent.`,
  volumeAtMax: 'Volume is already at maximum.',
  volumeAtMin: 'Volume is already at minimum.',
  volumeExternal:
    'The sound is going to your Bluetooth headset, which keeps its own volume — use the headset buttons.',
  playingSong: (name: string, artists: string) =>
    artists ? `Playing ${name} by ${artists}.` : `Playing ${name}.`,

  /** Nothing usable was recognised, or the command was too weak to act on. */
  lowConfidence: "Sorry, I didn't catch that.",

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
