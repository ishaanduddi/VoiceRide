/**
 * ASR provider factory. The rest of the app only ever imports this module.
 *
 * Engine selection (see `EXPO_PUBLIC_ASR_PROVIDER`):
 *
 *   auto (default)  on-device when the model is installed  ->  cloud when an
 *                   endpoint is configured  ->  none
 *   on-device       whisper.cpp on the phone (development build required)
 *   cloud           POST each utterance to your HTTPS endpoint
 *   off             recognition disabled
 *
 * NOTE ON EXPO GO: importing the on-device provider here is safe. It only pulls
 * in `whisper/modelManager` (expo-file-system) and `whisper/whisperModule`,
 * which loads the native `whisper.rn` module with a *dynamic* import inside a
 * try/catch. Expo Go therefore starts normally and reports a helpful error
 * instead of crashing.
 */

import { asrConfig, isCloudAsrConfigured } from '@/config';

import { CloudAsrProvider } from './cloudAsrProvider';
import { UnconfiguredAsrProvider } from './unconfiguredAsrProvider';
import type { AsrProvider } from './types';
import { isModelReady } from './whisper/modelManager';
import { OnDeviceWhisperProvider } from './whisper/onDeviceWhisperProvider';

export type { AsrProvider, AudioUtterance } from './types';
export { CloudAsrProvider } from './cloudAsrProvider';
export { MockAsrProvider } from './mockAsrProvider';
export { UnconfiguredAsrProvider } from './unconfiguredAsrProvider';
export { OnDeviceWhisperProvider, COMMAND_BIAS_PROMPT } from './whisper/onDeviceWhisperProvider';
export {
  modelStore,
  isModelReady,
  downloadModel,
  deleteModel,
  refreshModelStatus,
  formatModelSize,
  type ModelStatus,
  type ModelState,
} from './whisper/modelManager';
export { isWhisperAvailable } from './whisper/whisperModule';
export type { WhisperContext } from './whisper/whisperModule';

export type AsrEngine = 'on-device' | 'cloud' | 'off' | 'unconfigured';

/** Which engine `createAsrProvider()` will pick, without constructing it. */
export function resolveAsrEngine(): AsrEngine {
  switch (asrConfig.provider) {
    case 'off':
      return 'off';
    case 'on-device':
      return 'on-device';
    case 'cloud':
      return isCloudAsrConfigured() ? 'cloud' : 'unconfigured';
    default:
      break;
  }

  // auto: prefer offline recognition when the model is already on disk.
  if (isModelReady()) return 'on-device';
  if (isCloudAsrConfigured()) return 'cloud';
  return 'unconfigured';
}

/** Human-readable engine name for the UI. */
export function describeAsrEngine(): string {
  switch (resolveAsrEngine()) {
    case 'on-device':
      return 'On-device Whisper';
    case 'cloud':
      return 'Cloud endpoint';
    case 'off':
      return 'Disabled';
    default:
      return 'Not configured';
  }
}

/** Chooses the best available provider for the current configuration. */
export function createAsrProvider(): AsrProvider {
  switch (resolveAsrEngine()) {
    case 'on-device':
      return new OnDeviceWhisperProvider();

    case 'cloud':
      return new CloudAsrProvider({
        endpoint: asrConfig.endpoint as string,
        apiKey: asrConfig.apiKey,
        model: asrConfig.model,
      });

    case 'off':
      return new UnconfiguredAsrProvider(
        'Speech recognition is disabled in Settings (EXPO_PUBLIC_ASR_PROVIDER=off).',
      );

    default:
      return new UnconfiguredAsrProvider();
  }
}
