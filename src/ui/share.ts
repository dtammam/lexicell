/**
 * Sharing a run (variety wave step 7; image card 2026-09-15). All UI-side, no engine and no save: the
 * seed a player pastes is wired straight into the existing `newRun` action, which already takes a
 * number. `resultText`/`copyText` are the text path; `shareImage` carries a generated PNG card (see
 * shareCard.ts) through the native share sheet, falling back to a download then to copying the text.
 * The URL is the public GitHub Pages build.
 */
import type { RunMode } from '../engine/types';

export const SHARE_URL = 'https://dtammam.github.io/lexicell/';
export const SHARE_TITLE = 'Lexicell';

/**
 * A pasted seed. Blank or non-numeric means "let the game roll one" (null; the caller uses its
 * Date.now path). A run of digits is clamped to a uint32 with `>>> 0`, so a copied seed pastes back
 * unchanged (seeds are already uint32) and the run replays. Negatives, decimals and stray text are
 * rejected as non-numeric rather than coerced.
 */
export function parseSeed(raw: string): number | null {
  const t = raw.trim();
  if (t === '' || !/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n >>> 0;
}

/** The one line a native share (or its clipboard fallback) carries: outcome, cell, reach, best word, seed, link. */
export function resultText(opts: {
  won: boolean;
  mode: RunMode;
  cellName: string;
  reached: number;
  bestWord: string;
  bestWordDamage: number;
  seed: number;
}): string {
  const outcome = opts.won ? 'won' : opts.mode === 'endless' ? 'the deep took me' : 'died';
  const where = opts.mode === 'endless' ? `reached encounter ${opts.reached}` : `reached ${opts.reached} of 9`;
  const best = opts.bestWord ? ` Best word ${opts.bestWord.toUpperCase()} for ${opts.bestWordDamage}.` : '';
  return `Lexicell: ${outcome} as ${opts.cellName}, ${where}.${best} Seed ${opts.seed}. ${SHARE_URL}`;
}

export type ShareResult = 'shared' | 'downloaded' | 'copied' | 'failed';

/**
 * Share a generated PNG card. Native share sheet with the image file where supported (mobile);
 * otherwise the browser downloads the PNG; if there is no blob at all, the text line is copied.
 * A cancelled share sheet counts as handled (no surprise download).
 */
export async function shareImage(opts: { blob: Blob | null; text: string; title?: string; filename?: string }): Promise<ShareResult> {
  const { blob, text: shareText, title = SHARE_TITLE, filename = 'lexicell.png' } = opts;
  if (blob && typeof navigator !== 'undefined') {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) && typeof navigator.share === 'function') {
        await navigator.share({ files: [file], text: shareText, title });
        return 'shared';
      }
    } catch (e) {
      // The user dismissing the sheet is not a failure and must not trigger the download fallback.
      if (e instanceof Error && e.name === 'AbortError') return 'shared';
      // Any other share error: fall through to the download path below.
    }
  }
  if (blob) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      return 'downloaded';
    } catch {
      // No blob URL / DOM: last resort is the text line.
    }
  }
  return (await copyText(shareText)) ? 'copied' : 'failed';
}

/** Copy text to the clipboard, async where the API exists, with a synchronous textarea fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // The async API can reject (no permission, not focused); fall through to the synchronous path.
  }
  return copyFallback(text);
}

function copyFallback(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    // Deprecated, but it is the only SYNCHRONOUS copy path, and this branch runs only where
    // navigator.clipboard is missing (older WebViews). Deliberate; not the async API in disguise.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
