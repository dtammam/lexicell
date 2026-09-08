import { newRun, reduce, type Action, type EngineContext } from '../engine/reducer';
import type { RunState } from '../engine/types';
import type { Persist } from './persist';

export type Listener = (state: RunState) => void;

/**
 * The one place UI code touches state. Every action goes through `reduce`, then the
 * result is saved and published. Components render the published state and call
 * `dispatch`; nothing else changes it. Plain TS so it tests without the Svelte
 * compiler; App.svelte mirrors it into a rune.
 */
export interface Store {
  readonly state: RunState;
  dispatch(action: Action): RunState;
  subscribe(listener: Listener): () => void;
}

export function createStore(ctx: EngineContext, persist: Persist, seed: () => number): Store {
  let state = persist.load() ?? newRun(seed(), ctx);
  const listeners = new Set<Listener>();
  const publish = () => {
    persist.save(state);
    for (const l of listeners) l(state);
  };
  return {
    get state() {
      return state;
    },
    dispatch(action) {
      state = reduce(state, action, ctx);
      publish();
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
