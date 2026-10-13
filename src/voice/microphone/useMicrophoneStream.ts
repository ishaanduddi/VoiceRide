/**
 * Microphone -> VAD -> frames.
 *
 * Uses expo-audio's `useAudioStream`, which delivers real-time PCM from the
 * microphone (SDK 57). Each buffer is downmixed to mono, measured, and pushed
 * through the energy VAD. Consumers receive either every frame (for noise
 * estimation) or only the VAD events (for utterance capture).
 *
 * No audio leaves the device here; ASR is a separate, explicit step.
 *
 * It also publishes live statistics (frames received, level, noise floor, VAD
 * state). Those make microphone problems diagnosable on-device: a counter that
 * never moves means the app is not receiving audio at all, which is a different
 * fault from "audio arrives but nothing is recognised".
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

export interface MicrophoneStats {
  /** Buffers received since recording started. Should climb continuously. */
  frames: number;
  /** Level of the most recent frame, dBFS. */
  lastDbfs?: number;
  noiseFloorDb?: number;
  /** The VAD currently considers speech to be happening. */
  speechActive: boolean;
  /** Sample rate the device actually delivered. */
  sampleRate?: number;
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
  /** Live capture statistics for on-device diagnosis. */
  stats: MicrophoneStats;
  start: () => Promise<boolean>;
  stop: () => void;
}

/** How often the UI-facing statistics are refreshed (ms). */
const STATS_INTERVAL_MS = 250;

export function useMicrophoneStream(
  options: UseMicrophoneStreamOptions = {},
): UseMicrophoneStreamResult {
  const { onFrame, onEvents, vad: injectedVad } = options;

  const vad = useMemo(() => injectedVad ?? new EnergyVad(), [injectedVad]);

  const onFrameRef = useRef(onFrame);
  const onEventsRef = useRef(onEvents);

  // Keep the newest callbacks available to the audio stream without having to
  // tear down and recreate the native stream on every render.
  useEffect(() => {
    onFrameRef.current = onFrame;
    onEventsRef.current = onEvents;
  }, [onFrame, onEvents]);

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const statsRef = useRef<MicrophoneStats>({ frames: 0, speechActive: false });
  const [stats, setStats] = useState<MicrophoneStats>({ frames: 0, speechActive: false });

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

        statsRef.current = {
          frames: statsRef.current.frames + 1,
          lastDbfs: result.dbfs,
          noiseFloorDb: result.noiseFloorDb,
          speechActive: result.speechActive,
          sampleRate: buffer.sampleRate || audioConfig.sampleRate,
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

  // Publish statistics on a timer so per-frame updates never trigger re-renders.
  useEffect(() => {
    if (!isActive) return undefined;
    const timer = setInterval(() => setStats({ ...statsRef.current }), STATS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive]);

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
      statsRef.current = { frames: 0, speechActive: false };
      setStats({ frames: 0, speechActive: false });

      await stream.start();
      setIsActive(true);
      return true;
    } catch (startError) {
      log.warn('failed to start the microphone', startError);
      setError(
        `Could not start the microphone: ${
          startError instanceof Error ? startError.message : String(startError)
        }`,
      );
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
    stats,
    start,
    stop,
  };
}
