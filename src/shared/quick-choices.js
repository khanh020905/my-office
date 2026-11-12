// Quick-reply choices: the lettered or numbered options at the end of an agent's message ("A) push", "2. delete").
// Returns [{ key, label, reply }] (2 to 5 of them), or [] when the tail of the text is not such a list.
const OPT = /^\s*(?:[-*]\s+)?\**(\d{1,2}|[A-Za-z])\**[.)]\**\s+(.+?)\s*$/;

export function quickChoices(text) {
  const lines = String(text || '').trimEnd().split('\n'), out = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = OPT.exec(lines[i]);
    if (!m) break;   // (the list must be the very end of the message)
    out.unshift({ key: m[1], label: m[2].replace(/\*+/g, '').slice(0, 80), reply: m[1] });
  }
  // a real list counts up from the first key (A B C / 1 2 3), not a stray "v2." line
  const ok = out.length >= 2 && out.length <= 5 && out.every((o, i) => o.key.toLowerCase() === (/\d/.test(out[0].key) ? String(+out[0].key + i) : String.fromCharCode(out[0].key.toLowerCase().charCodeAt(0) + i)));
  return ok ? out : [];
}
