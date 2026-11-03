import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './client/e2e',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3107',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx server/src/index.ts',
    url: 'http://127.0.0.1:3107/health',
    env: { PORT: '3107', HOST: '127.0.0.1', ALLOWED_ORIGINS: 'http://127.0.0.1:3107' },
    reuseExistingServer: false,
  },
})
