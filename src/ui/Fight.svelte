<script lang="ts">
  import { candidateWords, type Candidate } from '../engine/candidates';
  import { scoreSelection, selectedWord, type Action, type EngineContext } from '../engine/reducer';
  import { LETTER_VALUE } from '../engine/scoring';
  import type { RunState } from '../engine/types';
  import Arena from './Arena.svelte';
  import Definition from './Definition.svelte';
  import ItemsPanel from './ItemsPanel.svelte';

  let {
    run,
    prev = null,
    dispatch,
    isWord,
    ctx,
  }: { run: RunState; prev?: RunState | null; dispatch: (action: Action) => void; isWord: (word: string) => boolean; ctx: EngineContext } = $props();

  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
  /**
   * Colour carries what the corner number used to (Dean, 2026-09-08: tiles must read at a
   * glance): vowels warm, rare ones (K J X Q Z) magenta with a glow, everything else plain. A
   * third tier (teal edge for 3-4 point consonants) was dropped on 2026-09-08 when a tester could
   * not decode three signals. Selection colours override all of it.
   */
  function tier(letter: string): 'vowel' | 'common' | 'rare' {
    if (VOWELS.has(letter)) return 'vowel';
    return (LETTER_VALUE[letter] ?? 1) >= 5 ? 'rare' : 'common';
  }

  const enc = $derived(run.encounter);
  const word = $derived(selectedWord(run));
  // The same dictionary the reducer validates against, so green always means Attack will land.
  const valid = $derived(word.length >= 3 && isWord(word));
  const canAttack = $derived(word.length >= 3);

  /**
   * The word you missed (Dean, 2026-09-08): after a word is played, the best word that was on
   * that grid. Captured once per turn from `prev`, the state before the action, at the moment
   * the turn changes; later taps move `prev` but not this.
   *
   * Only words that are GONE are revealed (Dean, 2026-09-08: a word that survived the refill is a
   * free hint, not a lesson). A word still spellable on the new grid is skipped; the best of the
   * rest is shown, and the play is praised when it beat every word that is now gone.
   */
  let missed = $state.raw<Candidate | null>(null);
  let missedTurn = -1;
  $effect(() => {
    const t = run.stats.turns;
    const p = prev;
    if (t === missedTurn) return;
    missedTurn = t;
    if (!p?.encounter || !run.lastTurn || run.lastTurn.word === '') {
      missed = null;
      return;
    }
    const stillHere = new Set(candidateWords(run, ctx).map((c) => c.word));
    let best: Candidate | null = null;
    for (const c of candidateWords(p, ctx)) if (!stillHere.has(c.word) && (!best || c.damage > best.damage)) best = c;
    missed = best;
  });
  const beatable = $derived(missed !== null && run.lastTurn !== null && run.lastTurn.word !== '' && missed.damage > run.lastTurn.damage && missed.word !== run.lastTurn.word);
  const wasBest = $derived(missed !== null && run.lastTurn !== null && run.lastTurn.word !== '' && !beatable);

  /** Damage the selected word would deal, shown before Attack (Dean, 2026-09-08: make me want to hunt). */
  // The exact hit for this selection (step 4: gold rides on the tiles chosen, not on the word), from the engine's own path.
  const preview = $derived(valid ? scoreSelection(run, ctx) : null);

  // Shuffle costs the turn (Dean, 2026-09-08). The first tap arms it, the second fires;
  // the arm drops on any other action so a stray tap never spends a turn.
  let armedAt: string | null = $state.raw(null);
  const armKey = $derived(`${run.stats.turns}:${enc?.selection.length ?? 0}:${run.rejected ?? ''}`);
  const shuffleArmed = $derived(armedAt === armKey);
  // Once the key moves (a tap, a clear, a turn), the arm is dropped for good rather than
  // coming back if the selection returns to the same length.
  $effect(() => {
    if (armedAt !== null && armedAt !== armKey) armedAt = null;
  });
  // A free shuffle (effects wave) costs nothing, so it needs no arming.
  const freeShuffles = $derived(run.player.freeShuffles ?? 0);
  function onShuffle() {
    if (freeShuffles > 0) {
      armedAt = null;
      dispatch({ type: 'shuffle' });
      return;
    }
    if (!shuffleArmed) {
      armedAt = armKey;
      return;
    }
    armedAt = null;
    dispatch({ type: 'shuffle' });
  }

  // Gravity animation. lastTurn.used names the tiles consumed before the column settled; from
  // it each tile's start offset in rows is derived: survivors slide down from where they were,
  // fresh tiles rise in from below the grid. Older saves lack `used`; then nothing animates.
  const used = $derived(new Set(run.lastTurn?.used ?? []));
  /** Tiles redrawn in place mid-turn (redrawTiles): they blink in where they stand. */
  const redrawn = $derived(new Set(run.lastTurn?.redrawn ?? []));
  function entry(index: number): { dy: number; fresh: boolean } | null {
    if (used.size === 0) return null;
    const col = index % 4;
    const row = Math.floor(index / 4);
    const survivorRows = [0, 1, 2, 3].filter((r) => !used.has(r * 4 + col));
    if (row < survivorRows.length) {
      const from = survivorRows[row] ?? row;
      return from === row ? null : { dy: from - row, fresh: false };
    }
    return { dy: 4 - row, fresh: true };
  }

  /** A few tiles per turn shiver, as if biologically unstable (Dean, 2026-09-08). Which ones moves with the turn. */
  function shivers(index: number): boolean {
    return (index * 7 + run.stats.turns * 5) % 6 === 0;
  }

  function orderOf(index: number): number {
    return (enc?.selection.indexOf(index) ?? -1) + 1;
  }

  /**
   * Keyboard play (Dean, 2026-09-08, for desktop players): a letter key selects an unselected,
   * unlocked tile carrying that letter, a venomed one first since it wants spending; Backspace
   * drops the last tile; Enter attacks when the button would; Escape clears. Modifier chords and
   * typing into a control are left alone. Touch devices never send these, so nothing changes there.
   */
  function onKey(e: KeyboardEvent) {
    if (!enc || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const key = e.key;
    if (key === 'Escape') {
      if (enc.selection.length > 0) dispatch({ type: 'clearSelection' });
      armedAt = null;
      e.preventDefault();
      return;
    }
    if (key === 'Backspace') {
      const last = enc.selection[enc.selection.length - 1];
      if (last !== undefined) dispatch({ type: 'toggleTile', index: last });
      e.preventDefault();
      return;
    }
    if (key === 'Enter') {
      if (canAttack) dispatch({ type: 'submitWord' });
      e.preventDefault();
      return;
    }
    if (key.length !== 1 || !/[a-z]/i.test(key)) return;
    const letter = key.toLowerCase();
    const selected = new Set(enc.selection);
    let pick = -1;
    for (let i = 0; i < enc.grid.length; i++) {
      const tile = enc.grid[i];
      if (!tile || tile.letter !== letter || tile.lockedTurns > 0 || selected.has(i)) continue;
      if (pick < 0 || (tile.venom > 0 && (enc.grid[pick]?.venom ?? 0) === 0)) pick = i;
    }
    if (pick >= 0) {
      dispatch({ type: 'toggleTile', index: pick });
      e.preventDefault();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if enc}
  <section class="fight">
    <div class="side">
    <Arena {run} {ctx} {word} />

    <div class="report">
      {#key run.stats.turns}
        {#if run.lastTurn && (run.lastTurn.word !== '' || run.lastTurn.scrambled || run.lastTurn.damage > 0 || run.lastTurn.enemyDamage > 0)}
          <!-- Empty word + scrambled is a shuffle; empty word alone is the turn-start report (item damage before a word). -->
          {#if run.lastTurn.word !== ''}
            <span class="hit">{run.lastTurn.word.toUpperCase()} {run.lastTurn.damage}</span>
            {#if run.lastTurn.scrambled}<span class="note">grid scrambled</span>{/if}
          {:else if run.lastTurn.scrambled}
            <span class="hit">Shuffled the grid</span>
            {#if run.lastTurn.damage > 0}<span class="note">turn start: {run.lastTurn.damage} damage</span>{/if}
          {:else}
            <span class="hit">Turn start: {run.lastTurn.damage} damage</span>
          {/if}
          {#if run.lastTurn.poison > 0}<span class="hit">poison ate {run.lastTurn.poison}</span>{/if}
          {#if run.lastTurn.stunned}<span class="note">it was stunned and missed</span>{/if}
          {#if run.lastTurn.shielded > 0}<span class="shielded">shield took {run.lastTurn.shielded}</span>{/if}
          {#if run.lastTurn.enemyDamage > 0}<span class="taken">you took {run.lastTurn.enemyDamage}</span>{/if}
          {#if run.lastTurn.venom > 0}<span class="taken">venom bit for {run.lastTurn.venom}</span>{/if}
          {#if run.lastTurn.healed > 0}<span class="healed">healed {run.lastTurn.healed}</span>{/if}
          {#if run.lastTurn.redrawn.length > 0}<span class="note">{run.lastTurn.redrawn.length} tiles redrawn</span>{/if}
          {#if run.lastTurn.gold > 0}<span class="hit">gold +{run.lastTurn.gold}</span>{/if}
          {#if run.lastTurn.crumbled > 0}<span class="note">{run.lastTurn.crumbled} {run.lastTurn.crumbled === 1 ? 'tile' : 'tiles'} crumbled</span>{/if}
        {:else}
          <span class="note">Spell a word of 3+ letters</span>
          {#if run.encounterIndex === 0 && enc.turn <= 2}<span class="note">Tiles need not touch. Yellow: vowel. Pink edge: rare. More under Menu, How to play.</span>{/if}
        {/if}
      {/key}
      {#if run.rejected}<span class="rejected">{run.rejected}</span>{/if}
    </div>
    {#if run.lastTurn && run.lastTurn.word !== ''}
      <!-- One line for the definition and the missed word (Dean's iPhone, 2026-09-09: four report lines
           squeezed the grid); each side truncates with an ellipsis rather than wrapping. -->
      <div class="after">
        <Definition word={run.lastTurn.word} />
        {#if beatable && missed}
          <p class="missed">Best: <strong>{missed.word.toUpperCase()}</strong> {missed.damage}</p>
        {:else if wasBest}
          <p class="missed best">Best word there.</p>
        {/if}
      </div>
    {/if}

    <div class="word" class:valid>
      <span class="word-text">{word.toUpperCase() || ' '}</span>{#if preview !== null}<span class="preview">{preview}</span>{/if}
    </div>

    </div>
    <div class="board">
    <div class="grid-box">
    <div class="grid">
      {#key run.stats.turns}
      {#each enc.grid as tile, i (i)}
        {@const order = orderOf(i)}
        {@const move = entry(i)}
        <button
          class="tile"
          class:moved={move !== null}
          class:fresh={move?.fresh ?? false}
          class:redrawn={redrawn.has(i)}
          style={move ? `--dy: ${move.dy}; --i: ${i}` : `--i: ${i}`}
          class:selected={order > 0}
          class:valid={order > 0 && valid}
          data-tier={tier(tile.letter)}
          class:locked={tile.lockedTurns > 0}
          class:venomous={tile.venom > 0}
          class:gold={tile.gold > 0}
          class:cracked={tile.cracked > 0}
          class:shiver={shivers(i)}
          disabled={tile.lockedTurns > 0}
          onclick={() => { dispatch({ type: 'toggleTile', index: i }); }}
        >
          <span class="letter">{tile.letter.toUpperCase()}</span>
          {#if tile.lockedTurns > 0}<span class="value">{`\u{1F512}${tile.lockedTurns}`}</span>{:else if tile.venom > 0}<span class="value venom">{`\u2623${tile.venom}`}</span>{:else if tile.gold > 0}<span class="value gold">{`+${tile.gold}`}</span>{:else if tile.cracked > 0}<span class="value crack">{`\u23F3${tile.cracked}`}</span>{/if}
          {#if order > 0}<span class="order">{order}</span>{/if}
        </button>
      {/each}
      {/key}
    </div>
    </div>

    <div class="actions">
      <button class="btn" disabled={enc.selection.length === 0} onclick={() => { dispatch({ type: 'clearSelection' }); }}>Clear</button>
      <button class="btn shuffle" class:armed={shuffleArmed} class:life={freeShuffles > 0} onclick={onShuffle}>{freeShuffles > 0 ? `Free x${freeShuffles}` : shuffleArmed ? 'Costs a turn' : 'Shuffle'}</button>
      <button class="btn primary harm" class:ready={valid} class:life={valid} disabled={!canAttack} onclick={() => { dispatch({ type: 'submitWord' }); }}>
        {preview !== null ? `Attack for ${preview}` : 'Attack'}
      </button>
    </div>

    </div>
    <div class="side tail">
    <ItemsPanel items={run.player.items} traits={run.player.traits} />
    <p class="kbd">Type letters to select, Backspace to undo, Enter to attack, Esc to clear.</p>
    </div>
  </section>
{/if}

<style>
  .fight {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }
  /* In portrait the two wrappers vanish and their children stack as before; landscape uses them. */
  .side,
  .board {
    display: contents;
  }
  /* The report steps in with each turn (tester: unclear when a turn had ended). */
  .report {
    flex: none;
    min-height: 1.3rem;
    animation: turn-in var(--dur-settle) var(--ease-step) both;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2) var(--s3);
    font-size: var(--text);
    line-height: 1.3;
  }
  .hit {
    color: var(--score);
    font-family: var(--font-hud);
    font-weight: 400;
    font-size: var(--hud-m);
    animation: pop var(--dur-settle) var(--ease-settle);
  }
  .taken {
    color: var(--harm);
  }
  .healed {
    color: var(--life);
  }
  .shielded {
    color: var(--shield);
  }
  .note {
    color: var(--muted);
  }
  .rejected {
    color: var(--harm);
  }
  .after {
    flex: none;
    display: flex;
    gap: var(--s3);
    align-items: baseline;
    min-width: 0;
    font-size: var(--text);
    line-height: 1.3;
  }
  .after > :global(*) {
    margin: 0;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* The missed word is the lesson: it keeps its full text and the definition yields. */
  .after .missed {
    flex: none;
    max-width: 100%;
  }
  .missed {
    flex: none;
    margin: 0;
    font-size: var(--text);
    color: var(--muted);
  }
  .missed strong {
    color: var(--score);
    font-family: var(--font-letter);
    font-weight: 400;
    font-size: var(--hud-m);
  }
  .missed.best {
    color: var(--life);
  }
  .word {
    flex: none;
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: var(--s3);
    font-family: var(--font-letter);
    font-weight: 400;
    font-size: var(--hud-l);
    letter-spacing: 0.05em;
    min-height: 2rem;
    line-height: 2rem;
    color: var(--ink);
  }
  .word-text {
    /* Press Start 2P is one em per glyph: a sixteen-letter word on a narrow phone wraps
       rather than clips. */
    overflow-wrap: anywhere;
    line-height: 1.1;
  }
  .word.valid {
    color: var(--life);
  }
  .preview {
    font-family: var(--font-hud);
    font-size: var(--hud-m);
    letter-spacing: 0;
    color: var(--score);
  }
  /* The grid is a square no larger than the space left, read through container query units. */
  .grid-box {
    flex: 1;
    /* The grid shrinks to absorb a longer report but never collapses; below this the screen
       scrolls instead (App.svelte). */
    min-height: 160px;
    container-type: size;
    display: flex;
    justify-content: center;
    align-items: center;
    /* Fresh tiles rise in from below the grid; clip that outside the box while keeping the
       tile shadows and glows (8 px) inside it. */
    clip-path: inset(-8px);
  }
  /* Landscape on a phone (playtester, iPhone 17, 2026-09-08: the actions fell off the bottom; Dean
     the same day: it still scrolled). Two columns bounded to the viewport: the side column (arena,
     report, word, items) clips its report rather than growing, the board column (grid, actions)
     sizes the grid to what is left. Nothing depends on a tall viewport and nothing scrolls. */
  @media (orientation: landscape) and (max-height: 560px) {
    .fight {
      max-height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      grid-template-areas:
        'side board'
        'tail board';
      column-gap: var(--s4);
      row-gap: var(--s1);
    }
    .side,
    .board {
      display: flex;
      flex-direction: column;
      gap: var(--s1);
      min-height: 0;
    }
    .side {
      grid-area: side;
      overflow: hidden;
    }
    .side.tail {
      grid-area: tail;
    }
    .board {
      grid-area: board;
    }
    /* The report absorbs the squeeze: the arena and the word line keep their size. */
    .report {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    .after {
      display: none;
    }
    .word {
      min-height: 1.6rem;
      line-height: 1.6rem;
    }
    .grid-box {
      min-height: 0;
    }
    .side :global(.arena) {
      padding-top: var(--s1);
      padding-bottom: var(--s2);
    }
    .side :global(.arena .stage) {
      min-height: 44px;
    }
    /* No room for the hint in the two-column layout; a landscape phone has no keyboard anyway. */
    .kbd {
      display: none;
    }
  }
  .grid {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(4, minmax(0, 1fr));
    gap: var(--s2);
  }
  .tile {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border: 2px solid var(--tile-line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-tile);
    background: var(--tile);
    color: var(--tile-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-tile);
    /* The letter is the thing: about half the tile's side, rounded down to the 8px grid and
       capped at 32px (Dean's lab size; the face is heavy above it). */
    font-size: 24px;
    font-size: min(32px, round(down, calc(min(100cqw, 100cqh) / 4 * 0.5), 8px));
    font-weight: 400;
    line-height: 1;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    padding: 0;
    transition: background var(--dur-state) var(--ease-step), border-color var(--dur-state) var(--ease-step), transform var(--dur-state) var(--ease-step), box-shadow var(--dur-state) var(--ease-step);
  }
  .tile:active {
    transform: translate(2px, 2px);
    box-shadow: var(--shadow-press);
  }
  .tile.shiver:not(.moved):not(.fresh):not(.selected) {
    animation: shiver 2.8s steps(2, end) infinite;
    animation-delay: calc(var(--i, 0) * 180ms);
  }
  @keyframes shiver {
    0%,
    88%,
    100% {
      transform: none;
    }
    90% {
      transform: translate(1px, 0);
    }
    92% {
      transform: translate(-1px, 1px);
    }
    94% {
      transform: translate(1px, -1px);
    }
    96% {
      transform: translate(0, 1px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile.shiver {
      animation: none;
    }
  }
  .tile.moved {
    animation: settle var(--dur-settle) var(--ease-settle) both;
  }
  .tile.fresh {
    animation: settle var(--dur-settle) var(--ease-settle) both, appear var(--dur-settle) var(--ease-step) both;
  }
  .tile.redrawn {
    animation: appear var(--dur-settle) var(--ease-step) both;
  }
  @keyframes settle {
    from {
      transform: translateY(calc(var(--dy) * (100% + 8px)));
    }
    to {
      transform: none;
    }
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .tile[data-tier='vowel'] {
    background: var(--tile-vowel);
    border-color: var(--tile-vowel);
    color: var(--tile-vowel-ink);
  }
  .tile[data-tier='rare'] {
    border-color: var(--rare);
    box-shadow: 0 0 8px rgba(255, 79, 163, 0.55), var(--shadow-tile);
  }
  .tile .value {
    position: absolute;
    right: 4px;
    bottom: 3px;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--muted);
  }
  .tile .order {
    position: absolute;
    left: 4px;
    top: 3px;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: inherit;
    opacity: 0.85;
  }
  /* On a grid under 300px the tiles are under 70px and a 16px badge would sit on the letter
     (Dean's iPhone screenshot, 2026-09-09: the selected letters read as garbage). The word line
     already shows the order; the badge is a luxury for big tiles. */
  @container (max-height: 300px) {
    .tile .order,
    .tile .value {
      display: none;
    }
  }
  .tile.selected {
    background: var(--tile-select);
    border-color: var(--tile-select);
    color: var(--tile-select-ink);
  }
  .tile.selected .value,
  .tile[data-tier='vowel'] .order {
    color: var(--ground);
  }
  .tile.selected.valid {
    background: var(--tile-valid);
    border-color: var(--tile-valid);
    color: var(--tile-valid-ink);
  }
  .tile.locked {
    background: var(--ground);
    color: var(--tile-locked-ink);
    border-style: dashed;
    box-shadow: none;
  }
  .tile.venomous {
    border-color: var(--venom);
    box-shadow: 0 0 8px rgba(125, 255, 90, 0.5), var(--shadow-tile);
  }
  .tile.gold {
    border-color: var(--score);
    box-shadow: 0 0 6px var(--score), var(--shadow);
  }
  .tile.gold .value.gold {
    color: var(--score);
  }
  .tile.cracked {
    border-style: dashed;
  }
  .tile.cracked .value.crack {
    color: var(--muted);
  }
  .tile .value.venom {
    color: var(--venom);
  }
  .actions {
    flex: none;
    display: flex;
    gap: var(--s2);
  }
  /* The keyboard hint exists only where a keyboard is likely: a fine pointer that can hover. */
  .kbd {
    display: none;
    flex: none;
    margin: 0;
    font-size: var(--text);
    color: var(--muted);
  }
  @media (hover: hover) and (pointer: fine) {
    .kbd {
      display: block;
    }
  }
  .actions .btn {
    flex: 1;
  }
  .actions .btn.primary {
    flex: 1.4;
  }
  .shuffle.armed {
    background: var(--harm);
    color: var(--ground);
  }
  @keyframes turn-in {
    from {
      opacity: 0;
      transform: translateX(-6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes pop {
    from {
      transform: scale(1.4);
      opacity: 0.4;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
