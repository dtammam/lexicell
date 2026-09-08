<script lang="ts">
  // T1 scaffold placeholder. The screen switch arrives with the screens commit.
  const title = 'Lexicell';
</script>

<main>
  <h1>{title}</h1>
  <p>Walking skeleton. Screens land in the next commit.</p>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #1a1a2e;
    color: #eaeaea;
    font-family: system-ui, -apple-system, sans-serif;
  }
  main {
    padding: 1rem;
    padding-top: max(1rem, env(safe-area-inset-top));
  }
</style>
