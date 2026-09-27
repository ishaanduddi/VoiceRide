/** The single application-context instance, plus its React hook. */

import { useSyncExternalStore } from 'react';

import { AppContextManager } from '@/nlp/context/contextManager';
import type { AppContext } from '@/nlp/context/types';

export const contextManager = new AppContextManager();

export function useAppContext(): AppContext {
  return useSyncExternalStore(
    contextManager.subscribe,
    contextManager.getState,
    contextManager.getState,
  );
}
