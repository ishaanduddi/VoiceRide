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

import { intentPhrase, responses } from './responses';

const log = createLogger('nlp:dispatcher');

export interface DispatchDeps {
  controller: SpotifyPlaybackController;
  context: AppContextManager;
  /** Percentage points applied by a voice volume command. */
  volumeStepPercent: number;
}

export interface DispatchOptions {
  /** Set when the rider answered "yes" to a confirmation question. */
  confirmed?: boolean;
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
  options: DispatchOptions = {},
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

  // Not confident enough to act on its own.
  if (interpretation.decision !== 'execute' && !options.confirmed) {
    /*
     * A plausible command with middling confidence gets a yes/no question
     * instead of "please repeat": one word finishes it, which is much easier
     * while riding than re-saying the whole sentence.
     */
    const canConfirm =
      interpretation.decision === 'confirm' &&
      intent !== 'UNKNOWN' &&
      !(intent === 'PLAY_SONG' && !interpretation.entities.songTitle);

    if (canConfirm) {
      const spoken = responses.confirmQuestion(intentPhrase(intent));
      mark();
      log.info(`confirm requested for ${intent} (${interpretation.confidence.toFixed(2)})`);
      return { ok: false, intent, spoken };
    }

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
