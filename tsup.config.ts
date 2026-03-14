import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  bundle: true,
  // Bundle ink and react; exclude native/optional modules
  noExternal: ['ink', 'react'],
  external: ['playwright', 'react-devtools-core'],
  // Shim require() for CJS packages bundled into ESM (e.g. signal-exit via Ink)
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});
