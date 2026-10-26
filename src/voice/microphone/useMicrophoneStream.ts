/**
 * Microphone -> VAD -> frames.
 *
 * Two capture paths, chosen at runtime:
 *
 *  1. The local `voice-system` module (Android builds). It owns an `AudioRecord`,
 *     so the input device can be pinned with `setPreferredDevice` — that is what
 *     makes "always use my earphones mic" possible. It also keeps the rest of the
 *     pipeline identical because it emits the same float32 chunks.
 *  2. `expo-audio`'s `useAudioStream`, the fallback when the module is missing
 *     (Expo Go, iOS, older builds) or fails to open the microphone. It always
 *     uses the platform default input.
 *
 * Each buffer is downmixed to mono, measured, and pushed through the energy VAD.
 * Consumers receive either every frame (for noise estimation) or only the VAD
 * events (for utterance capture).
 *
 * No audio leaves the device here; ASR is a separate, explicit step.
 *
 * It also publishes live statistics (frames received, level, noise floor, VAD
 * state, active input). Those make microphone problems diagnosable on-device: a
 * counter that never moves means the app is not receiving audio at all, which is
 * a different fault from "audio arrives but nothing is recognised".
 */

import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { audioConfig } from '@/config';
import { createLogger } from '@/utils/logger';

import VoiceSystem, { type AudioBufferEvent } from '../../../modules/voice-system';
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
  /** Which microphone is capturing, when the platform reports it. */
  inputName?: string;
}

export interface UseMicrophoneStreamOptions {
  /**
   * Android input device id to capture from; `null`/`undefined` means automatic
   * (a connected headset wins over the built-in microphone).
   */
  preferredInputId?: number | null;
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
/** If the native recorder delivers nothing by then, fall back to expo-audio. */
const NATIVE_START_TIMEOUT_MS = 1500;

export function useMicrophoneStream(
  options: UseMicrophoneStreamOptions = {},
): UseMicrophoneStreamResult {
  const { onFrame, onEvents, vad: injectedVad, preferredInputId } = options;

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

  const nativeSubscriptionRef = useRef<{ remove(): void } | null>(null);
  const nativeActiveRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Shared tail of both capture paths: measure, publish, run the VAD. */
  const processPcm = useCallback(
    (pcm: Float32Array, sampleRate: number) => {
      if (pcm.length === 0) return;

      const durationMs = durationMsFor(pcm.length, sampleRate || audioConfig.sampleRate);
      const result = vad.process(pcm, durationMs);

      const frame: MicrophoneFrame = {
        pcm,
        durationMs,
        dbfs: result.dbfs,
        noiseFloorDb: result.noiseFloorDb,
        speechActive: result.speechActive,
      };

      statsRef.current = {
        ...statsRef.current,
        frames: statsRef.current.frames + 1,
        lastDbfs: result.dbfs,
        noiseFloorDb: result.noiseFloorDb,
        speechActive: result.speechActive,
        sampleRate: sampleRate || audioConfig.sampleRate,
      };

      onFrameRef.current?.(frame);
      if (result.events.length > 0) onEventsRef.current?.(result.events, frame);
    },
    [vad],
  );

  /** expo-audio path. */
  const handleStreamBuffer = useCallback(
    (buffer: AudioStreamBuffer) => {
      try {
        const pcm = decodeToMonoFloat32(buffer.data, buffer.channels, 'float32');
        processPcm(pcm, buffer.sampleRate || audioConfig.sampleRate);
      } catch (frameError) {
        log.warn('failed to process an audio buffer', frameError);
      }
    },
    [processPcm],
  );

  /** Native module path: already mono float32, little-endian. */
  const handleNativeBuffer = useCallback(
    (event: AudioBufferEvent) => {
      try {
        const raw = event.data instanceof Uint8Array ? event.data : new Uint8Array(event.data);
        if (raw.byteLength < 4) return;

        // Float32Array requires 4-byte alignment; the bridge may hand over a view
        // into a shared buffer at any offset.
        const bytes = raw.byteOffset % 4 === 0 ? raw : new Uint8Array(raw);
        const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);

        // Copy: the bridge buffer must not be retained by the VAD.
        processPcm(Float32Array.from(samples), event.sampleRate || audioConfig.sampleRate);
      } catch (frameError) {
        log.warn('failed to process a native audio buffer', frameError);
      }
    },
    [processPcm],
  );

