/** Small async helpers used across services. */

/*
 * Background-safe timers.
 *
 * React Native's Android timer manager stops firing `setTimeout` as soon as the
 * activity is paused (JavaTimerManager.onHostPause) and only resumes on
 * onHostResume. In Ride Mode with the app in the background, a command that
 * awaited `sleep()` therefore never finished — e.g. "next song" waiting to
 * confirm the track changed — and the busy flag blocked every later command
 * until the rider opened the app again.
 *
 * Each deadline below is armed with `setTimeout` (the normal foreground path)
 * AND registered here, so `pumpTimers()` can fire it from something that keeps
 * running in the background: Ride Mode calls it on every microphone frame
 * (~100 ms). Whichever happens first wins; the other is a no-op.
 */
const deadlines = new Set<{ at: number; fire: () => void }>();

/** Calls `fn` after `ms` milliseconds, even while the app is backgrounded. Returns a cancel function. */
export function after(ms: number, fn: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const entry = {
    at: Date.now() + ms,
    fire: () => {
      if (!deadlines.delete(entry)) return;
      if (timer) clearTimeout(timer);
      fn();
    },
  };
  deadlines.add(entry);
  timer = setTimeout(entry.fire, ms);
  return () => {
    deadlines.delete(entry);
    if (timer) clearTimeout(timer);
  };
}

/** Fires every deadline that has passed. Safe to call as often as you like. */
export function pumpTimers(now: number = Date.now()): void {
  for (const entry of [...deadlines]) {
    if (now >= entry.at) entry.fire();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    after(ms, resolve);
  });
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** Rejects if `promise` does not settle within `ms` milliseconds. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        cancel = after(ms, () => reject(new TimeoutError(ms)));
      }),
    ]);
  } finally {
    cancel?.();
  }
}

/**
 * Runs `task` and returns its result, retrying on failure with exponential
 * backoff. Used for flaky mobile network calls.
 */
export async function retry<T>(
  task: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 400;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

/** Trailing-edge debounce, useful for throttling noisy sensor/CB callbacks. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}
