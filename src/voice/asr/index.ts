/** ASR provider factory. The rest of the app only ever imports this module. */

import { asrConfig, isCloudAsrConfigured } from '@/config';

import { CloudAsrProvider } from './cloudAsrProvider';
import { UnconfiguredAsrProvider } from './unconfiguredAsrProvider';
import type { AsrProvider } from './types';

export type { AsrProvider, AudioUtterance } from './types';
export { CloudAsrProvider } from './cloudAsrProvider';
export { MockAsrProvider } from './mockAsrProvider';
export { UnconfiguredAsrProvider } from './unconfiguredAsrProvider';

/** Chooses the best available provider for the current configuration. */
export function createAsrProvider(): AsrProvider {
  if (isCloudAsrConfigured()) {
    return new CloudAsrProvider({
      endpoint: asrConfig.endpoint as string,
      apiKey: asrConfig.apiKey,
      model: asrConfig.model,
    });
  }
  return new UnconfiguredAsrProvider();
}
