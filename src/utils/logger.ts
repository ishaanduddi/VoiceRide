/**
 * Tiny structured logger.
 *
 * Everything is prefixed so that `npx expo start` terminal output stays
 * readable while several subsystems (voice, nlp, spotify) log at once.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  child(scope: string): Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel = __DEV__ ? 'debug' : 'info';

function stringifyMeta(meta: unknown): string {
  if (meta === undefined) return '';
  if (meta instanceof Error) return ` ${meta.name}: ${meta.message}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

function emit(scope: string, level: LogLevel, message: string, meta?: unknown): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[MIN_LEVEL]) return;
  const line = `[VoiceRiders:${scope}] ${message}${stringifyMeta(meta)}`;
  // eslint-disable-next-line no-console
  const sink = level === 'error' ? console.error : console.log;
  sink(line);
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, meta) => emit(scope, 'debug', message, meta),
    info: (message, meta) => emit(scope, 'info', message, meta),
    warn: (message, meta) => emit(scope, 'warn', message, meta),
    error: (message, meta) => emit(scope, 'error', message, meta),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

export const logger = createLogger('app');
