<script lang="ts">
  import { LETTER_VALUE } from '../engine/scoring';
  import { CONTENT } from '../content/index';

  let { onClose }: { onClose: () => void } = $props();

  const VENOM_MARK = '☣';
  const LOCK_MARK = '\u{1F512}';
  const CRACK_MARK = '⏳';

  // Letter values grouped by value ascending, generated so they never drift from the engine.
  const LETTER_GROUPS = (() => {
    const byValue: Record<number, string[]> = {};
    for (const [letter, value] of Object.entries(LETTER_VALUE)) {
      (byValue[value] ??= []).push(letter.toUpperCase());
    }
    return Object.keys(byValue)
      .map(Number)
      .sort((a, b) => a - b)
      .map((value) => ({ value, letters: (byValue[value] ?? []).join(' ') }));
  })();
  const CURVE = CONTENT.tuning.lengthBonus;
  const CAP = CURVE[CURVE.length - 1] ?? 1;

  // The close button takes focus on open (via a use: action), so the dialog is reachable by
  // keyboard from the start.
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="qr-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="qr-panel" role="dialog" aria-modal="true" aria-label="Quick rules" tabindex="-1">
    <header class="qr-hd">
      <h2>Quick rules</h2>
      <button class="qr-x" aria-label="Close" use:focusOnMount onclick={onClose}>&times;</button>
    </header>
    <div class="qr-body">
      <p class="qr-lead">Every word is an attack. Long words hit hard: no bonus under 6 letters, then it climbs, so a 7-letter word lands about four times a 4-letter one (caps at x{CAP}).</p>

      <h3>Letter points</h3>
      <ul class="qr-vals">
        {#each LETTER_GROUPS as g (g.value)}
          <li><span class="pts">{g.value}</span><span>{g.letters}</span></li>
        {/each}
      </ul>

      <h3>Tiles</h3>
      <ul class="qr-legend">
        <li><span class="tile vowel">A</span><span>Vowel: 1 point, common.</span></li>
        <li><span class="tile rare">Q</span><span>Rare letter, worth the most.</span></li>
        <li><span class="tile venom">G<small>{VENOM_MARK}2</small></span><span>Venom: bites you each turn until you play or shuffle it.</span></li>
        <li><span class="tile locked">B<small>{LOCK_MARK}2</small></span><span>Locked for N turns by a boss; you cannot use it.</span></li>
        <li><span class="tile gold">R<small>+5</small></span><span>Gold: adds that much damage when played.</span></li>
        <li><span class="tile cracked">N<small>{CRACK_MARK}2</small></span><span>Cracked: crumbles in N turns, a fresh letter drops in.</span></li>
        <li><span class="tile selected">S</span><span>Selected; turns green when the letters spell a real word.</span></li>
      </ul>
    </div>
  </div>
</div>

<style>
  .qr-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(18, 8, 38, 0.72);
    display: grid;
    place-items: center;
    padding: var(--s3);
  }
  .qr-panel {
    width: 100%;
    max-width: 360px;
    max-height: 84svh;
    display: flex;
    flex-direction: column;
    background: var(--panel-deep);
    border: 2px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    animation: qr-fade 120ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .qr-panel {
      animation: none;
    }
  }
  @keyframes qr-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .qr-hd {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s3);
    padding: var(--s2) var(--s3);
    border-bottom: 1px solid var(--line);
  }
  .qr-hd h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
  }
  .qr-x {
    flex: none;
    min-width: 32px;
    min-height: 32px;
    display: grid;
    place-items: center;
    padding: 0 var(--s2);
    background: none;
    border: none;
    color: var(--ink);
    font-family: system-ui, sans-serif;
    font-size: var(--head);
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
  }
  .qr-x:focus-visible {
    outline: 2px solid var(--score);
    outline-offset: 2px;
    border-radius: var(--radius);
  }
  .qr-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--s3);
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    font-size: var(--text);
    line-height: 1.4;
  }
  .qr-lead {
    margin: 0;
    color: var(--ink);
  }
  h3 {
    margin: var(--s1) 0 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
    color: var(--muted);
  }
  .qr-vals,
  .qr-legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .qr-vals {
    gap: var(--s1);
  }
  .qr-legend {
    gap: var(--s2);
  }
  .qr-vals li,
  .qr-legend li {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }
  .pts {
    flex: none;
    min-width: 2.2em;
    text-align: center;
    padding: 2px 6px;
    border: 1px solid var(--tile-line);
    border-radius: var(--radius);
    font-family: var(--font-hud);
    color: var(--score);
  }
  .tile {
    position: relative;
    flex: none;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 2px solid var(--tile-line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-tile);
    background: var(--tile);
    color: var(--tile-ink);
    font-family: var(--font-tile);
    font-size: var(--hud-m);
    line-height: 1;
  }
  .tile small {
    position: absolute;
    right: 2px;
    bottom: 2px;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--muted);
  }
  .tile.vowel {
    background: var(--tile-vowel);
    border-color: var(--tile-vowel);
    color: var(--tile-vowel-ink);
  }
  .tile.rare {
    border-color: var(--rare);
    box-shadow: 0 0 8px rgba(255, 79, 163, 0.55), var(--shadow-tile);
  }
  .tile.venom {
    border-color: var(--venom);
    box-shadow: 0 0 8px rgba(125, 255, 90, 0.5), var(--shadow-tile);
  }
  .tile.venom small {
    color: var(--venom);
  }
  .tile.locked {
    background: var(--ground);
    color: var(--tile-locked-ink);
    border-style: dashed;
    box-shadow: none;
  }
  .tile.gold {
    border-color: var(--score);
    color: var(--score);
  }
  .tile.cracked {
    border-style: dashed;
    color: var(--muted);
  }
  .tile.selected {
    background: var(--tile-select);
    border-color: var(--tile-select);
    color: var(--tile-select-ink);
  }
</style>
