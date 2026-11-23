import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    permissions: ['clipboard-read', 'clipboard-write'],
    // Software WebGL, so the 3D smoke test also runs on CI machines without a GPU.
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'laptop', use: { viewport: { width: 1366, height: 768 } } },
  ],
  webServer: {
    // Separate outDir so an e2e run never clobbers the production build in dist/.
    // Drafts are switched on because the placeholder content is not released yet (F-906).
    command: `VITE_SHOW_DRAFTS=1 npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
