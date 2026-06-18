import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `vscode` only exists inside the extension host, so alias it to a tiny stub
// for unit tests of the pure-logic modules.
export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./test/vscode-mock.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
