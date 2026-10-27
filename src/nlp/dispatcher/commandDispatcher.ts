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

  // Anything the pipeline would not execute on its own is ignored: VoiceRiders
  // never asks "did you mean…?" any more, because a question mid-ride is more
  // disruptive than a missed command.
  if (interpretation.decision !== 'execute') {
    const attemptedCommand =
      intent !== 'UNKNOWN' && interpretation.confidence >= NOISE_FLOOR_CONFIDENCE;
    const spoken = attemptedCommand ? responses.lowConfidence : '';

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
        return {
          ok: true,
          intent,
          spoken:
            change.appliedDelta > 0
              ? responses.volume(change.volumePercent)
              : responses.volumeAtMax,
        };
      }

      case 'DECREASE_VOLUME': {
        const change = await controller.changeVolumeBy(-volumeStepPercent, 'voice');
        mark({ volumePercent: change.volumePercent });
        return {
          ok: true,
          intent,
          spoken:
            change.appliedDelta < 0
              ? responses.volume(change.volumePercent)
              : responses.volumeAtMin,
        };
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
        const title = interpretation.entities.songTitle;
        if (!title) {
          mark();
          return { ok: false, intent, spoken: responses.lowConfidence };
        }

        // The playlist-number command was removed; if the rider still says a
        // bare number, explain rather than searching Spotify for "7".
        if (/^\d+$/.test(title)) {
          mark();
          return { ok: false, intent, spoken: responses.numberNotSupported };
        }

        const played = await controller.playByQuery(title, interpretation.entities.artist);
        mark({ currentTrackName: played.name, isPlaying: true });
        return {
          ok: true,
          intent,
          spoken: responses.playingSong(played.name, played.artists),
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
