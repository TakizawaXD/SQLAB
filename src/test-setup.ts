/**
 * Configuración global de pruebas (Vitest en Node):
 *  - IndexedDB real en memoria mediante fake-indexeddb (persistencia de metadatos y de PGlite idb://).
 *  - Binarios de PGlite leídos de node_modules, para ejecutar el motor PostgreSQL real.
 */
import 'fake-indexeddb/auto';

const nodeFs = 'node:fs/promises';

(globalThis as any).__SQLAB_PGLITE_ASSETS__ = async () => {
  const fs: any = await import(/* @vite-ignore */ nodeFs);
  const base = (globalThis as any).process.cwd() + '/node_modules/@electric-sql/pglite/dist/';
  const [wasm, initdb, data] = await Promise.all([
    fs.readFile(base + 'pglite.wasm'),
    fs.readFile(base + 'initdb.wasm'),
    fs.readFile(base + 'pglite.data')
  ]);
  return {
    pgliteWasmModule: await WebAssembly.compile(wasm),
    initdbWasmModule: await WebAssembly.compile(initdb),
    fsBundle: new Blob([data])
  };
};
