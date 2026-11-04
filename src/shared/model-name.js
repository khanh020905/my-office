// A Claude model's name as people say it: the family alone for a name tag ("Sonnet"), or with its version for a list
// ("Sonnet 5.5"); '' for anything that isn't a Claude model id. Shared by the office's tags and its lists.
const RE = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?!\d)/;
const cap = (w) => w[0].toUpperCase() + w.slice(1);
export const modelFamily = (m) => { const x = RE.exec(m || ''); return x ? cap(x[1]) : ''; };
export const modelLong = (m) => { const x = RE.exec(m || ''); return x ? `${cap(x[1])} ${x[2]}${x[3] ? `.${x[3]}` : ''}` : ''; };
// A chip for any model id: "Opus 4.7" when it is a Claude id, otherwise the id itself, shortened.
export const modelLabel = (m) => {
  const long = modelLong(m);
  if (long) return long;
  const s = String(m || '').trim();
  if (!s || /^default$/i.test(s)) return '';
  return s.length > 22 ? `${s.slice(0, 20)}…` : s;
};
