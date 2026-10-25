/**
 * Ride Mode orchestration.
 *
 *   mic frames -> VAD -> utterance -> VoiceController (ASR -> NLP -> dispatch)
 *
 * Also owns Adaptive Audio Mode while Ride Mode is running, because both share
 * the same microphone stream.
 *
 * SAFETY: everything here is voice-driven. The only UI affordance is a manual
 * text box, which exists for development/testing (e.g. Expo Go without an ASR
 * endpoint) and must not be used while actually riding.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { NoiseZone } from '@/adaptiveAudio/config';
import { hapticDouble, hapticTap, speak, stopSpeaking } from '@/effects/feedback';
import { dispatchInterpretation } from '@/nlp/dispatcher/commandDispatcher';
import { interpretCommand } from '@/nlp/pipeline';
import { adaptiveAudio, playbackController, voiceController } from '@/services/appServices';
import { contextManager } from '@/state/contextStore';
import { sessionStore } from '@/state/sessionStore';
import { settingsStore } from '@/state/settingsStore';
import { getDeviceVolumePercent, isDeviceVolumeAvailable } from '@/audio/deviceVolume';
import { startBackgroundListening, stopBackgroundListening } from '@/voice/background/backgroundListening';
import { toUserMessage } from '@/utils/errors';
import { createLogger } from '@/utils/logger';
import { audioConfig } from '@/config';
import { concatFloat32 } from '@/voice/audioProcessing/pcm';
import { useMicrophoneStream, type MicrophoneFrame, type UseMicrophoneStreamResult } from '@/voice/microphone/useMicrophoneStream';
import type { VadEvent } from '@/voice/vad/energyVad';

const log = createLogger('ride');

export type RideStatus = 'idle' | 'starting' | 'listening' | 'processing' | 'stopped' | 'error';

export interface RideState {
  status: RideStatus;
  error?: string;
  lastTranscript?: string;
  lastResponse?: string;
  lastIntent?: string;
  confidence?: number;
  decision?: string;
  noiseZone: NoiseZone;
  ambientDbfs?: number;
  adaptiveAudioEnabled: boolean;
  /** The microphone foreground service is running (screen-off listening). */
  background?: boolean;
}

/** Audio kept before speech onset so the first phoneme is never clipped. */
const PREROLL_MS = 300;
/** Ignore utterances shorter than this (a cough, a car horn). */
const MIN_UTTERANCE_MS = 200;
/** Ignore audio captured while our own confirmation speech is still playing. */
const REFRACTORY_MS = 800;
/** Never repeat the same spoken prompt within this window. */
const REPEAT_COOLDOWN_MS = 4000;
/**
 * Speech modulates strongly from frame to frame; steady loud audio (music played
 * through the phone speaker) does not. Utterances longer than the threshold
 * below whose level barely moves are treated as noise and never reach ASR.
 */
const MIN_MODULATION_DB = 4;
const MODULATION_GATE_MS = 800;
/**
 * A rider's own voice is clearly louder than the ambient floor; conversation from
 * further away is only just above it. Speech that barely clears the floor is
 * ignored rather than merged into the command.
 */
const MIN_PEAK_SNR_DB = 8;

interface FrameBuffer {
  frames: { pcm: Float32Array; durationMs: number }[];
  ms: number;
  minDbfs: number;
  maxDbfs: number;
  /** Loudest frame in the utterance (to judge how close the speaker was). */
  peakDbfs: number;
  /** Noise floor when the utterance opened. */
  startNoiseFloorDb: number;
}

const emptyBuffer = (): FrameBuffer => ({
  frames: [],
  ms: 0,
  minDbfs: Number.POSITIVE_INFINITY,
  maxDbfs: Number.NEGATIVE_INFINITY,
  peakDbfs: Number.NEGATIVE_INFINITY,
  startNoiseFloorDb: -50,
});

export interface ActiveDeviceInfo {
  name: string;
  volumePercent?: number;
  /** Spotify lets a client change this device's volume. */
  supportsVolume?: boolean;
}

