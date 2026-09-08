import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  // Svelte's package resolves to its client build under the browser condition; the
  // component tests under jsdom need that build. Nothing else in the tree has a
  // browser condition, so the engine tests are unaffected.
  resolve: { conditions: ['browser'] },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Engine, content and script tests run in Node. Component tests opt into jsdom per file
    // with a `// @vitest-environment jsdom` comment.
    environment: 'node',
  },
});
