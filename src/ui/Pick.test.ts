// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { newRun } from '../engine/reducer';
import type { Action } from '../engine/reducer';
import type { RunState } from '../engine/types';
import Pick from './Pick.svelte';

const ctx = nodeContext();

const mounted: { instance: Record<string, unknown>; target: HTMLElement }[] = [];
function renderPick(run: RunState): { target: HTMLElement; actions: Action[] } {
  const actions: Action[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(Pick, { target, props: { run, dispatch: (a: Action) => actions.push(a) } });
  mounted.push({ instance, target });
  flushSync();
  return { target, actions };
}
afterEach(() => {
  for (const m of mounted.splice(0)) {
    void unmount(m.instance);
    m.target.remove();
  }
});

/** A cursed pick: a normal offer with an aligned curse per slot. */
function cursedRun(): RunState {
  const base = newRun(1, ctx);
  return { ...base, phase: 'pick', encounter: null, offer: ['lens', 'thick-skin', 'spores'], curses: ['curse-frail', 'curse-dull', 'curse-bleed'], pendingPicks: 0 };
}

describe('Pick (cursed offers, variety wave step 6)', () => {
  it('a normal offer shows no curse and no Leave it button', () => {
    const base = newRun(1, ctx);
    const run: RunState = { ...base, phase: 'pick', encounter: null, offer: ['lens', 'thick-skin', 'spores'], curses: null, pendingPicks: 0 };
    const { target } = renderPick(run);
    expect(target.querySelector('.curse')).toBeNull();
    expect(target.querySelector('.offer.leave')).toBeNull();
    expect(target.textContent).not.toContain('cursed');
  });

  it('a cursed offer names each attached curse and offers a Leave it button', () => {
    const { target, actions } = renderPick(cursedRun());
    expect(target.textContent).toContain('A defective offer');
    // Each option shows its curse name and description.
    const curses = target.querySelectorAll('.offer .curse');
    expect(curses).toHaveLength(3);
    expect(target.textContent).toContain('Atrophy'); // curse-frail
    expect(target.textContent).toContain('Blunting'); // curse-dull
    // The Leave it button dispatches skipOffer.
    const leave = target.querySelector<HTMLButtonElement>('.offer.leave');
    expect(leave).not.toBeNull();
    leave?.click();
    flushSync();
    expect(actions).toEqual([{ type: 'skipOffer' }]);
  });

  it('taking a cursed option dispatches pickItem with its index', () => {
    const { target, actions } = renderPick(cursedRun());
    const options = target.querySelectorAll<HTMLButtonElement>('.offer:not(.leave)');
    options[1]?.click();
    flushSync();
    expect(actions).toEqual([{ type: 'pickItem', index: 1 }]);
  });
});
