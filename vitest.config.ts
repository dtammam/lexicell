import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Engine, content and script tests run in Node. Component tests opt into jsdom per file
    // with a `// @vitest-environment jsdom` comment.
    environment: 'node',
  },
});
