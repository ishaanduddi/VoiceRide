/**
 * Minimal observable store + React binding.
 *
 * A tiny hand-rolled store keeps the app free of state-management
 * dependencies and, importantly, keeps the service layer (NLP, playback,
 * adaptive audio) usable OUTSIDE React — which the ML harness relies on.
 */

import { useSyncExternalStore } from 'react';

export type Unsubscribe = () => void;

export class ObservableStore<T extends object> {
  private state: T;
  private readonly listeners = new Set<() => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  getState = (): T => this.state;

  setState = (patch: Partial<T>): void => {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/** Subscribes a component to a store. */
export function useStore<T extends object>(store: ObservableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
