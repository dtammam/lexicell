import type { StorageLike } from './persist';

/** localStorage, or an in-memory stand-in when the browser refuses access (blocked site data, some private modes). */
export function browserStorage(): StorageLike {
  try {
    localStorage.getItem('lexicell.probe');
    return localStorage;
  } catch {
    const data = new Map<string, string>();
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
      removeItem: (k) => {
        data.delete(k);
      },
    };
  }
}
