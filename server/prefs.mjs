// Settings the server itself needs, kept in data/prefs.json: the office's language, and whether idle Claude sessions
// are closed on a timer. OFFICE_LANG sets the language until someone picks one in Settings. Every viewer (the Mac, a
// phone) sees the office in this one language, because the server writes some of the words (event labels, cleanup
// tips, trophy names).
import fs from 'node:fs';
import path from 'node:path';
import { createT, pickLang, LANGS } from '../src/i18n/index.js';

/** the choices for closing idle sessions on a timer, in hours (0: off, the default) */
export const AUTO_CLOSE_HOURS = [2, 4, 8];

export function createPrefs(dataDir) {
  const file = path.join(dataDir, 'prefs.json');
  let prefs = {};
  try { prefs = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { /* first run */ }
  const lang = () => pickLang(prefs.lang || process.env.OFFICE_LANG);
  const save = () => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(prefs, null, 2)); };
  return {
    lang,
    /** translate in the office's language: tr('server.denied'), tr('time.min', { n: 3 }) */
    tr: (key, vars, as) => createT(lang())(key, vars, as),
    setLang(l) {
      if (!Object.hasOwn(LANGS, l)) return false;
      prefs.lang = l; save();
      return true;
    },
    /** the other settings the server keeps (the accounts' names, switching accounts) */
    get: (key) => prefs[key],
    set(key, value) {
      if (value === undefined) delete prefs[key]; else prefs[key] = value;
      save();
    },
    /** close Claude sessions idle this many hours (0: never) */
    autoClose: () => (AUTO_CLOSE_HOURS.includes(prefs.autoCloseHours) ? prefs.autoCloseHours : 0),
    setAutoClose(h) {
      if (h !== 0 && !AUTO_CLOSE_HOURS.includes(h)) return false;
      prefs.autoCloseHours = h; save();
      return true;
    },
  };
}
