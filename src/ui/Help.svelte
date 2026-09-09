<script lang="ts">
  import { LETTER_VALUE } from '../engine/scoring';

  let { onBack, readable, onToggleReadable }: { onBack: () => void; readable: boolean; onToggleReadable: () => void } = $props();

  // The legend shows real letters at their real values, so a player can check it against the grid.
  const RARE = ['K', 'J', 'X', 'Q', 'Z'].map((l) => `${l} ${LETTER_VALUE[l.toLowerCase()] ?? 0}`).join(', ');
  const VENOM_MARK = '\u2623';
  const LOCK_MARK = '\u{1F512}';
</script>

<section class="help">
  <header>
    <h2>How to play</h2>
    <button class="btn" onclick={onBack}>Back</button>
  </header>

  <div class="body">
    <p class="lead">Spell words from the sixteen tiles. Every word is an attack. Long words hit hard.</p>
    <p class="lead">Tiles do not need to touch. Pick any letters anywhere on the grid, in the order you want to spell them.</p>

    <h3>Damage</h3>
    <p>Each letter has a value. The word's letters are added up, multiplied by a bonus for its length, then by your organelles. A seven-letter word is worth many times a four-letter one.</p>

    <h3>What the tile colours mean</h3>
    <ul class="legend">
      <li><span class="tile plain">T</span><span>Plain consonant: 1 to 4 points.</span></li>
      <li><span class="tile vowel">A</span><span>Vowel: 1 point, common, drawn often.</span></li>
      <li><span class="tile rare">Q</span><span>Rare letter, worth the most: {RARE}.</span></li>
      <li><span class="tile venom">G<small>{VENOM_MARK}2</small></span><span>Venomous: bites you for its number every turn until you play it. Shuffling cures it too.</span></li>
      <li><span class="tile locked">B<small>{LOCK_MARK}2</small></span><span>Locked for that many turns: a boss did that. You cannot use it.</span></li>
      <li><span class="tile selected">S</span><span>Selected. It turns green when the letters spell a real word.</span></li>
    </ul>

    <h3>Your turn</h3>
    <p>Tap tiles to spell, then Attack. Clear empties the selection. Shuffle redraws every unlocked tile and costs your turn, unless an organelle gave you a free shuffle. After your word the enemy hits back, the tiles you used fall away and new ones drop in.</p>

    <h3>The run</h3>
    <p>Nine encounters in three acts, a boss at the end of each act. Your HP carries from fight to fight and never refills on its own. After each win you choose one organelle of three; they stack for the whole run. Lose your HP and the run ends.</p>
    <p>Each run also hides one elite (an enemy from the next act, a rare organelle guaranteed for beating it), one rest (heal, or take an organelle instead) and one event (a small trade, take it or leave it) among the fights. Where they fall is the seed's choice.</p>
    <p>Beat a boss and you evolve: three traits are offered and you keep one for the run. A trait is part of your body, always on, and it applies before your organelles.</p>

    <h3>Reading</h3>
    <p>The pixel type is the game's voice. If it costs you letters, switch it off; the choice stays on this device.</p>
    <button class="btn" class:life={readable} onclick={onToggleReadable}>{readable ? 'Readable type: on' : 'Readable type: off'}</button>
  </div>
</section>

<style>
  .help {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: var(--s3);
  }
  header {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s3);
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--head);
  }
  h3 {
    margin: var(--s2) 0 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
    color: var(--muted);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    font-size: var(--text);
    line-height: 1.4;
    padding-right: var(--s1);
  }
  p {
    margin: 0;
  }
  .lead {
    color: var(--ink);
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: var(--s3);
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
  .tile.selected {
    background: var(--tile-select);
    border-color: var(--tile-select);
    color: var(--tile-select-ink);
  }
</style>
