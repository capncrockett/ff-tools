import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: './',
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node --import tsx scripts/e2e-server.mjs',
    cwd: path.resolve('.'),
    url: 'http://127.0.0.1:4174/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
