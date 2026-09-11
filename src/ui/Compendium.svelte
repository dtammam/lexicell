<script lang="ts">
  import { CONTENT } from '../content/index';
  import type { Condition } from '../engine/effects';
  import { hitRange } from '../engine/reducer';
  import type { EnemyDef, ItemDef, Rarity } from '../engine/types';
  import ItemIcon from './ItemIcon.svelte';

  // One place to study everything in the game (Dean, 2026-09-11): five browsable sections, one on
  // screen at a time so the whole page fits a phone. All content is read from src/content; no lists
  // are hardcoded here.
  let { onBack }: { onBack: () => void } = $props();

  const base = import.meta.env.BASE_URL;

  type Section = 'mutations' | 'defects' | 'bestiary' | 'traits' | 'capabilities';
  const TABS: readonly { id: Section; label: string }[] = [
    { id: 'mutations', label: 'Mutations' },
    { id: 'defects', label: 'Defects' },
    { id: 'bestiary', label: 'Bestiary' },
    { id: 'traits', label: 'Traits' },
    { id: 'capabilities', label: 'Capabilities' },
  ];
  let active: Section = $state.raw('mutations');

  // Mutations: draftable items by rarity. Defects: the curse-flagged items (never drafted as boons).
  const ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'mythic'];
  const draftable = CONTENT.items.filter((i) => !i.curse);
  const curses = CONTENT.items.filter((i) => i.curse);
  const groups: readonly { rarity: Rarity; items: readonly ItemDef[] }[] = ORDER.map((rarity) => ({
    rarity,
    items: draftable.filter((i) => i.rarity === rarity),
  }));

  // Bestiary: every creature grouped by act, its boss last. Enemies and bosses both carry `act`.
  const ACTS: readonly { act: 1 | 2 | 3; name: string }[] = [
    { act: 1, name: 'the pond' },
    { act: 2, name: 'the reef' },
    { act: 3, name: 'the deep' },
  ];
  const bossIds = new Set(CONTENT.bosses.map((b) => b.id));
  const bestiary: readonly { act: 1 | 2 | 3; name: string; creatures: readonly EnemyDef[] }[] = ACTS.map(
    ({ act, name }) => ({
      act,
      name,
      creatures: [
        ...CONTENT.enemies.filter((e) => e.act === act),
        ...CONTENT.bosses.filter((b) => b.act === act),
      ],
    }),
  );

  /**
   * The stats line, built whole (a leading space in template markup is trimmed by Svelte, which ran
   * "13every" together): the rolled range when the enemy has variance, else the flat hit, and the
   * attack cadence when it is not every turn. Base numbers, before the act curve scales them.
   */
  function statsLabel(e: EnemyDef): string {
    const [lo, hi] = hitRange(e.damage, e.variance);
    const hits = hi > lo ? `${lo}-${hi}` : `${lo}`;
    const cadence = e.attackEvery > 1 ? ` every ${e.attackEvery} turns` : '';
    return `HP ${e.hp} · Hits ${hits}${cadence}`;
  }

  /** A resist demand in plain words (the compact HUD label lives in reducer.ts; this one is a full sentence). */
  function resistWords(when: Condition): string {
    switch (when.kind) {
      case 'minLength':
        return `resists words under ${when.value} letters`;
      case 'maxLength':
        return `resists words over ${when.value} letters`;
      case 'containsLetter':
        return `resists words without ${when.letters.toUpperCase()}`;
      case 'startsWith':
        return `resists words not starting with ${when.letters.toUpperCase()}`;
      case 'endsWith':
        return `resists words not ending in ${when.letters.toUpperCase()}`;
      case 'uniqueLetters':
        return 'resists words with a repeated letter';
      case 'repeatLetter':
        return 'resists words with no repeated letter';
      case 'minVowels':
        return `resists words under ${when.value} vowels`;
      default:
        return 'resists some words';
    }
  }

  /** Every trait and special an enemy carries, each as a plain-words tag. */
  function creatureTraits(e: EnemyDef): readonly string[] {
    const out: string[] = [];
    const t = e.traits;
    if (t?.armour) out.push(`armour: words under ${t.armour} letters deal half`);
    if (t?.regen) out.push(`regen: heals ${t.regen} each turn`);
    if (t?.hunger) out.push(`hunger: +${t.hunger} damage each turn`);
    if (t?.resist) out.push(resistWords(t.resist.when));
    const s = e.special?.effects[0];
    if (s?.type === 'venomTiles') out.push(`venom: poisons ${s.count} tile${s.count > 1 ? 's' : ''}`);
    else if (s?.type === 'lockTiles') out.push(`locks ${s.count} tiles`);
    else if (s?.type === 'crackTiles') out.push(`cracks ${s.count} tiles`);
    else if (s?.type === 'scramble') out.push('scrambles the grid');
    return out;
  }

  function fallback(ev: Event) {
    const img = ev.currentTarget as HTMLImageElement;
    if (!img.src.endsWith('sprites/unknown.png')) img.src = `${base}sprites/unknown.png`;
  }
</script>

