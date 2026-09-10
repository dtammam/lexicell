import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { CONTENT } from '../content/index';
import { newRun } from '../engine/reducer';
import { appendRun, clearHistory, entryFrom, exportCsv, exportJson, HISTORY_CAP, HISTORY_KEY, loadHistory, markRunStarted, runStartedAt, type HistoryEntry } from './history';
import type { StorageLike } from './persist';

function fake(initial: Record<string, string> = {}, refuse = false): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (refuse) throw new Error('blocked');
  };
  return {
    data,
    getItem: (k) => {
      guard();
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      guard();
      data.set(k, v);
    },
    removeItem: (k) => {
      guard();
      data.delete(k);
    },
  };
}

const ctx = nodeContext({ ...CONTENT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });

function entry(seed: number, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return { ...entryFrom(newRun(seed, ctx), 'lost', '2026-09-08T20:00:00.000Z', '2026-09-08T19:50:00.000Z', '118 · abc1234', false), ...over };
}

describe('run history', () => {
  it('starts empty, appends newest last, and survives a round trip', () => {
    const s = fake();
    expect(loadHistory(s)).toEqual([]);
    appendRun(s, entry(1));
    appendRun(s, entry(2, { outcome: 'won', encounterReached: 9 }));
    const runs = loadHistory(s);
    expect(runs.map((r) => r.seed)).toEqual([1, 2]);
    expect(runs[1]?.outcome).toBe('won');
    expect([...s.data.keys()]).toEqual([HISTORY_KEY]);
  });

  it('drops the oldest past the cap', () => {
    const s = fake();
    for (let i = 0; i < HISTORY_CAP + 5; i++) appendRun(s, entry(i));
    const runs = loadHistory(s);
    expect(runs).toHaveLength(HISTORY_CAP);
    expect(runs[0]?.seed).toBe(5);
    expect(runs[runs.length - 1]?.seed).toBe(HISTORY_CAP + 4);
  });

  it('reads corrupt, wrong-version and wrong-shape blobs as empty, filters bad entries, and never throws when storage refuses', () => {
    expect(loadHistory(fake({ [HISTORY_KEY]: '{nope' }))).toEqual([]);
    expect(loadHistory(fake({ [HISTORY_KEY]: JSON.stringify({ v: 99, runs: [entry(1)] }) }))).toEqual([]);
    expect(loadHistory(fake({ [HISTORY_KEY]: JSON.stringify({ v: 1, runs: 'x' }) }))).toEqual([]);
    const mixed = fake({ [HISTORY_KEY]: JSON.stringify({ v: 1, runs: [entry(1), { seed: 'no' }, null, { ...entry(2), outcome: 'meh' }] }) });
    expect(loadHistory(mixed).map((r) => r.seed)).toEqual([1]);
    // Every field is checked on its own (gate W3): break one at a time and the entry is dropped.
    const good = entry(3);
    const broken: Record<string, unknown>[] = [
      { ...good, seed: '3' },
      { ...good, startedAt: 7 },
      { ...good, endedAt: null },
      { ...good, encounterReached: 'nine' },
      { ...good, turns: null },
      { ...good, damageDealt: 'lots' },
      { ...good, damageTaken: undefined },
      { ...good, bestWord: 9 },
      { ...good, bestWordDamage: '9' },
      { ...good, items: 'lens' },
      { ...good, items: ['lens', 4] },
      { ...good, build: 118 },
      { ...good, cell: 7 },
    ];
    for (const b of broken) {
      const s = fake({ [HISTORY_KEY]: JSON.stringify({ v: 1, runs: [b] }) });
      expect(loadHistory(s), JSON.stringify(b)).toEqual([]);
    }
    expect(loadHistory(fake({ [HISTORY_KEY]: JSON.stringify({ v: 1, runs: [good] }) }))).toEqual([good]);
    const refusing = fake({}, true);
    expect(loadHistory(refusing)).toEqual([]);
    expect(() => appendRun(refusing, entry(1))).not.toThrow();
    expect(() => {
      clearHistory(refusing);
    }).not.toThrow();
  });

  it('a corrupt blob is replaced by the next append', () => {
    const s = fake({ [HISTORY_KEY]: 'garbage' });
    appendRun(s, entry(7));
    expect(loadHistory(s).map((r) => r.seed)).toEqual([7]);
  });

  it('entryFrom reads the run without touching it, capping the encounter at 9', () => {
    const run = newRun(3, ctx);
    const e = entryFrom(run, 'abandoned', '2026-09-08T20:00:00.000Z', null, 'b', false);
    expect(e).toMatchObject({ seed: run.rng.seed, outcome: 'abandoned', encounterReached: 1, turns: 0, items: [], startedAt: null, build: 'b' });
    expect(entryFrom({ ...run, encounterIndex: 8 }, 'won', 'x', null, 'b', false).encounterReached).toBe(9);
    expect(entryFrom({ ...run, encounterIndex: 40 }, 'won', 'x', null, 'b', false).encounterReached).toBe(9);
  });

  it('remembers when a run started, per seed', () => {
    const s = fake();
    markRunStarted(s, 5, '2026-09-08T19:00:00.000Z');
    expect(runStartedAt(s, 5)).toBe('2026-09-08T19:00:00.000Z');
    expect(runStartedAt(s, 6)).toBeNull();
    expect(runStartedAt(fake({}, true), 5)).toBeNull();
  });

  it('JSON export re-parses to the same entries; CSV has a header, one row per run, and escapes quotes, commas and semicolons', () => {
    const runs = [entry(1), entry(2, { bestWord: 'a"b,c', items: ['x;y', 'z'], outcome: 'won', build: 'line one\nline two' })];
    const back = JSON.parse(exportJson(runs)) as { v: number; runs: HistoryEntry[] };
    expect(back.v).toBe(2);
    expect(back.runs).toEqual(runs);
    const csv = exportCsv(runs);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('seed,startedAt,endedAt,outcome,encounterReached,turns,damageDealt,damageTaken,bestWord,bestWordDamage,items,build,cell,mode,daily');
    expect(lines[1]).toMatch(/,balanced,normal,false$/);
    expect(lines[2]).toContain('"a""b,c"');
    expect(lines[2]).toContain('"x;y;z"');
    expect(csv).toContain('"line one\nline two"');
    expect(lines).toHaveLength(3); // the embedded newline is quoted, not a row break: 3 lines only because split is on CRLF
    expect(lines[2]).toContain(',won,');
    expect(lines[1]).toContain(`,${runs[0]?.build}`);
  });

  it('an endless run records how deep it got, uncapped, and its mode (step 5)', () => {
    const s = newRun(3, ctx, 'balanced', 'endless');
    const deep = { ...s, phase: 'summary' as const, outcome: 'lost' as const, encounter: null, encounterIndex: 13 };
    const e = entryFrom(deep, 'lost', '2026-09-09T00:00:00.000Z', null, '1 · x', false);
    expect(e.encounterReached).toBe(14);
    expect(e.mode).toBe('endless');
    const normal = { ...newRun(3, ctx), phase: 'summary' as const, outcome: 'won' as const, encounter: null, encounterIndex: 8 };
    expect(entryFrom(normal, 'won', '2026-09-09T00:00:00.000Z', null, '1 · x', false).encounterReached).toBe(9);
    expect(exportCsv([e]).split('\n')[0]?.trimEnd().endsWith(',cell,mode,daily')).toBe(true);
  });

  it('entryFrom stamps the daily flag it is given (step 8)', () => {
    const run = newRun(3, ctx);
    expect(entryFrom(run, 'won', 'x', null, 'b', true).daily).toBe(true);
    expect(entryFrom(run, 'won', 'x', null, 'b', false).daily).toBe(false);
  });

  it('migrates a real v1 history blob to v2 with daily:false, and reads a v2 blob as-is (step 8)', () => {
    // A genuine v1 entry has no `daily` field: strip it to model what was on disk before the bump.
    const withoutDaily: Record<string, unknown> = { ...entry(11) };
    delete withoutDaily.daily;
    expect('daily' in withoutDaily).toBe(false);
    const v1 = fake({ [HISTORY_KEY]: JSON.stringify({ v: 1, runs: [withoutDaily] }) });
    const migrated = loadHistory(v1);
    expect(migrated).toHaveLength(1);
    expect(migrated[0]?.daily).toBe(false);
    expect(migrated[0]?.seed).toBe(11);
    // A v2 blob (the current version) is read unchanged, daily flag preserved.
    const dailyEntry = entry(12, { daily: true });
    const v2 = fake({ [HISTORY_KEY]: JSON.stringify({ v: 2, runs: [dailyEntry] }) });
    expect(loadHistory(v2)).toEqual([dailyEntry]);
    // A v1 entry that was itself missing more than the daily flag is still dropped by the validator.
    const brokenV1 = fake({ [HISTORY_KEY]: JSON.stringify({ v: 1, runs: [{ ...withoutDaily, seed: 'no' }] }) });
    expect(loadHistory(brokenV1)).toEqual([]);
    // In a v2 blob (no migration to backfill it), a non-boolean or missing daily is invalid and dropped.
    expect(loadHistory(fake({ [HISTORY_KEY]: JSON.stringify({ v: 2, runs: [{ ...entry(13), daily: 'yes' }] }) }))).toEqual([]);
    expect(loadHistory(fake({ [HISTORY_KEY]: JSON.stringify({ v: 2, runs: [withoutDaily] }) }))).toEqual([]);
  });
});
