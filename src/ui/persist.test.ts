import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { CONTENT } from '../content/index';
import { newRun, reduce, SAVE_VERSION } from '../engine/reducer';
import type { RunState } from '../engine/types';
import { createPersist, dropUnknownIds, migrate, RUN_STATE_KEYS, SAVE_KEY, type StorageLike } from './persist';

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
    expect(SAVE_VERSION).toBe(10);
    for (const old of [1, 2]) {
      const stale = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: old }) });
      expect(createPersist(stale).load()).toBeNull();
      expect(stale.data.has(SAVE_KEY)).toBe(false);
    }
    // A v8 save (no mode, no curses) migrates forward as a normal run (modes, step 5).
    const v8body = Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'mode' && k !== 'curses'));
    const fromV8 = createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v8body, v: 8 }) })).load();
    expect(fromV8?.v).toBe(10);
    expect(fromV8?.mode).toBe('normal');
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(v8body) })).load()).toBeNull(); // v9 without a mode is dropped
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, mode: 'hard' }) })).load()).toBeNull();
    const endless = { ...s, mode: 'endless' };
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(endless) })).load()).toEqual(endless);
    // A v7 save (tiles without gold or cracked) loads as v9 with plain marks on every tile (grid rules, step 4).
    const fightS = s.phase === 'fight' ? s : reduce(s, { type: 'pickItem', index: 0 }, ctx);
    const encS = fightS.encounter as NonNullable<RunState['encounter']>;
    // A pre-v9 blob carries neither a mode nor curses: the migration is by version AND shape, so the fixtures strip both.
    const noMode = (o: object) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'mode' && k !== 'curses'));
    const v7body = { ...noMode(fightS), encounter: { ...encS, grid: encS.grid.map((t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'gold' && k !== 'cracked'))) } };
    const fromV7 = createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v7body, v: 7 }) })).load();
    expect(fromV7?.v).toBe(10);
    expect(fromV7?.encounter?.grid.every((t) => t.gold === 0 && t.cracked === 0)).toBe(true);
    expect(fromV7?.encounter?.grid.map((t) => t.letter)).toEqual(encS.grid.map((t) => t.letter));
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...noMode(fightS), v: 7 }) })).load()?.v).toBe(10); // v7 already carrying marks keeps them
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...fightS, v: 7 }) })).load()).toBeNull(); // a v7 blob claiming a mode is not a v7 blob
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(v7body) })).load()).toBeNull(); // v8 without the marks is dropped
    // Marks are non-negative integers (gate S2): a negative, a fraction or a string on any tile drops the blob.
    for (const bad of [{ gold: -50 }, { gold: 2.5 }, { cracked: -1 }, { venom: '2' }, { lockedTurns: 1.5 }]) {
      const grid = encS.grid.map((t, i) => (i === 3 ? { ...t, ...bad } : t));
      expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...fightS, encounter: { ...encS, grid } }) })).load(), JSON.stringify(bad)).toBeNull();
    }
    // A v6 save (no traits on the player) loads as v8 with none (evolution, step 3).
    const oldPlayer = Object.fromEntries(Object.entries(s.player).filter(([k]) => k !== 'traits'));
    const v6body = { ...v8body, player: oldPlayer };
    const fromV6 = createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v6body, v: 6 }) })).load();
    expect(fromV6?.v).toBe(10);
    expect(fromV6?.player.traits).toEqual([]);
    expect(fromV6?.rng).toEqual(s.rng);
    // A v5 save (no kinds, no event) loads as v7 with empty kinds: the rest of its run is fights (encounter types, step 2).
    const v5body = Object.fromEntries(Object.entries(v6body).filter(([k]) => k !== 'kinds' && k !== 'event')) as unknown as Omit<RunState, 'kinds' | 'event'>;
    const fromV5 = createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v5body, v: 5 }) })).load();
    expect(fromV5?.v).toBe(10);
    expect(fromV5?.kinds).toEqual([]);
    expect(fromV5?.event).toBeNull();
    expect(fromV5?.player.traits).toEqual([]);
    expect(fromV5?.rng).toEqual(s.rng);
    // A v3 save (no cell, no worst word) loads as v8: the balanced cell (Dean, 2026-09-08, question 3), empty worst stats, empty kinds, no traits.
    const oldStats = Object.fromEntries(Object.entries(s.stats).filter(([k]) => k !== 'worstWord' && k !== 'worstWordDamage'));
    const v4body = { ...v5body, stats: oldStats };
    const v3body = Object.fromEntries(Object.entries(v4body).filter(([k]) => k !== 'cell')) as unknown as Omit<RunState, 'cell' | 'kinds' | 'event' | 'mode'>;
    const v3 = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v3body, v: 3 }) });
    const loaded = createPersist(v3).load();
    expect(loaded).not.toBeNull();
    expect(loaded?.v).toBe(10);
    expect(loaded?.cell).toBe('balanced');
    expect(loaded?.stats.worstWord).toBe('');
    expect(loaded?.stats.worstWordDamage).toBe(0);
    expect(loaded?.kinds).toEqual([]);
    expect(loaded?.rng).toEqual(s.rng);
    // A v4 save (cell, no worst word) loads as v8 too.
    const fromV4 = createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v4body, v: 4 }) })).load();
    expect(fromV4?.v).toBe(10);
    expect(fromV4?.cell).toBe(s.cell);
    expect(fromV4?.stats).toEqual(s.stats);
    // Blobs that claim a version whose shape they do not have are not migrated: dropped.
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: 3 }) })).load()).toBeNull(); // v3 with a cell
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: 4 }) })).load()).toBeNull(); // v4 with worst stats
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: 5 }) })).load()).toBeNull(); // v5 with kinds
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: 6 }) })).load()).toBeNull(); // v6 with traits
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...v8body, v: 7 }) })).load()?.v).toBe(10); // v7 between fights: nothing to migrate but the number and the mode
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(v3body) })).load()).toBeNull(); // v7 without a cell
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(v5body) })).load()).toBeNull(); // v7 without kinds
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(v6body) })).load()).toBeNull(); // v7 without traits
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, player: { ...s.player, traits: 'thick-membrane' } }) })).load()).toBeNull();
    // A non-string entry is an unknown id: dropped from the list, the save kept (gate W1's filter runs before the shape check).
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, player: { ...s.player, traits: [7] } }) })).load()?.player.traits).toEqual([]);
    const evolve = { ...s, phase: 'evolve', encounter: null, offer: ['predatory'] };
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(evolve) })).load()).toEqual(evolve);
    // Ids content no longer has are dropped at load (gate W1, PR #64): a held trait or item, an offered one; an
    // evolve offer with nothing known left is a dropped save, as is a pick or evolve with an empty offer.
    const stale = { ...s, player: { ...s.player, items: ['gone-item', 'sharp-pen'], traits: ['gone-trait', 'predatory'] } };
    const cleaned = createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(stale) })).load();
    expect(cleaned?.player.items).toEqual(['sharp-pen']);
    expect(cleaned?.player.traits).toEqual(['predatory']);
    const staleOffer = { ...evolve, offer: ['gone-trait', 'adrenal'] };
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(staleOffer) })).load()?.offer).toEqual(['adrenal']);
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...evolve, offer: ['gone-trait'] }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...evolve, offer: [] }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, phase: 'pick', encounter: null, offer: null }) })).load()).toBeNull();
    const two = CONTENT.items.slice(0, 2).map((i) => i.id);
    const stalePick = { ...s, phase: 'pick', encounter: null, offer: ['gone-item', ...two] };
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(stalePick) })).load()?.offer).toEqual(two);
    // A rest offer is filtered too (gate residual): a stale id would make its button throw; all gone becomes the heal alone.
    const staleRest = { ...s, phase: 'rest', encounter: null, offer: ['gone-item', ...two] };
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(staleRest) })).load()?.offer).toEqual(two);
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...staleRest, offer: ['gone-item'] }) })).load()?.offer).toBeNull();
    expect(dropUnknownIds('x')).toBe('x');
    expect(dropUnknownIds({ v: 7 })).toEqual({ v: 7 });
    expect(migrate({ ...v3body, v: 3 })).toEqual({ ...v3body, v: 10, curses: null, cell: 'balanced', mode: 'normal', kinds: [], event: null, player: { ...oldPlayer, traits: [] }, stats: { ...oldStats, worstWord: '', worstWordDamage: 0 } });
    // The kinds must be known kinds and the event a string or null; an event phase needs its event.
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, kinds: ['fight', 'boss'] }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, kinds: 'fight' }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, event: 7 }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, phase: 'event', encounter: null, event: null }) })).load()).toBeNull();
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, event: 'eddy' }) })).load()).toBeNull(); // an event id off the event screen (gate S4)
    // A rest save and an event save load (gate S5): a phase set without them would delete a mid-run save on reload.
    const rest = { ...s, phase: 'rest', encounter: null, offer: ['sharp-pen'] };
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(rest) })).load()).toEqual(rest);
    const event = { ...s, phase: 'event', encounter: null, offer: null, event: 'eddy' };
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(event) })).load()).toEqual(event);
    const restNoOffer = { ...rest, offer: null };
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(restNoOffer) })).load()).toEqual(restNoOffer);
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

  it('curses (variety wave step 6, v10): key set binds to newRun; a v9 blob migrates with curses null; a cursed pick round-trips; forged and misaligned pairs are dropped', () => {
    const s = newRun(3, ctx);
    // The key set carries curses (bound by the RUN_STATE_KEYS test); newRun writes it null.
    expect(RUN_STATE_KEYS).toContain('curses');
    expect(s.curses).toBeNull();
    // A real v9 blob (no curses field) migrates to v10 with curses null and loads.
    const noCurses = Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'curses'));
    const fromV9 = createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...noCurses, v: 9 }) })).load();
    expect(fromV9?.v).toBe(10);
    expect(fromV9?.curses).toBeNull();
    // A blob claiming v9 yet already carrying curses is not a v9 blob (shape and version must agree): dropped.
    expect(createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...s, v: 9 }) })).load()).toBeNull();

    const boons = CONTENT.items.filter((i) => !i.curse).slice(0, 3).map((i) => i.id);
    const curses = CONTENT.items.filter((i) => i.curse).slice(0, 3).map((i) => i.id);
    const cursedPick: RunState = { ...s, phase: 'pick', encounter: null, offer: boons, curses };
    const rt = createPersist(fakeStorage());
    rt.save(cursedPick);
    expect(rt.load()).toEqual(cursedPick); // a mid-cursed-pick save round-trips

    const load = (blob: object): RunState | null => createPersist(fakeStorage({ [SAVE_KEY]: JSON.stringify(blob) })).load();
    // A forged boon in the curse slot drops that pair (no free boon); the aligned rest survives.
    const forgedCurse = load({ ...cursedPick, curses: [boons[0], curses[1], curses[2]] });
    expect(forgedCurse?.offer).toEqual(boons.slice(1));
    expect(forgedCurse?.curses).toEqual(curses.slice(1));
    // A forged curse in the boon slot drops its pair too.
    const forgedBoon = load({ ...cursedPick, offer: [curses[0], boons[1], boons[2]] });
    expect(forgedBoon?.offer).toEqual(boons.slice(1));
    expect(forgedBoon?.curses).toEqual(curses.slice(1));
    // A short curse list drops the unpaired boon rather than handing it over curse-free.
    const short = load({ ...cursedPick, curses: curses.slice(0, 2) });
    expect(short?.offer).toEqual(boons.slice(0, 2));
    expect(short?.curses).toEqual(curses.slice(0, 2));
    // Curses that are not strings: no slot holds a known curse, every pair drops, the save goes.
    expect(load({ ...cursedPick, curses: [1, 2, 3] })).toBeNull();
    // Every pair forged (all boons in the curse slots): the offer empties and the non-empty-offer rule drops it.
    expect(load({ ...cursedPick, curses: [boons[0], boons[1], boons[2]] })).toBeNull();
    // An unknown boon id drops just its pair, like a stale held item.
    const staleBoon = load({ ...cursedPick, offer: ['gone-item', boons[1], boons[2]] });
    expect(staleBoon?.offer).toEqual(boons.slice(1));
    expect(staleBoon?.curses).toEqual(curses.slice(1));
    // A normal pick keeps curses null and still filters unknown boons.
    const normalStale = load({ ...s, phase: 'pick', encounter: null, offer: ['gone-item', boons[0]], curses: null });
    expect(normalStale?.offer).toEqual([boons[0]]);
    expect(normalStale?.curses).toBeNull();
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
