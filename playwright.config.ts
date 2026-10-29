import path from 'node:path';
import { defineConfig } from '@playwright/test';

// End-to-end smoke test: the production build in demo mode (no Claude Code needed), on its own port and data folder.
const PORT = 4399;
// a home folder of its own too: the office never reads (or, adding an account, writes) the real ~/.claude folders
export const HOME_DIR = path.resolve('test-results/home');
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 2,                       // each test builds a whole 3D office: two at a time is plenty
  expect: { timeout: 30_000 },      // the office takes a few seconds to build on a busy machine or a CI runner
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'node server/index.mjs',
    url: `http://127.0.0.1:${PORT}/health`,
    // its own data folder (never the real office's data/), English, and nothing that calls out to the network
    env: { HOME: HOME_DIR, USERPROFILE: HOME_DIR, OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT), OFFICE_DATA_DIR: 'test-results/office-data', OFFICE_LANG: 'en', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0' },
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
