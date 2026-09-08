/// <reference types="vite/client" />
/// <reference types="svelte" />

/** Short commit sha of the build (vite.config.ts define); "dev" locally, "test" under vitest. */
declare const __BUILD_SHA__: string;
/** CI run number (vite.config.ts define); "0" locally. Only ever goes up. */
declare const __BUILD_NUMBER__: string;
