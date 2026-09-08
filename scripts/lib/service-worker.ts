/**
 * Generates the app's service worker from a built dist/ directory. Hand-written on
 * purpose (Dean, 2026-09-08): no Workbox on the device, nothing to license or track.
 *
 * Strategy: precache every built file on install under a cache named by the content
 * hash of the build; navigations are network-first with the cached index.html as the
 * offline fallback; everything else is cache-first. A new build gets a new cache name,
 * activate() drops the old one, and the page picks the new worker up on the next load.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface BuiltFile {
  /** Path relative to dist, posix separators, no leading slash. */
  readonly path: string;
  readonly content: Buffer;
}

export function listBuiltFiles(distDir: string): BuiltFile[] {
  const out: BuiltFile[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, rel);
      else if (rel !== 'sw.js') out.push({ path: rel, content: readFileSync(full) });
    }
  };
  walk(distDir, '');
  return out;
}

export function buildHash(files: readonly BuiltFile[]): string {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f.path);
    h.update('\0');
    h.update(f.content);
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

export function serviceWorkerSource(files: readonly BuiltFile[]): string {
  const hash = buildHash(files);
  const urls = files.map((f) => `/${f.path}`);
  if (!urls.includes('/index.html')) throw new Error('service worker: dist has no index.html');
  return `// Generated at build time by scripts/lib/service-worker.ts. Do not edit; rebuild.
const CACHE = 'lexicell-${hash}';
const ASSETS = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
`;
}

export function serviceWorkerFor(distDir: string): string {
  return serviceWorkerSource(listBuiltFiles(distDir));
}
