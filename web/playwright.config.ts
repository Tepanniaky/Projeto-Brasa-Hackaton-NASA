import { defineConfig, devices } from '@playwright/test';

// E2E contra o build de produção servido pelo `vite preview` (dados reais em public/).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    acceptDownloads: true,
    locale: 'pt-BR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
