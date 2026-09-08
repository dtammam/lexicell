/**
 * The handful of DOM test helpers the component tests need, on top of Svelte's own
 * mount/unmount. Replaces @testing-library/svelte (Dean, 2026-09-08: fewer third-party
 * dependencies). Text matching follows the same idea: an element matches when its
 * whitespace-collapsed text content equals the string or matches the regex, and the
 * deepest such element wins.
 */
import { flushSync, mount, tick, unmount, type Component } from 'svelte';

type Matcher = string | RegExp;

const mounted: { instance: Record<string, unknown>; target: HTMLElement }[] = [];

export function render(component: Component): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(component, { target });
  mounted.push({ instance, target });
  flushSync();
  return target;
}

export function cleanup(): void {
  for (const m of mounted.splice(0)) {
    void unmount(m.instance);
    m.target.remove();
  }
}

function norm(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function matches(text: string, m: Matcher): boolean {
  return typeof m === 'string' ? text === m : m.test(text);
}

export function queryAllByText(m: Matcher, root: ParentNode = document.body): HTMLElement[] {
  const hits = Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && matches(norm(el.textContent), m),
  );
  return hits.filter((el) => !hits.some((other) => other !== el && el.contains(other)));
}

export function queryByText(m: Matcher, root: ParentNode = document.body): HTMLElement | null {
  return queryAllByText(m, root)[0] ?? null;
}

export function getByText(m: Matcher, root: ParentNode = document.body): HTMLElement {
  const el = queryByText(m, root);
  if (!el) throw new Error(`no element with text ${String(m)}`);
  return el;
}

export async function findByText(m: Matcher, timeout = 5000): Promise<HTMLElement> {
  // performance.now, not Date.now: tests pin Date.now to the run seed, which would freeze the deadline.
  const deadline = performance.now() + timeout;
  for (;;) {
    const el = queryByText(m);
    if (el) return el;
    if (performance.now() > deadline) throw new Error(`timed out waiting for text ${String(m)}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

export function queryButton(name: string, root: ParentNode = document.body): HTMLButtonElement | null {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => norm(b.textContent) === name) ?? null;
}

export function getButton(name: string, root: ParentNode = document.body): HTMLButtonElement {
  const b = queryButton(name, root);
  if (!b) throw new Error(`no button named ${name}`);
  return b;
}

export async function click(el: Element | null): Promise<void> {
  if (!el) throw new Error('element missing');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  flushSync();
  await tick();
}
