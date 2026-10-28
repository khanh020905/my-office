// Every word the office shows, in every language it speaks. One folder per language (src/i18n/locales/<lang>/), one file
// per area of the app; English is the reference, and a key missing from another language falls back to it.
//
//   t('activity.empty')                     -> 'Nothing yet'
//   t('mac.freed', { size: '1.2 GB' })      -> 'Freed about 1.2 GB.'
//   t('time.min', { n: 3 })                 -> { one: '{n} minute', other: '{n} minutes' } picks by n
//   t('people.poke', null, 'list')          -> the whole array, for lines picked at random
//
// A value is a string with {name} slots, a { one, other } pair chosen by vars.n (Intl.PluralRules), an array, or, for the
// rare sentence the slots cannot express, a function (vars, t) => string. Numbers are not formatted for you: pass
// num(n) where a thousands separator belongs, not for ports or years.
//
// The office has one language, picked in Settings and kept by the server (data/prefs.json); the server renders the page
// with <html lang="…">, and code in the browser reads it from there. The server builds its own t with createT(lang).
import en from './locales/en/index.js';
import vi from './locales/vi/index.js';

export const LANGS = {
  en: { name: 'English', locale: 'en-US', dict: en },
  vi: { name: 'Tiếng Việt', locale: 'vi-VN', dict: vi },
};
export const DEFAULT_LANG = 'en';
export const pickLang = (l) => (typeof l === 'string' && Object.hasOwn(LANGS, l) ? l : DEFAULT_LANG);

const get = (dict, key) => { let o = dict; for (const k of key.split('.')) { if (o == null || typeof o !== 'object') return undefined; o = o[k]; } return o; };
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k]))) : s);
// The machine the office runs on, for {mac} (in a sentence) and {Mac} (a label): "Mac", "PC" or "computer". The server
// knows its platform; the page reads <html data-os>; the online demo is a pretend Mac.
const osName = () => {
  if (typeof document !== 'undefined') return document.documentElement.dataset.os || 'darwin';
  if (globalThis.process?.env?.OFFICE_STATIC === '1') return 'darwin';
  return globalThis.process?.platform || 'darwin';
};
const DEVICE_OS = (os) => (os === 'darwin' || os === 'win32' ? os : 'linux');

const made = new Map();
/** @param {string} lang */
export function createT(lang) {
  lang = pickLang(lang);
  if (made.has(lang)) return made.get(lang);
  const { dict, locale } = LANGS[lang], plural = new Intl.PluralRules(locale);
  const t = (key, vars, as) => {
    let v = get(dict, key);
    if (v === undefined && lang !== DEFAULT_LANG) v = get(en, key);
    if (v === undefined) return as === 'list' ? [] : key;
    if (as === 'list') return Array.isArray(v) ? v : [v];
    if (typeof v === 'function') return v(vars || {}, t);
    if (Array.isArray(v)) v = v[Math.floor(Math.random() * v.length)];
    else if (v && typeof v === 'object') v = v[plural.select(Number(vars?.n ?? 0))] ?? v.other;
    v = String(v);
    if (v.includes('{mac}') || v.includes('{Mac}')) {
      const os = DEVICE_OS(osName()), dev = (k) => get(dict, `common.device.${k}.${os}`) ?? get(en, `common.device.${k}.${os}`);
      vars = { mac: dev('mac'), Mac: dev('Mac'), ...vars };
    }
    return fill(v, vars);
  };
  t.lang = lang;
  t.locale = locale;
  t.num = (n, digits = 0) => Number(n || 0).toLocaleString(locale, { maximumFractionDigits: digits });
  made.set(lang, t);
  return t;
}

// In the browser: the page's language
const pageLang = () => (typeof document !== 'undefined' ? document.documentElement.lang : DEFAULT_LANG);
let here = null;
const current = () => (here && here.lang === pickLang(pageLang()) ? here : (here = createT(pageLang())));
/** @type {(key: string, vars?: object|null, as?: 'list') => any} */
export const t = (key, vars, as) => current()(key, vars, as);
export const num = (n, digits) => current().num(n, digits);
export const lang = () => current().lang;
export const locale = () => current().locale;
