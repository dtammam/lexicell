<script lang="ts">
  import { defineWord } from './definitions';

  // Shows the definition of `word` once the table has loaded; renders nothing for undefined words.
  let { word }: { word: string } = $props();
  let gloss: string | null = $state.raw(null);

  $effect(() => {
    const w = word;
    gloss = null;
    if (!w) return;
    let live = true;
    defineWord(w)
      .then((g) => {
        if (live) gloss = g;
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  });
</script>

{#if gloss}
  <p class="definition"><strong>{word.toLowerCase()}</strong>: {gloss}</p>
{/if}

<style>
  .definition {
    margin: 0;
    font-size: var(--text);
    color: var(--muted);
    line-height: 1.35;
  }
  strong {
    color: var(--ink);
  }
</style>
