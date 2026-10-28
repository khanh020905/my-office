// Settings the server itself needs, kept in data/prefs.json: for now the office's language. OFFICE_LANG sets the
// language until someone picks one in Settings. Every viewer (the Mac, a phone) sees the office in this one language,
// because the server writes some of the words (event labels, cleanup tips, trophy names).
import fs from 'node:fs';
import path from 'node:path';
import { createT, pickLang, LANGS } from '../src/i18n/index.js';

export function createPrefs(dataDir) {
  const file = path.join(dataDir, 'prefs.json');
  let prefs = {};
  try { prefs = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { /* first run */ }
  const lang = () => pickLang(prefs.lang || process.env.OFFICE_LANG);
  return {
    lang,
    /** translate in the office's language: tr('server.denied'), tr('time.min', { n: 3 }) */
    tr: (key, vars, as) => createT(lang())(key, vars, as),
    setLang(l) {
      if (!Object.hasOwn(LANGS, l)) return false;
      prefs.lang = l;
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(prefs, null, 2));
      return true;
    },
  };
}
