/**
 * Microphone -> VAD -> frames.
 *
 * Uses expo-audio's `useAudioStream`, which delivers real-time PCM from the
 * microphone (SDK 57). Each buffer is downmixed to mono, measured, and pushed
 * through the energy VAD. Consumers receive either every frame (for noise
 * estimation) or only the VAD events (for utterance capture).
 *
 * No audio leaves the device here; ASR is a separate, explicit step.
 */

import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { audioConfig } from '@/config';
import { createLogger } from '@/utils/logger';

import { decodeToMonoFloat32, durationMsFor } from '../audioProcessing/pcm';
import { EnergyVad, type VadEvent } from '../vad/energyVad';

const log = createLogger('voice:mic');

export interface MicrophoneFrame {
  pcm: Float32Array;
  durationMs: number;
  /** Frame level in dBFS. */
  dbfs: number;
  /** Live estimate of the ambient noise floor, in dBFS. */
  noiseFloorDb: number;
  /** An utterance is currently open. */
  speechActive: boolean;
}

export interface UseMicrophoneStreamOptions {
  /** Called for every captured frame (used by Adaptive Audio Mode). */
  onFrame?: (frame: MicrophoneFrame) => void;
  /** Called when the VAD opens or closes an utterance. */
  onEvents?: (events: VadEvent[], frame: MicrophoneFrame) => void;
  /** Inject a pre-configured VAD (e.g. with test thresholds). */
  vad?: EnergyVad;
}

export interface UseMicrophoneStreamResult {
  isActive: boolean;
  error?: string;
  permissionDenied: boolean;
  start: () => Promise<boolean>;
  stop: () => void;
}

export function useMicrophoneStream(
  options: UseMicrophoneStreamOptions = {},
): UseMicrophoneStreamResult {
  const { onFrame, onEvents, vad: injectedVad } = options;

  const vad = useMemo(() => injectedVad ?? new EnergyVad(), [injectedVad]);

  const onFrameRef = useRef(onFrame);
  const onEventsRef = useRef(onEvents);
  onFrameRef.current = onFrame;
  onEventsRef.current = onEvents;

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const handleBuffer = useCallback(
    (buffer: AudioStreamBuffer) => {
      try {
        const pcm = decodeToMonoFloat32(buffer.data, buffer.channels, 'float32');
        if (pcm.length === 0) return;

        const durationMs = durationMsFor(pcm.length, buffer.sampleRate || audioConfig.sampleRate);
        const result = vad.process(pcm, durationMs);

        const frame: MicrophoneFrame = {
          pcm,
          durationMs,
          dbfs: result.dbfs,
          noiseFloorDb: result.noiseFloorDb,
          speechActive: result.speechActive,
        };

        onFrameRef.current?.(frame);
        if (result.events.length > 0) onEventsRef.current?.(result.events, frame);
      } catch (frameError) {
        log.warn('failed to process an audio buffer', frameError);
      }
    },
    [vad],
  );

  const streamResult = useAudioStream({
    sampleRate: audioConfig.sampleRate,
    channels: audioConfig.channels,
    encoding: 'float32',
    onBuffer: handleBuffer,
  });
  const { stream } = streamResult;

  const start = useCallback(async (): Promise<boolean> => {
    setError(undefined);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        setError('Microphone permission was denied.');
        return false;
      }
      setPermissionDenied(false);

      // Allows recording while the music keeps playing through the speaker.
      // NOTE: `allowsBackgroundRecording` is intentionally NOT enabled here;
      // it needs the android foreground service and belongs to the
      // development-build stage (see docs/ROADMAP.md, Stage 2).
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'doNotMix',
      });

      vad.reset();
      await stream.start();
      setIsActive(true);
      return true;
    } catch (startError) {
      log.warn('failed to start the microphone', startError);
      setError('Could not start the microphone.');
      return false;
    }
  }, [stream, vad]);

  const stop = useCallback(() => {
    try {
      stream.stop();
    } catch (stopError) {
      log.debug('microphone stop failed', stopError);
    }
    setIsActive(false);
  }, [stream]);

  // Safety: never leave the microphone open when the screen unmounts.
  useEffect(() => () => {
    try {
      stream.stop();
    } catch {
      // already stopped
    }
  }, [stream]);

  return {
    isActive: streamResult.isStreaming || isActive,
    error,
    permissionDenied,
    start,
    stop,
  };
}
