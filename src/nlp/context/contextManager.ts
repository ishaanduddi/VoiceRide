/**
 * Context manager (step 8 of the pipeline).
 *
 * Two jobs:
 *   1. Hold the live application context (what is selected / playing / loud).
 *   2. Score how well a tentative command fits that context, and resolve
 *      commands whose meaning depends on it.
 */

import type { Entities, Intent } from '../types';

import { INITIAL_CONTEXT, type AppContext } from './types';

type ContextListener = (context: AppContext) => void;

/** Minimal observable store — no external dependency, React-friendly. */
export class AppContextManager {
  private state: AppContext;
  private readonly listeners = new Set<ContextListener>();

  constructor(initial: Partial<AppContext> = {}) {
    this.state = { ...INITIAL_CONTEXT, ...initial };
  }

  /*
   * These MUST be arrow-function class properties, not prototype methods.
   *
   * `useSyncExternalStore` calls `getSnapshot`/`subscribe` as bare functions, so
   * a prototype method would receive `this === undefined` and throw
   * "Cannot read property 'state' of undefined" during render — which is exactly
   * what crashed every screen that uses `useAppContext()`.
   */

  getState = (): AppContext => this.state;

  setState = (patch: Partial<AppContext>): void => {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  };

  subscribe = (listener: ContextListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  reset(): void {
    this.setState({ ...INITIAL_CONTEXT });
  }
}

export interface ContextEvaluation {
  /** 0 = impossible in this context, 1 = perfectly consistent. */
  score: number;
  reasons: string[];
  /** Whether this intent needs a `songNumber` entity. */
  requiresSongNumber: boolean;
}

const DEFAULT_CONTEXT_SCORE = 1;

/**
 * Contextual plausibility of an intent.
 *
 * Note this only *nudges* confidence (10% weight); it never overrides the
 * classifier. It exists so that, for example, "play song 40" in a 20-track
 * playlist is still executed (and answered with the real track count) instead
 * of being rejected as an unknown command.
 */
export function evaluateContext(
  intent: Intent,
  entities: Entities,
  context: AppContext,
): ContextEvaluation {
  const reasons: string[] = [];
  let score = DEFAULT_CONTEXT_SCORE;
  const requiresSongNumber = intent === 'PLAY_SONG';

  if (intent === 'UNKNOWN') {
    return { score: 0, reasons: ['no intent to evaluate'], requiresSongNumber: false };
  }

  if (!context.spotifyConnected) {
    return { score: 0, reasons: ['Spotify is not connected'], requiresSongNumber };
  }

  if (requiresSongNumber) {
    if (!context.playlistId || context.trackCount === 0) {
      return { score: 0, reasons: ['no playlist selected'], requiresSongNumber };
    }
    if (entities.songNumber === undefined) {
      score = Math.min(score, 0.5);
      reasons.push('no song number heard');
    } else if (entities.songNumber > context.trackCount) {
      score = Math.min(score, 0.6);
      reasons.push(`song ${entities.songNumber} is beyond the ${context.trackCount}-track playlist`);
    }
  }

  if (intent === 'PAUSE' && !context.isPlaying) {
    score = Math.min(score, 0.7);
    reasons.push('playback is already paused');
  }

  if (intent === 'RESUME' && context.isPlaying) {
    score = Math.min(score, 0.75);
    reasons.push('playback is already running');
  }

  if (
    (intent === 'INCREASE_VOLUME' || intent === 'DECREASE_VOLUME') &&
    context.volumePercent === undefined
  ) {
    score = Math.min(score, 0.85);
    reasons.push('current volume unknown; using a safe default');
  }

  if (
    (intent === 'NEXT_SONG' || intent === 'PREVIOUS_SONG') &&
    (!context.playlistId || context.trackCount === 0)
  ) {
    score = Math.min(score, 0.6);
    reasons.push('no playlist context for track navigation');
  }

  if (context.rideMode) reasons.push('ride mode is active');
  if (reasons.length === 0) reasons.push('context is consistent');

  return { score, reasons, requiresSongNumber };
}

/**
 * Resolves intents that are ambiguous without context.
 *
 * "play" while a track is paused means RESUME; the same word with an empty
 * queue really means PLAY.
 */
export function resolveIntentWithContext(
  intent: Intent,
  _entities: Entities,
  context: AppContext,
): { intent: Intent; reasons: string[] } {
  if (
    intent === 'PLAY' &&
    !context.isPlaying &&
    context.currentTrackIndex !== undefined &&
    context.playlistId !== undefined
  ) {
    return {
      intent: 'RESUME',
      reasons: ['interpreted "play" as RESUME because playback is paused'],
    };
  }
  return { intent, reasons: [] };
}
