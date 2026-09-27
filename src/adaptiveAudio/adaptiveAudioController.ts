/**
 * Adaptive Audio Mode controller (pipeline branch on the right of the diagram).
 *
 *   ambient frame -> moving average -> zone -> hysteresis -> volume delta
 *
 * Key design decisions:
 *  - It works in DELTAS from a user baseline, never in absolute volume.
 *  - `notifyManualVolumeChange` rebases that baseline, so an adaptive boost is
 *    never undone by (or does undo) a spoken "increase volume".
 *  - All changes are rate-limited and hysteretic.
 */

import { createLogger } from '@/utils/logger';

import {
  adaptiveConfigForProfile,
  type AdaptiveAudioConfig,
  type NoiseZone,
} from './config';
import { Cooldown, HysteresisGate, MovingAverage } from './hysteresis';
import { classifyNoiseZone, zoneDelta } from './noiseZones';

import type { AdaptiveAudioProfile } from '@/storage/preferences';

const log = createLogger('adaptive-audio');

const NOMINAL_FRAME_MS = 30;
const EVALUATION_INTERVAL_MS = 1000;
const DEFAULT_VOLUME_PERCENT = 50;

export interface AdaptiveAudioDeps {
  /** Current Spotify volume, if known. */
  getVolumePercent: () => number | undefined;
  /** Applies an absolute volume. `source` is always 'adaptive'. */
  setVolume: (percent: number, source: 'adaptive') => Promise<{ volumePercent: number }>;
  onStateChange?: (state: AdaptiveAudioState) => void;
}

export interface AdaptiveAudioState {
  enabled: boolean;
  zone: NoiseZone;
  smoothedDbfs: number;
  baselineVolume: number;
  /** Delta currently applied on top of the baseline. */
  appliedDelta: number;
}

export class AdaptiveAudioController {
  private config: AdaptiveAudioConfig;
  private enabled = false;

  private readonly average: MovingAverage;
  private readonly gate: HysteresisGate<NoiseZone>;
  private readonly cooldown: Cooldown;

  private baselineVolume = DEFAULT_VOLUME_PERCENT;
  private lastAppliedVolume = DEFAULT_VOLUME_PERCENT;
  private currentZone: NoiseZone | null = null;
  private smoothedDbfs = -100;
  private accumulatedMs = 0;
  private applying = false;

  constructor(
    private readonly deps: AdaptiveAudioDeps,
    profile: AdaptiveAudioProfile = 'balanced',
  ) {
    this.config = adaptiveConfigForProfile(profile);
    this.average = new MovingAverage(
      Math.max(1, Math.round(this.config.smoothingWindowMs / NOMINAL_FRAME_MS)),
    );
    this.gate = new HysteresisGate<NoiseZone>(this.config.hysteresisDwellMs);
    this.cooldown = new Cooldown(this.config.cooldownMs);
  }

  setProfile(profile: AdaptiveAudioProfile): void {
    this.config = adaptiveConfigForProfile(profile);
    this.reset();
  }

  /** Lets the UI observe zone/volume changes. Pass `undefined` to detach. */
  setStateListener(listener?: (state: AdaptiveAudioState) => void): void {
    this.deps.onStateChange = listener;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.reset();
      const current = this.deps.getVolumePercent();
      this.baselineVolume = current ?? DEFAULT_VOLUME_PERCENT;
      this.lastAppliedVolume = this.baselineVolume;
      log.info(`adaptive audio enabled (baseline ${this.baselineVolume}%)`);
    } else {
      log.info('adaptive audio disabled');
    }
    this.emit();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  getState(): AdaptiveAudioState {
    return {
      enabled: this.enabled,
      zone: this.currentZone ?? 'QUIET',
      smoothedDbfs: this.smoothedDbfs,
      baselineVolume: this.baselineVolume,
      appliedDelta: this.lastAppliedVolume - this.baselineVolume,
    };
  }

  /**
   * A voice command or the user changed the volume: that is the new normal.
   * Adaptive Audio must adapt around it, not fight it.
   */
  notifyManualVolumeChange(volumePercent: number): void {
    this.baselineVolume = volumePercent;
    this.lastAppliedVolume = volumePercent;
    this.gate.reset();
    this.cooldown.reset();
    this.emit();
  }

  /** Feed ambient noise (call with frames VAD classified as non-speech). */
  processAmbientNoise(dbfs: number, durationMs: number): void {
    if (!this.enabled) return;

    this.average.push(dbfs);
    this.accumulatedMs += durationMs;

    if (this.accumulatedMs < EVALUATION_INTERVAL_MS) return;
    this.accumulatedMs = 0;
    void this.evaluate();
  }

  private async evaluate(): Promise<void> {
    if (this.applying) return;

    const now = Date.now();
    this.smoothedDbfs = this.average.value;

    const measured = classifyNoiseZone(this.smoothedDbfs, this.config, this.currentZone);
    const decided = this.gate.update(measured, this.currentZone, now);
    if (decided === null) {
      this.emit();
      return;
    }

    this.currentZone = decided;

    const desired = Math.max(
      this.config.minVolumePercent,
      Math.min(this.config.maxVolumePercent, this.baselineVolume + zoneDelta(decided, this.config)),
    );

    if (Math.abs(desired - this.lastAppliedVolume) < 1 || !this.cooldown.ready(now)) {
      this.emit();
      return;
    }

    this.applying = true;
    try {
      const result = await this.deps.setVolume(desired, 'adaptive');
      this.lastAppliedVolume = result.volumePercent;
      this.cooldown.mark(now);
      log.info(
        `zone ${decided} (${this.smoothedDbfs.toFixed(1)} dBFS) -> volume ${result.volumePercent}% ` +
          `(baseline ${this.baselineVolume}%)`,
      );
    } catch (error) {
      log.warn('failed to apply adaptive volume', error);
    } finally {
      this.applying = false;
      this.emit();
    }
  }

  reset(): void {
    this.average.reset();
    this.gate.reset();
    this.cooldown.reset();
    this.currentZone = null;
    this.smoothedDbfs = -100;
    this.accumulatedMs = 0;
  }

  private emit(): void {
    this.deps.onStateChange?.(this.getState());
  }
}
