import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      // A new build takes over on the next load; no "update available" prompt in the skeleton.
      registerType: 'autoUpdate',
      manifest: {
        name: 'Lexicell',
        short_name: 'Lexicell',
        description: 'A word-battle roguelike. Spell words, hit things.',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything, including the dictionary chunk, so airplane mode works after one visit.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        // The dictionary chunk is 1.67 MB, under workbox's 2 MiB default; the cap is raised so a
        // larger word list later does not drop out of the precache silently.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // The dictionary (1.6 MB) ships inside the bundle on purpose (exec plan, Phase 1).
    chunkSizeWarningLimit: 2500,
  },
});
