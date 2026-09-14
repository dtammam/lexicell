import { CONTENT } from '../content/index';
import { createDictionary } from '../engine/dictionary';
import type { EngineContext } from '../engine/reducer';
import { createSolver } from '../engine/solver';
import type { Content } from '../engine/types';

let cached: Promise<EngineContext> | undefined;

/**
 * Build the engine context from the two word lists. The solver is built from the BASELINE only, so
 * grid generation, isDead, the "best there" reveal and word-of-the-day are untouched by the
 * supplement and every seed reproduces identically; the FULL union (baseline + supplement) is the
 * dictionary used only to validate a played word. Pure and small-input testable.
 * See docs/exec-plans/active/dictionary-expansion.md.
 */
export function buildContext(baselineText: string, supplementText: string, content: Content = CONTENT): EngineContext {
  const baseline = createDictionary(baselineText);
  const full = supplementText.trim() ? createDictionary(baselineText + '\n' + supplementText) : baseline;
  return { dictionary: full, solver: createSolver(baseline), content };
}

/** The browser's EngineContext. Resolves once; the word-list chunks load on first call. */
export function loadContext(): Promise<EngineContext> {
  cached ??= Promise.all([import('./words'), import('./supplement')]).then(([{ default: baselineText }, { default: supplementText }]) =>
    buildContext(baselineText, supplementText, CONTENT),
  );
  return cached;
}
