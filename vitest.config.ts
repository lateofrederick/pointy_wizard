import { defineConfig } from 'vitest/config';

export default defineConfig({
  // postcss.config.mjs uses Next's string-plugin form, which Vite cannot read.
  // Tests never assert on styling, so CSS imports are processed with no plugins.
  css: { postcss: { plugins: [] } },
  // tsconfig sets jsx:"preserve" for Next, so esbuild needs telling to use the
  // automatic runtime rather than expecting React in scope. This is enough on
  // its own — @vitejs/plugin-react only adds Fast Refresh, which tests never
  // use, and its rollup types clash with the Next build's type check.
  esbuild: { jsx: 'automatic' },
  test: {
    // Model tests run in node; component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock, the per-file mechanism in vitest 3.
    environment: 'node',
    include: ['app/**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
