/**
 * A tiny handle to the live microphone, for code that is not a React component.
 *
 * Why this exists: an open recording stream can keep a headset in its voice
 * (SCO) route, and some phones ignore changes to the music stream while that is
 * true. The volume step therefore releases the microphone for the ~100 ms the
 * change takes, which makes a spoken command use exactly the same audio state as
 * the Ride Mode test buttons.
 *
 * `useRideMode` registers the real implementation while Ride Mode is mounted;
 * before that (or after it stops) all calls are no-ops.
 */

export interface MicrophoneControl {
  /** True when the microphone is actually capturing. */
  isActive?: () => boolean;
  /** Stops capture. */
  pause?: () => void;
  /** Restarts capture; resolves false when it could not. */
  resume?: () => Promise<boolean>;
}

export const microphoneControl: MicrophoneControl = {};