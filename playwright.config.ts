import { defineConfig, devices } from '@playwright/test'

/**
 * E2E contra el build de producción (`vite preview`) o contra una URL ya desplegada
 * (p. ej. el contenedor Docker): E2E_BASE_URL=http://localhost:8080 npm run e2e
 */
const external = process.env.E2E_BASE_URL
const baseURL = external ?? 'http://localhost:4173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'es-MX',
    trace: 'retain-on-failure',
    // En local se usa el Chrome instalado; en CI, el Chromium de Playwright.
    channel: process.env.CI ? undefined : 'chrome',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
