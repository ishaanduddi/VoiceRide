/**
 * Adaptive Audio Mode tuning.
 *
 * Thresholds are in dBFS measured from the microphone BEFORE music starts
 * playing, and they depend on the phone's mic gain, so they are intended to be
 * calibrated (see docs/EVALUATION.md). They are grouped into profiles rather
 * than exposed as raw numbers, because a rider cannot tune 8 sliders safely.
 *
 * The engine never maps raw dB to a Spotify volume directly; it only picks a
 * small DELTA to apply on top of the user's baseline volume.
 */

import type { AdaptiveAudioProfile } from '@/storage/preferences';

export type NoiseZone = 'QUIET' | 'MODERATE' | 'NOISY' | 'VERY_NOISY' | 'EXTREME';

export const NOISE_ZONE_ORDER: NoiseZone[] = [
  'QUIET',
  'MODERATE',
  'NOISY',
  'VERY_NOISY',
  'EXTREME',
];

export interface AdaptiveAudioConfig {
  /** Zone boundaries, dBFS, ascending. */
  moderateDb: number;
  noisyDb: number;
  veryNoisyDb: number;
  extremeDb: number;

  /** Volume delta (percentage points) applied on top of the baseline. */
  zoneDelta: Record<NoiseZone, number>;

  /** Moving-average window used to smooth ambient noise. */
  smoothingWindowMs: number;
  /** Minimum delay between two adaptive volume changes. */
  cooldownMs: number;
  /** How long the noise must stay in a new zone before acting. */
  hysteresisDwellMs: number;
  /** Extra dB required to move to a LOUDER zone (prevents flapping). */
  hysteresisDb: number;

  /** Absolute safety ceiling / floor for adaptive changes. */
  maxVolumePercent: number;
  minVolumePercent: number;
}

const BASE_THRESHOLDS = {
  moderateDb: -45,
  noisyDb: -38,
  veryNoisyDb: -32,
  extremeDb: -26,
} as const;

export const ADAPTIVE_AUDIO_PROFILES: Record<AdaptiveAudioProfile, AdaptiveAudioConfig> = {
  conservative: {
    ...BASE_THRESHOLDS,
    zoneDelta: { QUIET: 0, MODERATE: 0, NOISY: 1, VERY_NOISY: 1, EXTREME: 2 },
    smoothingWindowMs: 4000,
    cooldownMs: 8000,
    hysteresisDwellMs: 4000,
    hysteresisDb: 3,
    maxVolumePercent: 85,
    minVolumePercent: 0,
  },
  balanced: {
    ...BASE_THRESHOLDS,
    zoneDelta: { QUIET: 0, MODERATE: 0, NOISY: 1, VERY_NOISY: 2, EXTREME: 2 },
    smoothingWindowMs: 3000,
    cooldownMs: 5000,
    hysteresisDwellMs: 3000,
    hysteresisDb: 2,
    maxVolumePercent: 90,
    minVolumePercent: 0,
  },
  aggressive: {
    ...BASE_THRESHOLDS,
    zoneDelta: { QUIET: 0, MODERATE: 1, NOISY: 2, VERY_NOISY: 3, EXTREME: 3 },
    smoothingWindowMs: 2000,
    cooldownMs: 3500,
    hysteresisDwellMs: 2000,
    hysteresisDb: 1,
    maxVolumePercent: 100,
    minVolumePercent: 0,
  },
};

export function adaptiveConfigForProfile(profile: AdaptiveAudioProfile): AdaptiveAudioConfig {
  return ADAPTIVE_AUDIO_PROFILES[profile];
}
