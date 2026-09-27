/** Level measurement helpers used by the VAD and Adaptive Audio Mode. */

export const MIN_DBFS = -100;

/** Root-mean-square level of a frame, in [0, 1]. */
export function computeRms(samples: Float32Array | number[]): number {
  const length = samples.length;
  if (length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const value = samples[i] as number;
    sum += value * value;
  }
  return Math.sqrt(sum / length);
}

/** Peak absolute amplitude of a frame, in [0, 1]. */
export function computePeak(samples: Float32Array | number[]): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const magnitude = Math.abs(samples[i] as number);
    if (magnitude > peak) peak = magnitude;
  }
  return peak;
}

/** Converts a linear RMS value to dBFS, floored at MIN_DBFS. */
export function toDbfs(rms: number): number {
  if (rms <= 1e-7) return MIN_DBFS;
  return Math.max(MIN_DBFS, 20 * Math.log10(rms));
}

/** Inverse of `toDbfs`. */
export function dbfsToRms(dbfs: number): number {
  return 10 ** (dbfs / 20);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
