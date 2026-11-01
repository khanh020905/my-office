import path from 'node:path';
import { defineConfig } from '@playwright/test';

// End-to-end smoke test: the production build in demo mode (no Claude Code needed), on its own port and data folder.
// E2E_PORT and E2E_OUT give a second run of its own port and folder, so two can go side by side.
const PORT = Number(process.env.E2E_PORT) || 4399, OUT = process.env.E2E_OUT || 'test-results';
// a home folder of its own too: the office never reads (or, adding an account, writes) the real ~/.claude folders
export const HOME_DIR = path.resolve(OUT, 'home');
// Claude Code's own folder inside that home, whatever the shell running the tests has set: a test must never read or
// write the real one (settings, sessions, transcripts), and every server a test starts on its own inherits this too
process.env.CLAUDE_CONFIG_DIR = path.join(HOME_DIR, '.claude');
export const DATA_DIR = path.resolve(OUT, 'office-data');
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: OUT,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 2,                       // each test builds a whole 3D office: two at a time is plenty
  expect: { timeout: 30_000 },      // the office takes a few seconds to build on a busy machine or a CI runner
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'node server/index.mjs',
    url: `http://127.0.0.1:${PORT}/health`,
    // its own data folder (never the real office's data/), English, and nothing that calls out to the network
    env: { HOME: HOME_DIR, USERPROFILE: HOME_DIR, CLAUDE_CONFIG_DIR: path.join(HOME_DIR, '.claude'), OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), OFFICE_TUNNEL_CMD: path.resolve('tests/e2e/fake-cloudflared.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT), OFFICE_DATA_DIR: DATA_DIR, OFFICE_LANG: 'en', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0',
      // a build of its own (OFFICE_DIST_DIR=.next-e2e npm run build), so testing never touches the running office's .next
      ...(process.env.OFFICE_DIST_DIR && { OFFICE_DIST_DIR: process.env.OFFICE_DIST_DIR }) },
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
