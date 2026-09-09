<script lang="ts">
  import { RELEASE_NOTES } from './release-notes';

  let { onBack }: { onBack: () => void } = $props();

  const REPO = 'https://github.com/dtammam/lexicell';
  // Non-breaking spaces inside each half: in Press Start 2P "build 65 · PR #63" is the widest line a 390px phone takes, and it must not break at "PR".
  const stamp = (n: { build: number | null; pr: number | null }) => [n.build === null ? null : `build\u00a0${n.build}`, n.pr === null ? null : `PR\u00a0#${n.pr}`].filter((s) => s !== null).join(' · ');
</script>

<!-- Release notes (Dean, 2026-09-09): every merge since the first commit, newest on top, scrolling down into history. -->
<section class="notes">
  <header>
    <h2>Release notes</h2>
    <button class="btn" onclick={onBack}>Back</button>
  </header>
  <p class="hint">Every build since the first commit, newest first. Scroll down for the archaeology.</p>
  <ol class="list">
    {#each RELEASE_NOTES as n (n.sha)}
      <li>
        {#if n.pr !== null}
          <p class="stamp"><a href="{REPO}/pull/{n.pr}" target="_blank" rel="noopener">{stamp(n)}</a></p>
        {:else if n.build !== null}
          <p class="stamp">{stamp(n)}</p>
        {/if}
        <p class="date">{n.date}</p>
        <h3>{n.title}</h3>
        <p class="body">{n.notes}</p>
      </li>
    {/each}
  </ol>
</section>

<style>
  .notes {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: var(--s2);
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
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: var(--text);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s3);
  }
  li {
    padding: var(--s3);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow);
  }
  .stamp {
    margin: 0 0 var(--s1);
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--score);
  }
  .stamp a {
    color: var(--score);
    text-decoration: none;
  }
  .date {
    margin: 0 0 var(--s1);
    color: var(--muted);
    font-size: var(--text);
  }
  h3 {
    margin: 0 0 var(--s1);
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
  }
  .body {
    margin: 0;
    color: var(--ink);
    font-size: var(--text);
    line-height: 1.5;
  }
</style>
