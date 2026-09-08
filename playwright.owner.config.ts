import { defineConfig } from '@playwright/test';
const port = Number(process.env.OWNER_TEST_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid owner test port');
export default defineConfig({
  testDir: './e2e/owner', outputDir: './test-results/owner', workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true,
    launchOptions: { ...(process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {}) } },
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.OWNER_TEST_PORT },
});
