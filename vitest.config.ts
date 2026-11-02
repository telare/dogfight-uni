import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'server/test/*.test.js',
      '{shared,server,client}/**/*.vitest.{js,ts}',
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['shared/src/**/*.ts'],
      exclude: ['shared/src/**/index.ts', 'shared/src/protocol/types.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 85, statements: 85, functions: 85 },
    },
  },
})
