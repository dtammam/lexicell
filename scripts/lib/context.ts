import { CONTENT } from '../../src/content/index';
import type { EngineContext } from '../../src/engine/reducer';
import { createSolver } from '../../src/engine/solver';
import type { Content } from '../../src/engine/types';
import { loadDictionary, loadFullDictionary } from './load-dictionary';

/**
 * Engine context for Node (tests, sim). Pass `content` to swap item pools or curves.
 * Mirrors the browser (src/ui/context.ts): the solver is built from the BASELINE list
 * (so grids, reveal and the sim stay deterministic) while validation uses the FULL union.
 */
export function nodeContext(content: Content = CONTENT): EngineContext {
  return { dictionary: loadFullDictionary(), solver: createSolver(loadDictionary()), content };
}
