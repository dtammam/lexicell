import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { newRun, reduce, SAVE_VERSION } from '../engine/reducer';
import type { RunState } from '../engine/types';
import { createPersist, migrate, RUN_STATE_KEYS, SAVE_KEY, type StorageLike } from './persist';

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

  it('drops a blob with the wrong version (v1, v2, the future) and MIGRATES v3 and v4 saves forward', () => {
    const s = newRun(3, ctx);
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: SAVE_VERSION + 1 }) });
    expect(createPersist(storage).load()).toBeNull();
    expect(storage.data.has(SAVE_KEY)).toBe(false);
    expect(SAVE_VERSION).toBe(5);
    for (const old of [1, 2]) {
      const stale = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: old }) });
      expect(createPersist(stale).load()).toBeNull();
      expect(stale.data.has(SAVE_KEY)).toBe(false);
    }
    // A v3 save (no cell, no worst word) loads as v5: the balanced cell (Dean, 2026-09-08, question 3) and empty worst stats.
    const oldStats = Object.fromEntries(Object.entries(s.stats).filter(([k]) => k !== 'worstWord' && k !== 'worstWordDamage'));
    const v4body = { ...s, stats: oldStats };
    const v3body = Object.fromEntries(Object.entries(v4body).filter(([k]) => k !== 'cell')) as Omit<RunState, 'cell'>;
    const v3 = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v3body, v: 3 }) });
    const loaded = createPersist(v3).load();
    expect(loaded).not.toBeNull();
    expect(loaded?.v).toBe(5);
    expect(loaded?.cell).toBe('balanced');
    expect(loaded?.stats.worstWord).toBe('');
    expect(loaded?.stats.worstWordDamage).toBe(0);
    expect(loaded?.rng).toEqual(s.rng);
    // A v4 save (cell, no worst word) loads as v5 too.
    const fromV4 = createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v4body, v: 4 }) })).load();
    expect(fromV4?.v).toBe(5);
    expect(fromV4?.cell).toBe(s.cell);
    expect(fromV4?.stats).toEqual(s.stats);
    // Blobs that claim a version whose shape they do not have are not migrated: dropped.
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: 3 }) })).load()).toBeNull(); // v3 with a cell
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: 4 }) })).load()).toBeNull(); // v4 with worst stats
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(v3body) })).load()).toBeNull(); // v5 without a cell
    expect(migrate({ ...v3body, v: 3 })).toEqual({ ...v3body, v: 5, cell: 'balanced', stats: { ...oldStats, worstWord: '', worstWordDamage: 0 } });
    // The stats the screens render are type-checked (gate W1): a v5 blob whose stats lack or mistype them is dropped.
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, stats: oldStats }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, stats: { ...s.stats, worstWord: 7 } }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, stats: { ...s.stats, bestWord: 7 } }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, stats: { ...s.stats, bestWordDamage: '9' } }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, stats: { ...s.stats, worstWordDamage: '9' } }) })).load()).toBeNull();
    // The cell must be a string (gate S1); an unknown id is the render boundary's job, like an unknown item.
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, cell: 7 }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, cell: null }) })).load()).toBeNull();
    expect(migrate('x')).toBe('x');
    // A v2-shaped player under a forged v: 3 is dropped by the shape check, one missing field at a time.
    const omit = (o: object, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
    const noShield = omit(s.player, 'shield');
    const noFree = omit(s.player, 'freeShuffles');
    for (const player of [noShield, noFree]) {
      const forged = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, player }) });
      expect(createPersist(forged).load()).toBeNull();
    }
    // Likewise a v2-shaped enemy (no poison, no stunned): the reducer would compute NaN HP from it.
    const fight = s.phase === 'fight' ? s : reduce(s, { type: 'pickItem', index: 0 }, ctx);
    const enc = fight.encounter as NonNullable<RunState['encounter']>;
    const noPoison = omit(enc.enemy, 'poison');
    const noStun = omit(enc.enemy, 'stunned');
    for (const enemy of [noPoison, noStun]) {
      const forged = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...fight, encounter: { ...enc, enemy } }) });
      expect(createPersist(forged).load()).toBeNull();
    }
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
      { ...s, player: { ...s.player, items: 'lens' } },
      { ...s, player: { ...s.player, hp: '100' } },
      { ...s, encounterIndex: 1.5 },
      { ...s, lastTurn: 'none' },
      { ...s, offer: 'lens' },
    ];
    for (const blob of bad) {
      const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(blob) });
      expect(createPersist(storage).load(), JSON.stringify(blob).slice(0, 60)).toBeNull();
      expect(storage.data.has(SAVE_KEY)).toBe(false);
    }
  });

  it('still loads a save whose lastTurn predates the used field (nested additive change, UI guards it)', () => {
    let s = newRun(3, ctx);
    s = reduce(s, { type: 'pickItem', index: 0 }, ctx);
    const blob = JSON.parse(JSON.stringify(s)) as { lastTurn: Record<string, unknown> | null };
    if (blob.lastTurn) delete blob.lastTurn.used;
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(blob) })).load()).not.toBeNull();
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