<section class="compendium">
  <header>
    <h2>Compendium</h2>
    <button class="btn" onclick={onBack}>Back</button>
  </header>

  <div class="tabs" role="tablist">
    {#each TABS as tab (tab.id)}
      <button class="tab" class:active={active === tab.id} role="tab" aria-selected={active === tab.id} onclick={() => { active = tab.id; }}>{tab.label}</button>
    {/each}
  </div>

  <div class="list">
    {#if active === 'mutations'}
      <p class="hint">{draftable.length} to find. Offers draw three you do not carry, weighted common 3, uncommon 2, rare 1, mythic 0.35, and never more than two commons at once.</p>
      {#each groups as group (group.rarity)}
        <h3 class={group.rarity}>{group.rarity} ({group.items.length})</h3>
        {#each group.items as item (item.id)}
          <div class="entry">
            <ItemIcon id={item.id} size={32} />
            <span class="text">
              <span class="name">{item.name}</span>
              <span class="desc">{item.description}</span>
              <span class="flavor">{item.flavor}</span>
            </span>
          </div>
        {/each}
      {/each}
    {:else if active === 'defects'}
      <p class="hint">After act 1, an offer may come with defects: every option drags a downside along, so you take the good with the bad or leave the whole offer.</p>
      <h3 class="curse">defects ({curses.length})</h3>
      {#each curses as item (item.id)}
        <div class="entry">
          <ItemIcon id={item.id} size={32} />
          <span class="text">
            <span class="name">{item.name}</span>
            <span class="desc">{item.description}</span>
            <span class="flavor">{item.flavor}</span>
          </span>
        </div>
      {/each}
    {:else if active === 'bestiary'}
      <p class="hint">Every creature you meet, base stats before the act curve scales them. One boss ends each act.</p>
      {#each bestiary as group (group.act)}
        <h3>Act {group.act} - {group.name} ({group.creatures.length})</h3>
        {#each group.creatures as e (e.id)}
          <div class="entry creature" class:boss={bossIds.has(e.id)}>
            <img class="sprite" src="{base}sprites/{e.id}.png" alt="" width="40" height="40" onerror={fallback} />
            <span class="text">
              <span class="name"><span class="cname">{e.name}</span>{#if bossIds.has(e.id)}<span class="boss-tag">Boss</span>{/if}</span>
              <span class="stats">{statsLabel(e)}</span>
              {#each creatureTraits(e) as t (t)}<span class="trait">{t}</span>{/each}
            </span>
          </div>
        {/each}
      {/each}
    {:else if active === 'traits'}
      <p class="hint">After each boss but the last, you evolve: three of these are offered and one is kept for the run.</p>
      {#each CONTENT.traits as t (t.id)}
        <div class="entry">
          <span class="text">
            <span class="name">{t.name}</span>
            <span class="desc">{t.description}</span>
            <span class="flavor">{t.flavor}</span>
          </span>
        </div>
      {/each}
    {:else}
      <p class="hint">A capability is a new way to play, gained alongside a trait as your cell descends. One is kept per boss.</p>
      {#each CONTENT.capabilities as c (c.id)}
        <div class="entry">
          <span class="text">
            <span class="name">{c.name}</span>
            <span class="desc">{c.description}</span>
            <span class="flavor">{c.flavor}</span>
          </span>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .compendium {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    /* Bound the screen's height (App gives the child min-height:100%): with a fixed height the header
       and tab row stay put and the .list below becomes the one scroll container, so a long section
       never scrolls the page. */
    height: 100%;
    min-height: 0;
  }
  header {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--head);
  }
  /* The section switcher: five tabs that scroll sideways if they overrun a narrow phone, so the
     tab row itself never grows the page. */
  .tabs {
    flex: none;
    display: flex;
    gap: var(--s1);
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: var(--s1);
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }
  .tab {
    flex: none;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    letter-spacing: 0.05em;
    color: var(--muted);
    background: var(--panel);
    border: 2px solid var(--shade);
    box-shadow: var(--shadow-press);
    border-radius: var(--radius);
    padding: var(--s2);
    touch-action: manipulation;
  }
  .tab.active {
    background: var(--select);
    color: var(--ground);
  }
  .hint {
    margin: 0 0 var(--s1);
    color: var(--muted);
    font-size: var(--text);
  }
  /* The one screen allowed to scroll: it is a list, not the game. */
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding-right: var(--s1);
  }
  h3 {
    margin: var(--s2) 0 0;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h3.uncommon {
    color: var(--life);
  }
  h3.rare {
    color: var(--rare);
  }
  h3.mythic {
    color: var(--mythic);
    text-shadow: 0 0 6px var(--mythic);
  }
  h3.curse {
    color: var(--harm);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s2) var(--s3);
    background: var(--panel);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .creature.boss {
    border-color: var(--harm);
  }
  .sprite {
    flex: none;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    filter: drop-shadow(2px 2px 0 var(--shade));
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    min-width: 0;
  }
  .name {
    display: flex;
    align-items: center;
    gap: var(--s2);
    font-family: var(--font-head);
    font-size: var(--name);
  }
  .boss-tag {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--harm);
  }
  .stats {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--ink);
  }
  .trait {
    color: var(--muted);
    font-size: var(--text);
    line-height: 1.35;
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
</style>
