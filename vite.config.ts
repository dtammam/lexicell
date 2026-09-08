import { svelte } from '@sveltejs/vite-plugin-svelte';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { serviceWorkerFor } from './scripts/lib/service-worker';

/**
 * Writes dist/sw.js after the build from the files actually emitted. Hand-written
 * (Dean, 2026-09-08: no third-party runtime code on the device beyond Svelte), so
 * there is no Workbox and no PWA plugin. The manifest is a static file in public/.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'lexicell-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const sw = serviceWorkerFor(outDir);
      writeFileSync(join(outDir, 'sw.js'), sw);
      const count = (sw.match(/"\//g) ?? []).length;
      console.log(`\nservice worker: ${count} files precached\n`);
    },
  };
}

// The build stamp shown on the title screen: BUILD_SHA comes from the publish workflow via a
// Docker build arg; local builds and the dev server say "dev".
const buildSha = (process.env.BUILD_SHA ?? 'dev').slice(0, 7);

export default defineConfig({
  define: { __BUILD_SHA__: JSON.stringify(buildSha) },
  plugins: [svelte(), serviceWorker()],
  build: {
    // The dictionary (1.6 MB) ships inside the bundle on purpose (exec plan, Phase 1).
    chunkSizeWarningLimit: 2500,
  },
});
