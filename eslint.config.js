// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

/** Names the engine and content layers must never touch. */
const DOM_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'requestAnimationFrame'];

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'dev-dist/', 'coverage/', 'src/content/dictionary/*.txt'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname, extraFileExtensions: ['.svelte'] },
    },
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // CLAUDE.md: src/engine and src/content import nothing from svelte, src/ui, or the DOM.
    files: ['src/engine/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['svelte', 'svelte/*', '@sveltejs/*'], message: 'Engine and content are framework-free.' },
            { group: ['**/ui/**', '**/ui'], message: 'Engine and content must not import from src/ui.' },
            { group: ['node:*', 'fs', 'path', 'os'], message: 'Engine and content must run in the browser and in Node alike; no Node built-ins.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...DOM_GLOBALS.map((name) => ({ name, message: `${name} is DOM; engine/content are headless.` }))],
    },
  },
  {
    // CLAUDE.md: Math.random is banned in src/engine. Use the seeded RNG in state.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG carried in state (rng.ts).' },
        { object: 'Date', property: 'now', message: 'Engine must be deterministic; no wall-clock.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Engine must be deterministic; no wall-clock.' },
      ],
    },
  },
  {
    // Tests never ship; they may read fixtures from disk. svelte/ui/DOM bans still apply.
    files: ['src/engine/**/*.test.ts', 'src/content/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['svelte', 'svelte/*', '@sveltejs/*'], message: 'Engine and content are framework-free.' },
            { group: ['**/ui/**', '**/ui'], message: 'Engine and content must not import from src/ui.' },
          ],
        },
      ],
    },
  },
  {
    // Svelte files: the svelte parser wraps the TS parser so type-aware rules see <script lang="ts">.
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { globals: globals.browser, parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['eslint.config.js', 'vitest.config.ts', 'vite.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
