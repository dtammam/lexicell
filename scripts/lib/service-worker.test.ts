import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildHash, listBuiltFiles, manifestFor, serviceWorkerFor, serviceWorkerSource, type BuiltFile } from './service-worker';

function files(...entries: [string, string][]): BuiltFile[] {
  return entries.map(([path, text]) => ({ path, content: Buffer.from(text) }));
}

describe('service worker generator', () => {
  it('lists every file under dist recursively, sorted, with posix paths, and never sw.js itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexicell-sw-'));
    mkdirSync(join(dir, 'assets'));
    mkdirSync(join(dir, 'icons'));
    writeFileSync(join(dir, 'index.html'), '<title>Lexicell</title>');
    writeFileSync(join(dir, 'assets', 'index-abc.js'), 'js');
    writeFileSync(join(dir, 'assets', 'words-def.js'), 'words');
    writeFileSync(join(dir, 'icons', 'icon-192.png'), 'png');
    writeFileSync(join(dir, 'sw.js'), 'old worker');
    expect(listBuiltFiles(dir).map((f) => f.path)).toEqual(['assets/index-abc.js', 'assets/words-def.js', 'icons/icon-192.png', 'index.html']);
    const sw = serviceWorkerFor(dir);
    expect(sw).toContain('"/assets/words-def.js"');
    expect(sw).not.toContain('/sw.js');
  });

  it('names the cache by the content hash, so a changed file or a renamed file means a new cache', () => {
    const a = files(['index.html', 'a'], ['assets/x.js', 'x']);
    const b = files(['index.html', 'a'], ['assets/x.js', 'y']);
    const c = files(['index.html', 'a'], ['assets/z.js', 'x']);
    expect(buildHash(a)).toHaveLength(12);
    expect(buildHash(a)).toBe(buildHash(files(['index.html', 'a'], ['assets/x.js', 'x'])));
    expect(buildHash(a)).not.toBe(buildHash(b));
    expect(buildHash(a)).not.toBe(buildHash(c));
    expect(serviceWorkerSource(a)).toContain(`const CACHE = 'lexicell-${buildHash(a)}'`);
  });

  it('prefixes every URL and the offline index with the base path, and refuses a malformed base', () => {
    const sw = serviceWorkerSource(files(['index.html', 'a'], ['assets/x.js', 'x']), '/lexicell/');
    expect(sw).toContain('"/lexicell/index.html"');
    expect(sw).toContain('"/lexicell/assets/x.js"');
    expect(sw).toContain("const INDEX = \"/lexicell/index.html\"");
    expect(sw).not.toContain('"/index.html"');
    expect(() => serviceWorkerSource(files(['index.html', 'a']), 'lexicell/')).toThrow(/base/);
    expect(() => serviceWorkerSource(files(['index.html', 'a']), '/lexicell')).toThrow(/base/);
    const m = JSON.parse(manifestFor('/lexicell/')) as { start_url: string; scope: string; icons: { src: string }[] };
    expect(m.start_url).toBe('/lexicell/');
    expect(m.scope).toBe('/lexicell/');
    expect(m.icons.every((i) => i.src.startsWith('/lexicell/icons/'))).toBe(true);
    expect((JSON.parse(manifestFor()) as { start_url: string }).start_url).toBe('/');
  });

  it('refuses a dist without index.html, the offline fallback', () => {
    expect(() => serviceWorkerSource(files(['assets/x.js', 'x']))).toThrow(/index\.html/);
  });

  it('is plain script with the three handlers and a navigate fallback to the cached index', () => {
    const sw = serviceWorkerSource(files(['index.html', 'a']));
    for (const evt of ['install', 'activate', 'fetch']) expect(sw).toContain(`addEventListener('${evt}'`);
    expect(sw).toContain('caches.match(INDEX)');
    expect(sw).toContain('const INDEX = "/index.html"');
    expect(sw).toMatch(/if \(response\.ok\)[\s\S]*cache\.put\(INDEX/);
    expect(sw).toContain('skipWaiting');
    expect(sw).toContain('clients.claim');
    expect(sw).not.toMatch(/import |require\(/);
  });
});
