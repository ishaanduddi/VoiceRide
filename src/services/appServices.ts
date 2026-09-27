/**
 * Composition root.
 *
 * Wires the concrete services together exactly once, so that screens and hooks
 * never construct their own copies. This is the only module that knows about
 * every layer.
 */

import { AdaptiveAudioController } from '@/adaptiveAudio/adaptiveAudioController';
import { dispatchInterpretation } from '@/nlp/dispatcher/commandDispatcher';
import { createPlaybackController } from '@/spotify/playback/playbackController';
import { createAsrProvider } from '@/voice/asr';
import { VoiceController } from '@/voice/voiceController';

import { contextManager } from '@/state/contextStore';
import { libraryStore } from '@/state/libraryStore';
import { settingsStore } from '@/state/settingsStore';

/**
 * Playback controller.
 *
 * `onVolumeChanged` is how the "adaptive must not undo a voice command" rule is
 * enforced: any voice/programmatic volume change becomes the new baseline.
 */
export const playbackController = createPlaybackController({
  getTarget: () => libraryStore.getState().trackMap,
  onVolumeChanged: (volumePercent, source) => {
    contextManager.setState({ volumePercent });
    if (source === 'voice' || source === 'programmatic') {
      adaptiveAudio.notifyManualVolumeChange(volumePercent);
    }
  },
});

/** Adaptive Audio Mode engine (no-op until enabled). */
export const adaptiveAudio = new AdaptiveAudioController(
  {
    getVolumePercent: () => contextManager.getState().volumePercent,
    setVolume: async (percent) => {
      const change = await playbackController.setVolumeAbsolute(percent, 'adaptive');
      return { volumePercent: change.volumePercent };
    },
  },
  settingsStore.getState().adaptiveAudioProfile,
);

/** Voice front-end: ASR -> NLP -> dispatcher. */
export const voiceController = new VoiceController({
  asr: createAsrProvider(),
  getContext: () => contextManager.getState(),
  confidenceThreshold: settingsStore.getState().confidenceThreshold,
  dispatch: (interpretation) =>
    dispatchInterpretation(interpretation, {
      controller: playbackController,
      context: contextManager,
      volumeStepPercent: settingsStore.getState().volumeStepPercent,
    }),
});

/** Rebuilds the ASR provider (e.g. after a model download or settings change). */
export async function reloadAsrProvider(): Promise<void> {
  await voiceController.replaceAsrProvider(createAsrProvider());
}

/** Applies profile changes made in Settings to the live adaptive engine. */
export function applyAdaptiveAudioProfile(): void {
  adaptiveAudio.setProfile(settingsStore.getState().adaptiveAudioProfile);
}