  const streamResult = useAudioStream({
    sampleRate: audioConfig.sampleRate,
    channels: audioConfig.channels,
    encoding: 'float32',
    onBuffer: handleStreamBuffer,
  });
  const { stream } = streamResult;

  // Publish statistics on a timer so per-frame updates never trigger re-renders.
  useEffect(() => {
    if (!isActive) return undefined;
    const timer = setInterval(() => setStats({ ...statsRef.current }), STATS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive]);

  const startExpoAudioStream = useCallback(async () => {
    await stream.start();
    setIsActive(true);
  }, [stream]);

  /** Falls back to expo-audio when the pinned recorder delivers no audio. */
  const scheduleFallback = useCallback(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    fallbackTimerRef.current = setTimeout(() => {
      fallbackTimerRef.current = null;
      if (statsRef.current.frames > 0) return;

      log.warn('native capture produced no audio; falling back to expo-audio');
      try {
        VoiceSystem?.stopCapture();
      } catch {
        // already stopped
      }
      nativeSubscriptionRef.current?.remove();
      nativeSubscriptionRef.current = null;
      nativeActiveRef.current = false;

      void startExpoAudioStream().catch((streamError) => {
        log.warn('fallback microphone start failed', streamError);
      });
    }, NATIVE_START_TIMEOUT_MS);
  }, [startExpoAudioStream]);

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

      /*
       * CRITICAL: `mixWithOthers` (not `doNotMix`).
       *
       * `doNotMix` requests exclusive audio focus, which makes Android pause
       * every other app — including the Spotify app this app is controlling.
       * Playback then "starts" (the API returns 204) but the rider hears
       * nothing. Mixing lets Spotify keep playing while we listen.
       */
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'mixWithOthers',
        // Screen-off listening: keeps the audio session alive in the background.
        // The microphone itself is kept alive by the foreground service (see
        // src/voice/background/backgroundListening.ts).
        allowsBackgroundRecording: true,
      });

      vad.reset();
      statsRef.current = { frames: 0, speechActive: false };
      setStats({ frames: 0, speechActive: false });

      // Preferred path: our own recorder, with a pinned input device.
      if (VoiceSystem) {
        const subscription = VoiceSystem.addListener('audioBuffer', handleNativeBuffer);
        const started = await VoiceSystem.startCapture(
          audioConfig.sampleRate,
          preferredInputId ?? 0,
        );

        if (started) {
          nativeSubscriptionRef.current = subscription;
          nativeActiveRef.current = true;
          setIsActive(true);

          const inputName = await VoiceSystem.getActiveInputName().catch(() => null);
          if (inputName) statsRef.current.inputName = inputName;

          scheduleFallback();
          return true;
        }

        subscription.remove();
        log.warn('native capture refused to start; using expo-audio');
      }

      await startExpoAudioStream();
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
  }, [handleNativeBuffer, preferredInputId, scheduleFallback, startExpoAudioStream, vad]);

  const stop = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    if (nativeActiveRef.current) {
      try {
        VoiceSystem?.stopCapture();
      } catch (stopError) {
        log.debug('native microphone stop failed', stopError);
      }
      nativeActiveRef.current = false;
    }

    nativeSubscriptionRef.current?.remove();
    nativeSubscriptionRef.current = null;

    try {
      stream.stop();
    } catch (stopError) {
      log.debug('microphone stop failed', stopError);
    }
    setIsActive(false);
  }, [stream]);

  // Safety: never leave the microphone open when the screen unmounts.
  useEffect(() => () => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    if (nativeActiveRef.current) {
      try {
        VoiceSystem?.stopCapture();
      } catch {
        // already stopped
      }
    }
    nativeSubscriptionRef.current?.remove();
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
