import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { newRun, reduce } from '../engine/reducer';
import type { RunState } from '../engine/types';
import { createPersist, type Persist } from './persist';
import { createStore } from './store';

const ctx = nodeContext();

function memoryPersist(): Persist & { saves: RunState[] } {
  const data = new Map<string, string>();
  const p = createPersist({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  });
  const saves: RunState[] = [];
  return {
    saves,
    load: () => p.load(),
    save: (s) => {
      saves.push(s);
      p.save(s);
    },
    clear: () => { p.clear(); },
  };
}

describe('store', () => {
  it('starts a new run from the seed when nothing is saved, and resumes the save when there is one', () => {
    const persist = memoryPersist();
    const a = createStore(ctx, persist, () => 11);
    expect(a.state).toEqual(newRun(11, ctx));
    a.dispatch({ type: 'pickItem', index: 2 });
    const b = createStore(ctx, persist, () => 99);
    expect(b.state).toEqual(a.state);
    expect(b.state.player.items).toHaveLength(1);
  });

  it('dispatch is reduce, then save, then publish; every step is saved', () => {
    const persist = memoryPersist();
    const store = createStore(ctx, persist, () => 11);
    const seen: RunState[] = [];
    const unsubscribe = store.subscribe((s) => seen.push(s));
    expect(seen).toHaveLength(1); // subscribe publishes the current state at once
    const expected = reduce(store.state, { type: 'pickItem', index: 0 }, ctx);
    const got = store.dispatch({ type: 'pickItem', index: 0 });
    expect(got).toEqual(expected);
    expect(store.state).toBe(got);
    expect(persist.saves).toEqual([got]);
    expect(seen.at(-1)).toBe(got);
    store.dispatch({ type: 'toggleTile', index: 0 });
    expect(persist.saves).toHaveLength(2);
    expect(seen).toHaveLength(3);
    unsubscribe();
    store.dispatch({ type: 'clearSelection' });
    expect(seen).toHaveLength(3);
    expect(persist.saves).toHaveLength(3);
  });

  it('newRun through dispatch replaces the run and the save', () => {
    const persist = memoryPersist();
    const store = createStore(ctx, persist, () => 11);
    store.dispatch({ type: 'pickItem', index: 0 });
    const fresh = store.dispatch({ type: 'newRun', seed: 12 });
    expect(fresh).toEqual(newRun(12, ctx));
    expect(persist.load()).toEqual(fresh);
  });
});
