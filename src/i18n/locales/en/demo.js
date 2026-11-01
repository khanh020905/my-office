// The fictional demo (?demo, and the public online demo): six projects with their prompts and steps, the chat with
// Claude, a pretend Mac and one scripted failure. In English it should read like an ordinary day of an English-speaking
// developer. File paths, search terms and shell commands are the same in every language and live in demo/demo.js.
export default {
  // what you ask for and what Claude's steps say (a command's line shows its description, as Claude Code does)
  tasks: {
    cart: { prompt: 'Add pagination to the cart API', test: 'Run the cart tests', retest: 'Run the full test suite again', wait: 'Install zod' },
    shipping: { prompt: 'Fix the shipping fee being calculated wrong', test: 'Run the shipping fee tests' },
    hero: { prompt: 'Rebuild the hero section from the new mockup', build: 'Try a Next.js build', sub: 'Compare 3 hero designs on Dribbble' },
    images: { prompt: 'Optimize images to get LCP under 2 seconds', webp: 'Convert images to WebP', lighthouse: 'Run Lighthouse' },
    orders: { prompt: 'Add a cleanup step for the order data', pytest: 'Run pytest', sub: 'Find every place that reads the orders table' },
    schedule: { prompt: 'Schedule the job to run at 2 AM', check: 'Check the DAG syntax', wait: 'Write to crontab' },
    login: { prompt: 'Add a Sign in with Google screen', typecheck: 'Run typecheck' },
    keyboard: { prompt: 'Fix the keyboard covering the input fields', uiTest: 'Run the UI tests' },
    install: { prompt: 'Write the installation guide', build: 'Build the docs site' },
    staging: { prompt: 'Give the staging server more RAM', wait: 'Run terraform apply' },
  },
  // the pretend Mac: what to stop, quit and clean up
  mac: {
    // the conversations' titles, as Claude Code names them (the Mac panel's Claude sessions)
    titles: { 'shop-api': 'Cart pagination and shipping fees', 'landing-page': 'New hero section and WebP images', 'data-pipeline': 'Duplicate orders in the ETL', 'mobile-app': 'Google sign-in on the login screen', 'docs-site': 'Installation guide', 'infra': 'Staging Terraform changes' },
    devTitle: 'Stop next dev · port 3000',
    devDetail: '~/projects/landing-page · running 2 d 3 h · CPU 290% · RAM 2.3 GB',
    lostTitle: 'Stop forgotten vite · port 5173',
    lostDetail: '~/projects/old-prototype · session old-prototype closed but left it running · running 9 h',
    chromeTitle: 'Quit Google Chrome',
    chromeDetail: '4.8 GB RAM · 22 processes · save your work first',
    tmpTitle: 'Temp folders from closed Claude sessions',
    tmpDetail: '8.4 GB on disk · 61 scratch folders. Open sessions are left alone.',
    tmpCleanup: '61 scratch folders in /tmp',
    nextTitle: 'Next.js build cache · ~/projects/landing-page',
    nextDetail: 'Next rebuilds it on the next build',
    npmTitle: 'npm download cache',
    npmDetail: 'npm downloads packages again when needed',
    stop: 'Stop',
    quit: 'Quit',
    clean: 'Clean up',
  },
  // Claude's to-do lists in two of the sessions
  checklist: {
    cart: { params: 'Add page and limit to the API', lastPage: 'Write a test for the last page', docs: 'Update the API docs' },
    schedule: { read: 'Read the current DAG', move: 'Move the schedule to 2 AM', crontab: 'Write to crontab', trial: 'Do a test run' },
  },
  // Claude's replies: what it usually writes (lists, code, tables), so the chat reader can be judged
  replies: {
    cart: 'Done. Summary:\n\n- Updated `src/routes/cart.ts`: added `?page=` and `?limit=` (default **20**, max 100).\n- Added 4 tests for an empty page, the last page and an oversized `limit`.\n- `npm test`: **38/38 passing**.\n\nWant me to change the default to 50?',
    speed: '## Measured again\n\n| Page | Before | After |\n| --- | --- | --- |\n| Home | 3.4 s | **1.7 s** |\n| Pricing | 2.9 s | **1.5 s** |\n\nThe hero image is now WebP and preloaded with:\n\n```tsx\n<Image src={hero} priority sizes="100vw" alt="" />\n```\n\n> Lighthouse ran on this machine; slower devices will show slightly higher numbers.',
    schedule: 'I did it in 3 steps:\n\n1. Read `airflow/dags/daily.py` to check the current schedule.\n2. Changed `schedule` to `0 2 * * *` (2 AM).\n3. Ran the DAG syntax check: no errors.\n\nOne thing left for you:\n\n- [x] Update the schedule in code\n- [ ] Click **Allow** to write it to crontab',
  },
  // the first session was continued from a long one: it opens with Claude's own summary
  summary: 'This session is being continued from a previous conversation that ran out of context.\n\nSummary:\n1. **Primary request**: add pagination to the cart API, keeping the existing response format.\n2. **Done so far**:\n   - Read `src/routes/cart.ts` and `src/lib/db.ts`.\n   - Agreed on `page` + `limit` rather than a cursor.\n3. **Remaining**: write the tests, update the API docs.',
  chat: {
    keepGoing: 'ok keep going, and remember a test for the last page',
    stopped: 'You stopped Claude',
    schedule: 'ok, now schedule the job',
  },
  // the scripted incident: three failing commands in a row
  incident: 'payment tests failed',
};
