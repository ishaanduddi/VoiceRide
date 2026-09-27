/**
 * Global JS error capture.
 *
 * A release APK has no console, so an unhandled error between renders (or a
 * fatal startup error) is otherwise invisible. This installs a handler that logs
 * the error in a structured way and then defers to the previous handler.
 *
 * NOTE: this only covers the JavaScript layer. A process-level (native) crash
 * still requires `adb logcat` — see docs/TROUBLESHOOTING.md.
 */

import { createLogger } from '@/utils/logger';

const log = createLogger('crash');

type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler?: () => GlobalErrorHandler | undefined;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
}

export function installGlobalErrorHandler(): void {
  const errorUtils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const previous = errorUtils.getGlobalHandler?.();

  errorUtils.setGlobalHandler((error, isFatal) => {
    log.error(`unhandled error (fatal=${String(isFatal ?? false)})`, error);
    previous?.(error, isFatal);
  });
}
