/**
 * Noise-zone classification with hysteresis.
 *
 * Requirements embodied here:
 *  - raw dB is never mapped straight to a Spotify volume
 *  - moving to a LOUDER zone requires crossing the boundary by an extra margin
 */

import { NOISE_ZONE_ORDER, type AdaptiveAudioConfig, type NoiseZone } from './config';

/**
 * Classifies a smoothed ambient level into a zone.
 *
 * @param dbfs         smoothed ambient level, dBFS
 * @param config       active profile
 * @param previousZone zone currently applied (used for hysteresis)
 */
export function classifyNoiseZone(
  dbfs: number,
  config: AdaptiveAudioConfig,
  previousZone: NoiseZone | null,
): NoiseZone {
  const thresholds = [config.moderateDb, config.noisyDb, config.veryNoisyDb, config.extremeDb];
  const previousIndex = previousZone ? NOISE_ZONE_ORDER.indexOf(previousZone) : -1;

  let index = 0;
  for (let i = 0; i < thresholds.length; i += 1) {
    const base = thresholds[i] as number;
    // Ascending into a louder zone needs the extra hysteresis margin.
    const threshold = previousIndex >= 0 && i + 1 > previousIndex ? base + config.hysteresisDb : base;
    if (dbfs >= threshold) index = i + 1;
  }

  return NOISE_ZONE_ORDER[index] as NoiseZone;
}

/** Volume delta this zone asks for, relative to the user's baseline. */
export function zoneDelta(zone: NoiseZone, config: AdaptiveAudioConfig): number {
  return config.zoneDelta[zone];
}
