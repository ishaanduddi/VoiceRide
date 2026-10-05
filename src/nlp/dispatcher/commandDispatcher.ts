/**
 * Command dispatcher (step 11 of the pipeline).
 *
 * Executes an interpretation against Spotify and returns the sentence the app
 * should speak back. It is the ONLY place that turns an intent into an action.
 */

import type { SpotifyPlaybackController } from '@/spotify/playback/playbackController';
import { toUserMessage } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

import type { AppContextManager } from '../context/contextManager';
import type { AppContext } from '../context/types';
import type { Intent, Interpretation } from '../types';

import { responses } from './responses';

const log = createLogger('nlp:dispatcher');

export interface DispatchDeps {
  controller: SpotifyPlaybackController;
  context: AppContextManager;
  /** Percentage points applied by a voice volume command. */
  volumeStepPercent: number;
}

export interface DispatchOutcome {
  ok: boolean;
  intent: Intent;
  /** Sentence to speak/display. Empty string means "stay silent". */
  spoken: string;
  error?: string;
}

/**
 * Below this confidence a rejection is assumed to be noise rather than a failed
 * command, and nothing is spoken.
 */
const NOISE_FLOOR_CONFIDENCE = 0.35;

export async function dispatchInterpretation(
  interpretation: Interpretation,
  deps: DispatchDeps,
): Promise<DispatchOutcome> {
  const { controller, context, volumeStepPercent } = deps;
  const intent = interpretation.prediction.intent;

  const mark = (extra: Partial<AppContext> = {}): void => {
    context.setState({
      ...extra,
      lastTranscript: interpretation.transcript,
      lastIntent: intent,
      lastCommandAt: Date.now(),
    });
  };

  // Low confidence: never execute blindly.
  if (interpretation.decision !== 'execute') {
    /*
     * Noise, music and coughs land here constantly while riding. Announcing
     * "sorry, I didn't catch that" for every one of them is worse than staying
     * quiet, so only speak when there is evidence a real command was attempted:
     * something other than UNKNOWN was recognised, with a non-trivial score.
     */
    const attemptedCommand =
      intent !== 'UNKNOWN' && interpretation.confidence >= NOISE_FLOOR_CONFIDENCE;

    const spoken = !attemptedCommand
      ? ''
      : interpretation.decision === 'confirm'
        ? responses.confirm
        : responses.lowConfidence;

    mark();
    log.info(
      `rejected ${intent} (${interpretation.confidence.toFixed(2)})` +
        (spoken ? '' : ' - silent (treated as noise)'),
    );
    return { ok: false, intent, spoken };
  }

  try {
    switch (intent) {
      case 'INCREASE_VOLUME': {
        const change = await controller.changeVolumeBy(volumeStepPercent, 'voice');
        mark({ volumePercent: change.volumePercent });
        return { ok: true, intent, spoken: responses.volume(change.volumePercent) };
      }

      case 'DECREASE_VOLUME': {
        const change = await controller.changeVolumeBy(-volumeStepPercent, 'voice');
        mark({ volumePercent: change.volumePercent });
        return { ok: true, intent, spoken: responses.volume(change.volumePercent) };
      }

      case 'PAUSE': {
        await controller.pause();
        mark({ isPlaying: false });
        return { ok: true, intent, spoken: responses.paused };
      }

      case 'STOP': {
        await controller.stop();
        mark({ isPlaying: false });
        return { ok: true, intent, spoken: responses.stopped };
      }

      case 'RESUME': {
        await controller.play();
        mark({ isPlaying: true });
        return { ok: true, intent, spoken: responses.resuming };
      }

      case 'PLAY': {
        await controller.play();
        mark({ isPlaying: true });
        return { ok: true, intent, spoken: responses.playing };
      }

      case 'NEXT_SONG': {
        await controller.next();
        mark();
        return { ok: true, intent, spoken: responses.next };
      }

      case 'PREVIOUS_SONG': {
        await controller.previous();
        mark();
        return { ok: true, intent, spoken: responses.previous };
      }

      case 'PLAY_SONG': {
        const songNumber = interpretation.entities.songNumber;
        if (songNumber === undefined) {
          mark();
          return { ok: false, intent, spoken: responses.lowConfidence };
        }
        const entry = await controller.playSongNumber(songNumber);
        mark({
          currentTrackIndex: entry.displayIndex,
          currentTrackName: entry.name,
          isPlaying: true,
        });
        return {
          ok: true,
          intent,
          spoken: responses.playingNumber(entry.displayIndex, entry.name),
        };
      }

      case 'UNKNOWN':
      default: {
        mark();
        return { ok: false, intent: 'UNKNOWN', spoken: responses.lowConfidence };
      }
    }
  } catch (error) {
    const message = toUserMessage(error);
    mark();
    log.warn(`dispatch failed for ${intent}`, error);
    return { ok: false, intent, spoken: message, error: message };
  }
}
