/**
 * Energy-based Voice Activity Detection (step 2 of the pipeline).
 *
 * Deliberately lightweight: RMS + an ADAPTIVE noise floor + onset/hangover
 * timers. This keeps the microphone pipeline cheap enough to run continuously
 * while riding, and it means ASR is only ever called on real speech.
 *
 * The API is streaming and allocation-free per frame, so it can later be
 * swapped for a WebRTC VAD or Silero VAD implementation behind the same calls.
 */

import { clamp, computeRms, MIN_DBFS, toDbfs } from '../audioProcessing/rms';

export interface VadConfig {
  /** dB above the noise floor required to START speech. */
  startThresholdDb: number;
  /** dB above the noise floor below which speech is considered finished. */
  endThresholdDb: number;
  /** Minimum continuous speech before an utterance is confirmed. */
  minSpeechMs: number;
  /** Silence needed to close an utterance. */
  minSilenceMs: number;
  /** Hard ceiling on a single utterance, so ASR is never fed a runaway clip. */
  maxUtteranceMs: number;
  /** Noise-floor adaptation rate, 0..1 (only applied on non-speech frames). */
  noiseFloorAdaptation: number;
  initialNoiseFloorDb: number;
  minNoiseFloorDb: number;
  maxNoiseFloorDb: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  /**
   * Raised from 8 dB: with music or engine drone present, a low margin let
   * steady background audio trip the detector and get sent to ASR as "speech".
   */
  startThresholdDb: 10,
  endThresholdDb: 5,
  /** Speech must persist this long before an utterance opens. */
  minSpeechMs: 250,
  minSilenceMs: 600,
  maxUtteranceMs: 6000,
  /** Adapt faster, so loud music raises the floor instead of triggering. */
  noiseFloorAdaptation: 0.08,
  initialNoiseFloorDb: -50,
  minNoiseFloorDb: -70,
  /** Allow the floor to track loud playback (phone speaker) upward. */
  maxNoiseFloorDb: -20,
};

export type VadEvent =
  | { type: 'speech-start'; dbfs: number }
  | { type: 'speech-end'; durationMs: number; dbfs: number };

export interface VadFrameResult {
  dbfs: number;
  noiseFloorDb: number;
  /** This frame is above the onset threshold. */
  aboveThreshold: boolean;
  /** An utterance is currently open. */
  speechActive: boolean;
  events: VadEvent[];
}

export class EnergyVad {
  private readonly config: VadConfig;
  private noiseFloor: number;
  private speechActive = false;
  private onsetMs = 0;
  private silenceMs = 0;
  private utteranceMs = 0;

  constructor(config: Partial<VadConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
    this.noiseFloor = this.config.initialNoiseFloorDb;
  }

  get noiseFloorDb(): number {
    return this.noiseFloor;
  }

  reset(): void {
    this.noiseFloor = this.config.initialNoiseFloorDb;
    this.speechActive = false;
    this.onsetMs = 0;
    this.silenceMs = 0;
    this.utteranceMs = 0;
  }

  /**
   * Feeds one audio frame and returns any VAD events it produced.
   * `durationMs` is the real duration of the frame, so variable-size buffers
   * from the microphone work correctly.
   */
  process(frame: Float32Array, durationMs: number): VadFrameResult {
    const dbfs = toDbfs(computeRms(frame));
    const events: VadEvent[] = [];
    const startThreshold = this.noiseFloor + this.config.startThresholdDb;
    const endThreshold = this.noiseFloor + this.config.endThresholdDb;
    const aboveThreshold = dbfs >= startThreshold;

    if (!this.speechActive) {
      if (aboveThreshold) {
        this.onsetMs += durationMs;
        if (this.onsetMs >= this.config.minSpeechMs) {
          this.speechActive = true;
          this.silenceMs = 0;
          this.utteranceMs = this.onsetMs;
          events.push({ type: 'speech-start', dbfs });
        }
      } else {
        // Likely ambient noise: track it, and decay any partial onset.
        this.onsetMs = Math.max(0, this.onsetMs - durationMs * 0.5);
        const rate = this.config.noiseFloorAdaptation;
        this.noiseFloor = clamp(
          this.noiseFloor * (1 - rate) + dbfs * rate,
          this.config.minNoiseFloorDb,
          this.config.maxNoiseFloorDb,
        );
      }
    } else {
      this.utteranceMs += durationMs;
      if (dbfs < endThreshold) this.silenceMs += durationMs;
      else this.silenceMs = 0;

      const finished =
        this.silenceMs >= this.config.minSilenceMs ||
        this.utteranceMs >= this.config.maxUtteranceMs;

      if (finished) {
        events.push({ type: 'speech-end', durationMs: this.utteranceMs, dbfs });
        this.speechActive = false;
        this.onsetMs = 0;
        this.silenceMs = 0;
        this.utteranceMs = 0;
      }
    }

    return {
      dbfs: Math.max(MIN_DBFS, dbfs),
      noiseFloorDb: this.noiseFloor,
      aboveThreshold,
      speechActive: this.speechActive,
      events,
    };
  }
}

/** Factory kept for symmetry with the ASR providers. */
export function createVad(config: Partial<VadConfig> = {}): EnergyVad {
  return new EnergyVad(config);
}
