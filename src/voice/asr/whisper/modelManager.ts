/**
 * Runtime download + cache of the whisper.cpp GGML model.
 *
 * The model is 75-150 MB, so it is never committed to the repository or bundled
 * into the app. It is downloaded once into the app's document directory and
 * reused. State is exposed through a tiny observable store so Settings and Ride
 * Mode can both render it.
 */

import { File, Paths } from 'expo-file-system';

import { whisperConfig } from '@/config';
import { ObservableStore } from '@/state/observable';
import { toUserMessage } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

const log = createLogger('voice:asr:model');

export type ModelState = 'missing' | 'downloading' | 'ready' | 'error';

export interface ModelStatus {
  state: ModelState;
  /** 0..1 while downloading. */
  progress: number;
  uri?: string;
  sizeBytes?: number;
  error?: string;
  /** A different (newer) model file exists on the server. */
  updateAvailable?: boolean;
  /** Size reported by the server, when a check succeeded. */
  remoteSizeBytes?: number;
  /** Last successful update check, ms since epoch. */
  lastCheckedAt?: number;
}

/** Don't hit the model host on every launch. */
const MODEL_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** A size difference beyond 1% means the published file changed. */
const SIZE_TOLERANCE = 0.01;

export const modelStore = new ObservableStore<ModelStatus>({ state: 'missing', progress: 0 });

function modelFile(): File {
  return new File(Paths.document, whisperConfig.modelFilename);
}

/** URI of the installed model, or undefined when it is not downloaded. */
export function getModelUri(): string | undefined {
  const file = modelFile();
  return file.exists ? file.uri : undefined;
}

/** Synchronous check — `File.exists` is a property, so the ASR factory can use it. */
export function isModelReady(): boolean {
  return modelFile().exists;
}

export async function refreshModelStatus(): Promise<void> {
  const file = modelFile();
  if (file.exists) {
    modelStore.setState({
      state: 'ready',
      progress: 1,
      uri: file.uri,
      sizeBytes: file.size,
      error: undefined,
    });
  } else {
    modelStore.setState({
      state: 'missing',
      progress: 0,
      uri: undefined,
      sizeBytes: undefined,
      updateAvailable: false,
      remoteSizeBytes: undefined,
    });
  }
}

/**
 * Checks whether the published model file differs from the installed one.
 *
 * The model is a static file on Hugging Face; when the maintainers republish it
 * the size changes. A 12-hour cache keeps the check off every launch.
 */
export async function checkModelUpdate(force = false): Promise<void> {
  const state = modelStore.getState();
  if (state.state !== 'ready' || !state.sizeBytes) return;
  if (
    !force &&
    state.lastCheckedAt &&
    Date.now() - state.lastCheckedAt < MODEL_CHECK_INTERVAL_MS
  ) {
    return;
  }

  try {
    const response = await fetch(whisperConfig.modelUrl, { method: 'HEAD' });
    const sizeHeader = response.headers.get('content-length');
    const remoteSize = sizeHeader ? Number(sizeHeader) : Number.NaN;
    if (!response.ok || !Number.isFinite(remoteSize) || remoteSize <= 0) return;

    modelStore.setState({
      lastCheckedAt: Date.now(),
      remoteSizeBytes: remoteSize,
      updateAvailable:
        Math.abs(remoteSize - state.sizeBytes) > state.sizeBytes * SIZE_TOLERANCE,
    });
  } catch (error) {
    log.debug('could not check for a model update', error);
  }
}

/** Downloads the model, reporting progress through `modelStore`. */
export async function downloadModel(): Promise<void> {
  const url = whisperConfig.modelUrl;
  if (!url) {
    modelStore.setState({
      state: 'error',
      error: 'No model URL configured (EXPO_PUBLIC_WHISPER_MODEL_URL).',
    });
    return;
  }

  const destination = modelFile();
  modelStore.setState({ state: 'downloading', progress: 0, error: undefined });

  try {
    if (destination.exists) destination.delete();

    const task = File.createDownloadTask(url, destination, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        modelStore.setState({
          progress: totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : 0,
        });
      },
    });

    const result = await task.downloadAsync();
    if (!result) throw new Error('The download was interrupted. Try again.');

    modelStore.setState({
      state: 'ready',
      progress: 1,
      uri: result.uri,
      sizeBytes: result.size,
      error: undefined,
      // The freshly downloaded file is current by definition.
      updateAvailable: false,
      remoteSizeBytes: undefined,
      lastCheckedAt: Date.now(),
    });
    log.info(`model ready: ${(result.size / 1_000_000).toFixed(1)} MB`);
  } catch (error) {
    log.warn('model download failed', error);
    modelStore.setState({ state: 'error', progress: 0, error: toUserMessage(error) });
  }
}

export async function deleteModel(): Promise<void> {
  const file = modelFile();
  if (file.exists) file.delete();
  await refreshModelStatus();
  log.info('model deleted');
}

export function formatModelSize(sizeBytes?: number): string {
  if (!sizeBytes) return 'unknown size';
  return `${(sizeBytes / 1_000_000).toFixed(0)} MB`;
}
