/**
 * Share card (Dean, 2026-09-15): a formatted PNG a player can send from a fight ("where I am") or
 * the end screen (final stats). Drawn on an offscreen canvas and exported as a blob; the native share
 * sheet carries it (see shareImage in share.ts). Scope note: the old "no canvas / no generated image"
 * rule (share.ts) is lifted for this export ONLY - the game itself still renders as DOM/Svelte, and
 * no third-party dependency is added. The card is a designed card, not a pixel snapshot of the UI.
 */
import type { RunMode } from '../engine/types';
import { SHARE_URL } from './share';

export interface ShareCardData {
  /** The line above the card (the share caption is separate); e.g. "Check out where I am in Lexicell". */
  readonly caption: string;
  readonly cellName: string;
  /** URL of the cell sprite for the reached act; drawn pixelated. A failed load is skipped. */
  readonly spriteUrl: string;
  readonly act: 1 | 2 | 3;
  readonly mode: RunMode;
  /** One line of where the run is, e.g. "Encounter 5 / 9" or "Reached encounter 14". */
  readonly status: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly bestWord: string;
  readonly bestWordDamage: number;
  readonly mutations: number;
  readonly seed: number;
  /** End screen only: "You won" / "You died" / "The deep took you". Omitted mid-fight. */
  readonly banner?: string;
}

const W = 540;
const H = 720;
const ACT_TINT: Readonly<Record<1 | 2 | 3, string>> = { 1: '#1fb5a8', 2: '#7b3fff', 3: '#ff3355' };
const GROUND = '#1b0f3a';
const PANEL = '#2a1657';
const INK = '#fff3ff';
const MUTED = '#b79bd6';
const LIFE = '#35e0d8';
const SCORE = '#ffe66d';
const SHADE = '#120826';
const HEAD = "'Pixelify Sans', system-ui, sans-serif";
const HUD = "'Press Start 2P', ui-monospace, monospace";

async function fontsReady(): Promise<void> {
  try {
    if (typeof document === 'undefined' || !document.fonts) return;
    await Promise.all([document.fonts.load(`700 24px ${HEAD}`), document.fonts.load(`16px ${HUD}`)]);
    await document.fonts.ready;
  } catch {
    // Missing fonts (headless/test) just fall back to the system stacks; the card still draws.
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = src;
  });
}

/** Render the card to a PNG blob, or null when there is no canvas (SSR/old WebView) or it fails. */
export async function renderShareBlob(data: ShareCardData): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const dpr = Math.min(3, Math.max(1, Math.round(globalThis.devicePixelRatio || 2)));
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  await fontsReady();
  const sprite = await loadImage(data.spriteUrl);
  drawCard(ctx, data, sprite);
  if (typeof canvas.toBlob !== 'function') return null;
  return new Promise((resolve) => {
    canvas.toBlob((b) => {
      resolve(b);
    }, 'image/png');
  });
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left'): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

function drawCard(ctx: CanvasRenderingContext2D, d: ShareCardData, sprite: HTMLImageElement | null): void {
  const tint = ACT_TINT[d.act] ?? ACT_TINT[1];
  const cx = W / 2;
  ctx.textBaseline = 'alphabetic';

  // Ground and the tinted panel with a hard drop shadow (the game's flat-shadow look).
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, H);
  const pad = 22;
  ctx.fillStyle = SHADE;
  ctx.fillRect(pad + 6, pad + 6, W - pad * 2, H - pad * 2);
  ctx.fillStyle = PANEL;
  ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2);
  ctx.strokeStyle = tint;
  ctx.lineWidth = 4;
  ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

  let y = pad + 46;
  // Wordmark.
  text(ctx, 'LEXICELL', cx, y, `28px ${HUD}`, SCORE, 'center');
  y += 40;
  // Caption (the hook line), wrapped to at most two lines.
  ctx.font = `700 22px ${HEAD}`;
  const words = d.caption.split(' ');
  let line = '';
  const capLines: string[] = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > W - pad * 2 - 40 && line) {
      capLines.push(line);
      line = w;
    } else line = test;
  }
  if (line) capLines.push(line);
  for (const l of capLines.slice(0, 2)) {
    text(ctx, l, cx, y, `700 22px ${HEAD}`, INK, 'center');
    y += 30;
  }
  y += 6;

  // Banner (end screen only).
  if (d.banner) {
    text(ctx, d.banner.toUpperCase(), cx, y, `18px ${HUD}`, tint, 'center');
    y += 34;
  }

  // Cell sprite (pixelated), centred.
  const spriteSize = 132;
  if (sprite) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, cx - spriteSize / 2, y, spriteSize, spriteSize);
  }
  y += spriteSize + 34;

  // Cell name.
  text(ctx, d.cellName, cx, y, `700 26px ${HEAD}`, INK, 'center');
  y += 30;
  // Status (encounter / reach).
  text(ctx, d.status, cx, y, `12px ${HUD}`, MUTED, 'center');
  y += 40;

  // Stat rows, left-aligned inside the panel.
  const lx = pad + 30;
  const rx = W - pad - 30;
  // HP bar.
  text(ctx, 'HP', lx, y, `11px ${HUD}`, MUTED, 'left');
  const barX = lx + 44;
  const barW = rx - barX - 70;
  const barY = y - 13;
  ctx.fillStyle = SHADE;
  ctx.fillRect(barX, barY, barW, 16);
  ctx.fillStyle = LIFE;
  const frac = d.maxHp > 0 ? Math.max(0, Math.min(1, d.hp / d.maxHp)) : 0;
  ctx.fillRect(barX, barY, barW * frac, 16);
  text(ctx, `${d.hp}/${d.maxHp}`, rx, y, `11px ${HUD}`, INK, 'right');
  y += 40;

  // Best word.
  text(ctx, 'BEST WORD', lx, y, `11px ${HUD}`, MUTED, 'left');
  const best = d.bestWord ? `${d.bestWord.toUpperCase()}  ${d.bestWordDamage}` : 'NONE';
  text(ctx, best, rx, y, `13px ${HUD}`, d.bestWord ? SCORE : MUTED, 'right');
  y += 40;

  // Mutations count.
  text(ctx, 'MUTATIONS', lx, y, `11px ${HUD}`, MUTED, 'left');
  text(ctx, String(d.mutations), rx, y, `13px ${HUD}`, INK, 'right');
  y += 40;

  // Seed.
  text(ctx, 'SEED', lx, y, `11px ${HUD}`, MUTED, 'left');
  text(ctx, String(d.seed), rx, y, `12px ${HUD}`, MUTED, 'right');

  // Footer URL.
  text(ctx, SHARE_URL.replace(/^https?:\/\//, ''), cx, H - pad - 20, `11px ${HUD}`, MUTED, 'center');
}
