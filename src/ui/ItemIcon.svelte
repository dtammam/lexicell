<script lang="ts">
  // A 16px generated glyph (public/sprites/<kind>/<id>.png, from scripts/sprites.py), scaled crisp.
  // `kind` picks the folder: items (mutations and defects), traits, or capabilities. A missing file
  // falls back to the unknown blob so a new id never breaks a screen.
  let { id, kind = 'items', size = 32 }: { id: string; kind?: 'items' | 'traits' | 'capabilities'; size?: number } = $props();
  const base = import.meta.env.BASE_URL;
  function fallback(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    if (!img.src.endsWith('sprites/unknown.png')) img.src = `${base}sprites/unknown.png`;
  }
</script>

<img class="icon" src="{base}sprites/{kind}/{id}.png" alt="" width={size} height={size} onerror={fallback} />

<style>
  .icon {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    flex: none;
    filter: drop-shadow(2px 2px 0 var(--shade));
  }
</style>
