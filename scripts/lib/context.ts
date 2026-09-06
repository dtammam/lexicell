import { CONTENT } from '../../src/content/index';
import type { EngineContext } from '../../src/engine/reducer';
import { createSolver } from '../../src/engine/solver';
import type { Content } from '../../src/engine/types';
import { loadDictionary } from './load-dictionary';

/** Engine context for Node (tests, sim). Pass `content` to swap item pools or curves. */
export function nodeContext(content: Content = CONTENT): EngineContext {
  const dictionary = loadDictionary();
  return { dictionary, solver: createSolver(dictionary), content };
}
