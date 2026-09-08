import { CONTENT } from '../content/index';
import { createDictionary } from '../engine/dictionary';
import type { EngineContext } from '../engine/reducer';
import { createSolver } from '../engine/solver';

let cached: Promise<EngineContext> | undefined;

/** The browser's EngineContext. Resolves once; the dictionary chunk loads on first call. */
export function loadContext(): Promise<EngineContext> {
  cached ??= import('./words').then(({ default: text }) => {
    const dictionary = createDictionary(text);
    return { dictionary, solver: createSolver(dictionary), content: CONTENT };
  });
  return cached;
}
