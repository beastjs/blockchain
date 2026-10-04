import { defineConfig } from '@playwright/test'
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const baseURL = `http://127.0.0.1:${port}`
export default defineConfig({
  testDir: './tests/browser',
  timeout: 35_000,
  fullyParallel: false,
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 1060 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    screenshot: 'only-on-failure',
  },
  webServer: { command: `bun run dev --host 127.0.0.1 --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI, env: { PUBLIC_REOWN_PROJECT_ID: '00000000000000000000000000000000' } },
})
