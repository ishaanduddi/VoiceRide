/**
 * Error taxonomy for VoiceRiders.
 *
 * Every layer raises a typed AppError so the UI can render a short,
 * human-friendly message (see `toUserMessage`) instead of a stack trace.
 */

export type AppErrorCode =
  | 'SPOTIFY_NOT_CONNECTED'
  | 'SPOTIFY_AUTH_FAILED'
  | 'SPOTIFY_TOKEN_EXPIRED'
  | 'SPOTIFY_API_ERROR'
  | 'SPOTIFY_NO_DEVICE'
  | 'SPOTIFY_PLAYBACK_UNAVAILABLE'
  | 'SPOTIFY_PREMIUM_REQUIRED'
  | 'MIC_PERMISSION_DENIED'
  | 'ASR_NOT_CONFIGURED'
  | 'ASR_FAILED'
  | 'NO_SPEECH_DETECTED'
  | 'LOW_CONFIDENCE'
  | 'UNKNOWN_COMMAND'
  | 'INVALID_SONG_NUMBER'
  | 'SONG_OUT_OF_RANGE'
  | 'NO_PLAYLIST_SELECTED'
  | 'EMPTY_PLAYLIST'
  | 'NETWORK_UNAVAILABLE'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: AppErrorCode;
  override readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

export class SpotifyAuthError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('SPOTIFY_AUTH_FAILED', message, cause);
    this.name = 'SpotifyAuthError';
  }
}

export class SpotifyApiError extends AppError {
  readonly status: number;
  readonly reason?: string;

  constructor(status: number, message: string, reason?: string) {
    super('SPOTIFY_API_ERROR', message);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.reason = reason;
  }
}

export class SpotifyNotConnectedError extends AppError {
  constructor(message = 'Spotify is not connected yet.') {
    super('SPOTIFY_NOT_CONNECTED', message);
    this.name = 'SpotifyNotConnectedError';
  }
}

export class NoActiveDeviceError extends AppError {
  constructor(message = 'No active Spotify device. Open Spotify on your phone first.') {
    super('SPOTIFY_NO_DEVICE', message);
    this.name = 'NoActiveDeviceError';
  }
}

export class PremiumRequiredError extends AppError {
  constructor(message = 'Spotify Premium is required for playback control.') {
    super('SPOTIFY_PREMIUM_REQUIRED', message);
    this.name = 'PremiumRequiredError';
  }
}

export class MicrophonePermissionError extends AppError {
  constructor(message = 'Microphone permission is required for Ride Mode.') {
    super('MIC_PERMISSION_DENIED', message);
    this.name = 'MicrophonePermissionError';
  }
}

export class AsrNotConfiguredError extends AppError {
  constructor(
    message = 'Speech recognition is not configured. Set EXPO_PUBLIC_ASR_ENDPOINT or use the manual command box.',
  ) {
    super('ASR_NOT_CONFIGURED', message);
    this.name = 'AsrNotConfiguredError';
  }
}

export class NetworkUnavailableError extends AppError {
  constructor(message = 'No internet connection.') {
    super('NETWORK_UNAVAILABLE', message);
    this.name = 'NetworkUnavailableError';
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Maps any thrown value to a short message that is safe to show on screen. */
export function toUserMessage(value: unknown): string {
  if (isAppError(value)) return value.message;
  if (value instanceof Error) return value.message;
  return 'Something went wrong. Please try again.';
}
