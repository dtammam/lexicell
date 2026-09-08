import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { newRun, reduce, SAVE_VERSION } from '../engine/reducer';
import { createPersist, RUN_STATE_KEYS, SAVE_KEY, type StorageLike } from './persist';

const ctx = nodeContext();

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('persist', () => {
  it('RUN_STATE_KEYS is exactly the shape newRun produces (tech-debt #3: a field change must bump SAVE_VERSION)', () => {
    const fresh = newRun(3, ctx);
    expect([...RUN_STATE_KEYS].sort()).toEqual(Object.keys(fresh).sort());
    expect(fresh.v).toBe(SAVE_VERSION);
  });

  it('round-trips a state through save and load', () => {
    const storage = fakeStorage();
    const p = createPersist(storage);
    let s = newRun(3, ctx);
    s = reduce(s, { type: 'pickItem', index: 0 }, ctx);
    p.save(s);
    expect(storage.data.has(SAVE_KEY)).toBe(true);
    expect(p.load()).toEqual(s);
  });

  it('returns null with nothing saved', () => {
    expect(createPersist(fakeStorage()).load()).toBeNull();
  });

  it('drops a blob with the wrong version', () => {
    const s = newRun(3, ctx);
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: SAVE_VERSION + 1 }) });
    expect(createPersist(storage).load()).toBeNull();
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });

  it('drops a blob whose shape is not the current one (a missing field, an extra field)', () => {
    const s = newRun(3, ctx);
    const missing: Record<string, unknown> = { ...s };
    delete missing.pendingPicks;
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(missing) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, extra: 1 }) })).load()).toBeNull();
  });

  it('drops a blob with the right keys and wrong types (gate W1: it would throw inside render on every reload)', () => {
    const s = newRun(3, ctx);
    const bad: Record<string, unknown>[] = [
      { ...s, player: [] },
      { ...s, phase: 42 },
      { ...s, rng: null },
      { ...s, phase: 'fight', encounter: null },
      { ...s, encounter: { enemy: {}, grid: [], selection: [] } },
      { ...s, pendingPicks: 'one' },
      { ...s, stats: null },
    ];
    for (const blob of bad) {
      const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(blob) });
      expect(createPersist(storage).load(), JSON.stringify(blob).slice(0, 60)).toBeNull();
      expect(storage.data.has(SAVE_KEY)).toBe(false);
    }
  });

  it('drops corrupt JSON and non-object blobs', () => {
    for (const raw of ['{not json', '42', 'null', '[]', '"str"']) {
      const storage = fakeStorage({ [SAVE_KEY]: raw });
      expect(createPersist(storage).load(), raw).toBeNull();
      expect(storage.data.has(SAVE_KEY), raw).toBe(false);
    }
  });

  it('never throws when storage refuses', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const p = createPersist(broken);
    expect(p.load()).toBeNull();
    expect(() => { p.save(newRun(1, ctx)); }).not.toThrow();
    expect(() => { p.clear(); }).not.toThrow();
  });

  it('clear removes the save', () => {
    const storage = fakeStorage();
    const p = createPersist(storage);
    p.save(newRun(1, ctx));
    p.clear();
    expect(p.load()).toBeNull();
  });
});
