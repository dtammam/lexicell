// The accept-only supplement (words_alpha minus ENABLE) rides inside the bundle as its own lazy
// chunk, imported from context.ts alongside words.ts. It widens what a player may spell; it is never
// fed to the solver. See docs/exec-plans/active/dictionary-expansion.md.
import text from '../content/dictionary/supplement.txt?raw';

export default text;
