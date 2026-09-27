/** Smoothing and hysteresis primitives for Adaptive Audio Mode. */

import type { NoiseZone } from './config';

/** Fixed-window moving average (cheap, allocation-free after construction). */
export class MovingAverage {
  private readonly buffer: Float64Array;
  private index = 0;
  private count = 0;
  private total = 0;

  constructor(private readonly windowSize: number) {
    this.buffer = new Float64Array(Math.max(1, windowSize));
  }

  push(value: number): void {
    if (this.count === this.windowSize) {
      this.total -= this.buffer[this.index] as number;
    } else {
      this.count += 1;
    }
    this.buffer[this.index] = value;
    this.total += value;
    this.index = (this.index + 1) % this.windowSize;
  }

  get value(): number {
    return this.count === 0 ? 0 : this.total / this.count;
  }

  reset(): void {
    this.buffer.fill(0);
    this.index = 0;
    this.count = 0;
    this.total = 0;
  }
}

/**
 * Time-based hysteresis for discrete states.
 *
 * A new zone is only returned once it has been continuously observed for
 * `dwellMs`, which is what stops the volume from oscillating every frame.
 */
export class HysteresisGate<T> {
  private candidate: T | null = null;
  private candidateSince = 0;

  constructor(private readonly dwellMs: number) {}

  /**
   * @param next      freshly measured state
   * @param current   state currently applied
   * @param nowMs     monotonic clock (ms)
   * @returns the state to apply, or null if nothing should change yet
   */
  update(next: T, current: T | null, nowMs: number): T | null {
    if (current !== null && next === current) {
      this.candidate = null;
      return null;
    }
    if (this.candidate !== next) {
      this.candidate = next;
      this.candidateSince = nowMs;
      return null;
    }
    if (nowMs - this.candidateSince >= this.dwellMs) {
      return next;
    }
    return null;
  }

  reset(): void {
    this.candidate = null;
    this.candidateSince = 0;
  }
}

/** Cooldown helper: allows an action at most once per `cooldownMs`. */
export class Cooldown {
  private lastAt = 0;

  constructor(private readonly cooldownMs: number) {}

  ready(nowMs: number): boolean {
    return nowMs - this.lastAt >= this.cooldownMs;
  }

  mark(nowMs: number): void {
    this.lastAt = nowMs;
  }

  reset(): void {
    this.lastAt = 0;
  }
}

export type { NoiseZone };
