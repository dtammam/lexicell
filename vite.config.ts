import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// The PWA plugin (manifest, service worker, icons) lands with the deploy commit
// so the manifest never points at icons that do not exist yet.
export default defineConfig({
  plugins: [svelte()],
  build: {
    // The dictionary (1.6 MB) ships inside the bundle on purpose (exec plan, Phase 1).
    chunkSizeWarningLimit: 2500,
  },
});
