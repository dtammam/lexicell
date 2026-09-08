// The word list rides inside the bundle (exec plan, Phase 1: one request path, cached
// with the app by the service worker). This module is imported lazily from context.ts
// so the first paint does not wait on 1.6 MB of text.
import text from '../content/dictionary/words.txt?raw';

export default text;
