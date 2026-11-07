import { test, expect } from '@playwright/test';

// The switch for a moved conversation to go on by itself on the new account (server/auto-resume.mjs): on unless turned
// off, kept by the server; the keystroke mode an earlier draft had is not a thing (nothing types into the editor).
test('going on by itself after a switch: on by default, can be turned off and on', async ({ request }) => {
  const auto = async (data: object) => (await (await request.post('/api/accounts/auto', { data })).json()) as { resume: boolean, resumeMode?: string };
  expect((await auto({})).resume).toBe(true);
  expect((await auto({ resume: false })).resume).toBe(false);
  const back = await auto({ resume: true, resumeMode: 'ui' });
  expect(back.resume).toBe(true);
  expect(back.resumeMode).toBeUndefined();
});
