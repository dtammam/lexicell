<script lang="ts">
  import type { Action } from '../engine/reducer';
  import type { RunState } from '../engine/types';
  import ItemIcon from './ItemIcon.svelte';
  import { itemDef } from './lookup';
  import { CONTENT } from '../content/index';

  let { run, dispatch }: { run: RunState; dispatch: (action: Action) => void } = $props();

  const offer = $derived(run.offer ?? []);
  const owned = $derived(run.player.items.map((id) => itemDef(id).name));
  // A rest (variety wave step 2): the same three-offer with a heal beside it; one or the other.
  const rest = $derived(run.phase === 'rest');
  // A cursed offer (variety wave step 6): every option drags a curse with it; take one pair or leave it all.
  const curses = $derived(run.curses);
  const cursed = $derived(run.phase === 'pick' && curses !== null);
  const healAmount = $derived(Math.min(run.player.maxHp - run.player.hp, Math.round(run.player.maxHp * CONTENT.tuning.restHeal)));
  const title = $derived(cursed ? 'A cursed offer' : rest ? 'A quiet pool' : run.pendingPicks > 0 ? 'Choose a starting item' : 'Choose an item');
  const hint = $derived(
    cursed
      ? 'Every one comes with a curse. Take an organelle and its curse together, or leave the whole offer. The next fight starts right after.'
      : rest
        ? 'Nothing hunts here. Rest and heal, or take one organelle instead. Either way the next fight starts right after.'
        : run.pendingPicks > 0
          ? 'Tap one. You keep it for the whole run, and your first fight starts right after.'
          : 'Tap one to add it to your cell. The next fight starts right after.',
  );
</script>

<section class="pick">
  <h2>{title}</h2>
  <p class="hint">{hint}</p>
  {#if rest}
    <button class="offer heal" onclick={() => { dispatch({ type: 'restHeal' }); }}>
      <span class="text">
        <span class="name">Rest</span>
        <span class="desc">Heal {healAmount} HP ({run.player.hp} to {run.player.hp + healAmount} of {run.player.maxHp}). No organelle.</span>
      </span>
    </button>
  {/if}
  {#each offer as id, i (id)}
    {@const item = itemDef(id)}
    {@const curseId = cursed && curses ? curses[i] : undefined}
    {@const curse = curseId ? itemDef(curseId) : null}
    <button class="offer" class:cursed onclick={() => { dispatch({ type: 'pickItem', index: i }); }}>
      <ItemIcon {id} size={40} />
      <span class="text">
        <span class="name">{item.name} <small class={item.rarity}>{item.rarity}</small></span>
        <span class="desc">{item.description}</span>
        <span class="flavor">{item.flavor}</span>
        {#if curse}
          <span class="curse">
            <span class="curse-label">Curse</span>
            <span class="curse-name">{curse.name}</span>
            <span class="curse-desc">{curse.description}</span>
          </span>
        {/if}
      </span>
    </button>
  {/each}
  {#if cursed}
    <button class="offer leave" onclick={() => { dispatch({ type: 'skipOffer' }); }}>
      <span class="text">
        <span class="name">Leave it</span>
        <span class="desc">Take nothing and no curse. Move straight to the next fight.</span>
      </span>
    </button>
  {/if}
  {#if owned.length > 0}
    <p class="owned">You carry: {owned.join(', ')}</p>
  {/if}
</section>

<style>
  .pick {
    display: flex;
    flex-direction: column;
    gap: var(--s3);
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
  }
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: var(--text);
  }
  .offer {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--s3);
    text-align: left;
    padding: var(--s3);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font-ui);
    touch-action: manipulation;
    transition: transform var(--dur-state) var(--ease-step), box-shadow var(--dur-state) var(--ease-step);
  }
  .offer.heal {
    border-color: var(--life);
  }
  .offer.cursed {
    border-color: var(--harm);
  }
  .offer.leave {
    border-style: dashed;
  }
  .curse {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    margin-top: var(--s2);
    padding-top: var(--s2);
    border-top: 1px dashed var(--harm);
  }
  .curse-label {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--harm);
  }
  .curse-name {
    font-family: var(--font-head);
    font-size: var(--name);
    color: var(--harm);
  }
  .curse-desc {
    color: var(--harm);
    font-size: var(--text);
    line-height: 1.35;
  }
  .offer:active {
    transform: translate(3px, 3px);
    box-shadow: var(--shadow-press);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    min-width: 0;
  }
  .name {
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
    display: flex;
    gap: var(--s2);
    align-items: baseline;
  }
  .flavor {
    color: var(--score);
    font-size: var(--text);
  }
  .desc {
    color: var(--muted);
    font-size: var(--text);
    line-height: 1.35;
  }
  small {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--muted);
  }
  small.uncommon {
    color: var(--life);
  }
  small.rare {
    color: var(--rare);
  }
  small.mythic {
    color: var(--mythic);
    text-shadow: 0 0 6px var(--mythic);
  }
  .owned {
    color: var(--muted);
    font-size: var(--text);
  }
</style>
