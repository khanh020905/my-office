// The translator for React server components: the server in front of Next (server/index.mjs) puts the office's language
// in the x-office-lang request header. `const t = await getT();` then t('ui.key'). Reading the header is also what
// makes the page render on every request.
import { headers } from 'next/headers';
import { createT } from './index.js';

// The static demo build (OFFICE_STATIC=1) has no request to read: its language is fixed at build time.
export async function getLang(): Promise<string> {
  if (process.env.OFFICE_STATIC === '1') return process.env.OFFICE_STATIC_LANG || 'en';
  return (await headers()).get('x-office-lang') ?? 'en';
}
export async function getT() {
  return createT(await getLang());
}