export interface UseRideModeResult {
  state: RideState;
  /** The Spotify device playback is on — shown so volume problems are obvious. */
  activeDevice?: ActiveDeviceInfo;
  /** Live microphone diagnostics, so capture failures are visible on the phone. */
  microphone: UseMicrophoneStreamResult;
  start: () => Promise<void>;
  stop: () => void;
  /** Dev/testing path that bypasses the microphone and ASR. */
  submitManualCommand: (text: string) => Promise<void>;
}

export function useRideMode(): UseRideModeResult {
  const [state, setState] = useState<RideState>({
    status: 'idle',
    noiseZone: 'QUIET',
    adaptiveAudioEnabled: false,
  });

  const rollingRef = useRef<FrameBuffer>(emptyBuffer());
  const utteranceRef = useRef<FrameBuffer>(emptyBuffer());
  const processingRef = useRef(false);
  const refractoryUntilRef = useRef(0);
  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);

  const [activeDevice, setActiveDevice] = useState<ActiveDeviceInfo | undefined>(undefined);

  /** Reads which device playback is on, so the UI can explain volume problems. */
  const refreshDevice = useCallback(async () => {
    try {
      const playback = await playbackController.getState();
      // Prefer the phone's real volume: that is what voice commands change now.
      const deviceVolume = await getDeviceVolumePercent();
      setActiveDevice(
        playback?.device
          ? {
              name: playback.device.name,
              volumePercent: deviceVolume ?? playback.device.volume_percent ?? undefined,
              supportsVolume: isDeviceVolumeAvailable || playback.device.supports_volume,
            }
          : undefined,
      );
    } catch (error) {
      log.debug('could not read the active device', error);
    }
  }, []);

  /**
   * Speaks a line, suppressing immediate repeats.
   *
   * While riding, the same "didn't catch that" line otherwise fires every few
   * seconds at road noise. Speaking also starts a short refractory window during
   * which new audio is ignored, so our own voice is not transcribed.
   */
  const say = useCallback((text: string | undefined) => {
    if (!text || text.trim().length === 0) return;

    const now = Date.now();
    const last = lastSpokenRef.current;
    if (last && last.text === text && now - last.at < REPEAT_COOLDOWN_MS) {
      log.debug(`suppressed repeated prompt: "${text}"`);
      return;
    }

    lastSpokenRef.current = { text, at: now };
    refractoryUntilRef.current = now + REFRACTORY_MS;
    speak(text, settingsStore.getState().confirmationSpeechEnabled);
  }, []);

  /** ASR -> NLP -> dispatch for one closed utterance. */
  const processUtterance = useCallback(async (pcm: Float32Array, durationMs: number) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setState((previous) => ({ ...previous, status: 'processing' }));

    try {
      const result = await voiceController.handleUtterance({
        pcm,
        sampleRate: audioConfig.sampleRate,
        durationMs,
      });

      const spoken = result.skipped ? undefined : result.outcome?.spoken;

      setState((previous) => ({
        ...previous,
        status: 'listening',
        lastTranscript: result.asr.text,
        lastResponse: spoken,
        lastIntent: result.interpretation.prediction.intent,
        confidence: result.interpretation.confidence,
        decision: result.interpretation.decision,
      }));

      if (result.skipped) {
        // Nothing usable was heard. If it was music or noise, say so in the UI
        // only (never aloud) - the usual cause is playback through the speaker.
        if (result.asr.nonSpeech) {
          setState((previous) => ({
            ...previous,
            status: 'listening',
            lastTranscript: '(music / noise)',
            lastResponse:
              'Heard music, not speech. Use headphones so the microphone hears you, not the song.',
          }));
        }
        return;
      }

      hapticTap(settingsStore.getState().hapticsEnabled);
      say(spoken);

      // A volume command, or a song request that may have failed to start, is
      // the case where the device can silently disagree with us, so re-read it
      // to keep the screen honest.
      const intent = result.interpretation.prediction.intent;
      if (intent === 'INCREASE_VOLUME' || intent === 'DECREASE_VOLUME' || intent === 'PLAY_SONG') {
        void refreshDevice();
      }
    } catch (error) {
      const message = toUserMessage(error);
      log.warn('utterance handling failed', error);
      setState((previous) => ({ ...previous, status: 'listening', lastResponse: message }));
      say(message);
    } finally {
      processingRef.current = false;
    }
  }, [refreshDevice, say]);

  /** Every captured frame: feeds Adaptive Audio and the pre-roll buffer. */
  const handleFrame = useCallback((frame: MicrophoneFrame) => {
    if (!frame.speechActive) {
      adaptiveAudio.processAmbientNoise(frame.dbfs, frame.durationMs);
    }

    const rolling = rollingRef.current;
    rolling.frames.push({ pcm: frame.pcm, durationMs: frame.durationMs });
    rolling.ms += frame.durationMs;
    while (rolling.ms > PREROLL_MS && rolling.frames.length > 1) {
      const removed = rolling.frames.shift();
      rolling.ms -= removed?.durationMs ?? 0;
    }

    if (frame.speechActive) {
      const utterance = utteranceRef.current;
      // Seeded by the speech-start event; ignore frames before that.
      if (utterance.ms === 0) return;
      utterance.frames.push({ pcm: frame.pcm, durationMs: frame.durationMs });
      utterance.ms += frame.durationMs;
      if (frame.dbfs < utterance.minDbfs) utterance.minDbfs = frame.dbfs;
      if (frame.dbfs > utterance.maxDbfs) utterance.maxDbfs = frame.dbfs;
      if (frame.dbfs > utterance.peakDbfs) utterance.peakDbfs = frame.dbfs;
    }
  }, []);

  /** VAD events: seed the utterance with pre-roll, then commit it. */
  const handleEvents = useCallback(
    (events: VadEvent[], frame: MicrophoneFrame) => {
      for (const event of events) {
        if (event.type === 'speech-start') {
          const rolling = rollingRef.current;
          utteranceRef.current = {
            frames: [...rolling.frames],
            ms: rolling.ms,
            minDbfs: frame.dbfs,
            maxDbfs: frame.dbfs,
            peakDbfs: frame.dbfs,
            startNoiseFloorDb: frame.noiseFloorDb,
          };
          log.debug('speech started');
          continue;
        }

        // speech-end
        const utterance = utteranceRef.current;
        utteranceRef.current = emptyBuffer();
        rollingRef.current = emptyBuffer();

        if (utterance.ms < MIN_UTTERANCE_MS) continue;

        // 1. Our own confirmation speech is picked up by the microphone.
        if (Date.now() < refractoryUntilRef.current) {
          log.debug('ignoring an utterance captured during the post-speech window');
          continue;
        }

        // 2. Speech that barely clears the noise floor came from too far away
        //    (another rider, a passenger, a phone call nearby).
        const snr = utterance.peakDbfs - utterance.startNoiseFloorDb;
        if (utterance.peakDbfs > Number.NEGATIVE_INFINITY && snr < MIN_PEAK_SNR_DB) {
          log.info(
            `ignoring quiet speech (${snr.toFixed(1)} dB above the floor) - too far from the mic`,
          );
          continue;
        }

        // 3. Steady loud audio (music playing through the phone speaker) barely
        //    changes level frame to frame; real speech swings widely.
        const modulation = utterance.maxDbfs - utterance.minDbfs;
        if (utterance.ms >= MODULATION_GATE_MS && modulation < MIN_MODULATION_DB) {
          log.info(
            `ignoring steady audio (${modulation.toFixed(1)} dB over ${Math.round(
              utterance.ms,
            )}ms) - likely playback, not speech`,
          );
          continue;
        }

        const pcm = concatFloat32(utterance.frames.map((entry) => entry.pcm));
        log.debug(`speech ended after ${Math.round(utterance.ms)}ms (${pcm.length} samples)`);
        void processUtterance(pcm, utterance.ms);
      }
    },
    [processUtterance],
  );

  const microphone = useMicrophoneStream({ onFrame: handleFrame, onEvents: handleEvents });

  const microphoneRef = useRef(microphone);
  useEffect(() => {
    microphoneRef.current = microphone;
  }, [microphone]);

  /** Keeps the adaptive engine in sync with the chosen profile. */
  useEffect(() => {
    adaptiveAudio.setProfile(settingsStore.getState().adaptiveAudioProfile);
    adaptiveAudio.setStateListener((adaptive) => {
      setState((previous) => ({
        ...previous,
        noiseZone: adaptive.zone,
        ambientDbfs: adaptive.smoothedDbfs,
      }));
    });
    return () => adaptiveAudio.setStateListener(undefined);
  }, []);

  const start = useCallback(async () => {
    setState((previous) => ({
      ...previous,
      status: 'starting',
      error: undefined,
      lastResponse: undefined,
      lastTranscript: undefined,
    }));

    if (sessionStore.getState().status !== 'connected') {
      setState((previous) => ({
        ...previous,
        status: 'error',
        error: 'Connect your Spotify account first.',
      }));
      return;
    }

    const settings = settingsStore.getState();

    // Seed the context with the real Spotify state before listening.
    try {
      const playback = await playbackController.getState();
      const deviceVolume = await getDeviceVolumePercent();
      contextManager.setState({
        isPlaying: playback?.is_playing ?? false,
        volumePercent: deviceVolume ?? playback?.device?.volume_percent ?? undefined,
      });
      await refreshDevice();
    } catch (error) {
      log.debug('could not read the initial playback state', error);
    }

    adaptiveAudio.setEnabled(settings.adaptiveAudioEnabled);
    contextManager.setState({
      rideMode: true,
      adaptiveAudio: settings.adaptiveAudioEnabled,
    });

    const started = await microphoneRef.current.start();
    if (!started) {
      adaptiveAudio.setEnabled(false);
      contextManager.setState({ rideMode: false, adaptiveAudio: false });
      setState((previous) => ({
        ...previous,
        status: 'error',
        // Surface the real reason (permission, audio session, native failure)
        // instead of always blaming permission.
        error:
          microphoneRef.current.error ?? 'Microphone permission is required for Ride Mode.',
      }));
      return;
    }

    // Keep the microphone usable once the screen turns off / the app is
    // backgrounded. Android blocks background mic access without this.
    startBackgroundListening();
    setState((previous) => ({ ...previous, background: true }));

    hapticDouble(settings.hapticsEnabled);
    setState((previous) => ({
      ...previous,
      status: 'listening',
      adaptiveAudioEnabled: settings.adaptiveAudioEnabled,
    }));
  }, [refreshDevice]);

  const stop = useCallback(() => {
    microphoneRef.current.stop();
    stopBackgroundListening();
    adaptiveAudio.setEnabled(false);
    // Drop any pending yes/no question so it cannot leak into the next ride.
    voiceController.reset();
    contextManager.setState({ rideMode: false, adaptiveAudio: false });
    stopSpeaking();
    setState((previous) => ({
      ...previous,
      status: 'stopped',
      adaptiveAudioEnabled: false,
      background: false,
    }));
  }, []);

  const submitManualCommand = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setState((previous) => ({ ...previous, status: 'processing' }));

    const interpretation = interpretCommand(trimmed, {
      context: contextManager.getState(),
      confidenceThreshold: settingsStore.getState().confidenceThreshold,
    });

    const outcome = await dispatchInterpretation(interpretation, {
      controller: playbackController,
      context: contextManager,
      volumeStepPercent: settingsStore.getState().volumeStepPercent,
    });

    setState((previous) => ({
      ...previous,
      status: 'listening',
      lastTranscript: trimmed,
      lastResponse: outcome.spoken,
      lastIntent: interpretation.prediction.intent,
      confidence: interpretation.confidence,
      decision: interpretation.decision,
    }));

    speak(outcome.spoken, settingsStore.getState().confirmationSpeechEnabled);
  }, []);

  // Never leave the microphone (or the foreground service) running when the
  // screen goes away.
  useEffect(
    () => () => {
      microphoneRef.current.stop();
      stopBackgroundListening();
      adaptiveAudio.setEnabled(false);
      stopSpeaking();
      contextManager.setState({ rideMode: false, adaptiveAudio: false });
    },
    [],
  );

  return { state, activeDevice, microphone, start, stop, submitManualCommand };
}
