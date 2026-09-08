import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('index.html has no #app element');

mount(App, { target });

// The service worker is generated at build time (scripts/lib/service-worker.ts) and
// only registered from a production build so the dev server is never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
