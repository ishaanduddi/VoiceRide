/**
 * The ONLY module that touches `whisper.rn`.
 *
 * `whisper.rn` is a native module, so it is absent in Expo Go. It is therefore
 * loaded with a **dynamic import** wrapped in a try/catch: in Expo Go the
 * promise rejects and the app degrades to "needs a development build" instead
 * of crashing at startup.
 *
 * The module surface is re-declared locally (rather than imported from
 * `whisper.rn`'s own types) so an upstream type change cannot break our build.
 */

import { AsrNotConfiguredError } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

const log = createLogger('voice:asr:whisper');

export interface WhisperTranscribeOptions {
  language?: string;
  translate?: boolean;
  maxThreads?: number;
  temperature?: number;
  beamSize?: number;
  bestOf?: number;
  /** Initial prompt — used to bias the decoder toward the command vocabulary. */
  prompt?: string;
}

export interface WhisperTranscribeResult {
  result: string;
  language?: string;
  segments?: { text: string }[];
}

export interface WhisperContext {
  transcribe(
    filePathOrBase64: string,
    options?: WhisperTranscribeOptions,
  ): { stop: () => Promise<void>; promise: Promise<WhisperTranscribeResult> };
  release(): Promise<void>;
  /** True when the model is running on GPU / the Hexagon NPU. */
  gpu?: boolean;
  reasonNoGPU?: string;
}

interface WhisperRnModule {
  initWhisper(options: {
    filePath: string;
    useGpu?: boolean;
    useCoreMLIos?: boolean;
    useFlashAttn?: boolean;
  }): Promise<WhisperContext>;
  releaseAllWhisper(): Promise<void>;
  libVersion?: string;
}

let modulePromise: Promise<WhisperRnModule> | null = null;

export class WhisperUnavailableError extends AsrNotConfiguredError {
  constructor() {
    super(
      'On-device speech recognition needs a development build: whisper.rn is a native module and is not ' +
        'available in Expo Go. Build one with `npx eas build --profile development` (see docs/ON_DEVICE_ASR.md).',
    );
    this.name = 'WhisperUnavailableError';
  }
}

/** Loads whisper.rn once; rejects with a helpful error outside a dev build. */
export async function loadWhisperModule(): Promise<WhisperRnModule> {
  if (!modulePromise) {
    modulePromise = import('whisper.rn')
      .then((module) => module as unknown as WhisperRnModule)
      .catch((error: unknown) => {
        // Allow a later retry (e.g. after installing a dev build).
        modulePromise = null;
        log.info('whisper.rn is not available in this runtime', error);
        throw new WhisperUnavailableError();
      });
  }
  return modulePromise;
}

/** Non-throwing capability probe, used by the Settings screen. */
export async function isWhisperAvailable(): Promise<boolean> {
  try {
    await loadWhisperModule();
    return true;
  } catch {
    return false;
  }
}
