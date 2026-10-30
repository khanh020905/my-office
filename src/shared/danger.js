// Shell commands that deserve a second look before "allow": on the Mac a red warning, a second click and no "always";
// from a phone, not at all (deny or leave it to the Mac). Used by the page (ui/permissions.js) and by the server, which
// checks what a phone may answer. Patterns adapted from cubicle-crew (MIT, public/util.js). The key names the reason,
// under perm.danger in the locales.
export const DANGER = [
  [/\brm\b(?=[^|;&]*\s-\w*r)(?=[^|;&]*\s-\w*f)/i, 'rmRf'],
  [/\bgit\s+push\b[^|;&]*\s(?:--force|-f\b|--delete\b)/i, 'gitPush'],
  [/\bgit\s+(?:reset\s+--hard|clean\s+-\w*f|branch\s+-D\b|filter-(?:branch|repo)\b)/, 'gitReset'],
  [/\b(?:terraform|tofu|pulumi)\s+(?:apply|destroy|up)\b/i, 'infra'],
  [/\bkubectl\s+(?:delete|apply|drain)\b|\bhelm\s+(?:uninstall|delete)\b/i, 'kube'],
  [/\bdocker\s+(?:system\s+prune|volume\s+(?:rm|prune))\b/i, 'docker'],
  [/\b(?:drop\s+(?:table|database|schema)|truncate\s+table)\b/i, 'sql'],
  [/\b(?:npm|pnpm|yarn|cargo)\s+publish\b|\bgh\s+(?:repo|release)\s+delete\b/i, 'publish'],
  [/\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/i, 'pipeSh'],
  [/\bchmod\s+-R\s+777\b|\bmkfs\b|\bdd\s+if=/i, 'system'],
  [/\bsudo\b/, 'sudo'],
  [/\bprod(?:uction)?\b/i, 'prod'],
];
/** The reason a permission request is risky (a key under perm.danger), or null. p: { kind, type, detail }. */
export function dangerKey(p) {
  if ((p?.kind || 'perm') !== 'perm' || p.type !== 'bash') return null;
  return DANGER.find(([re]) => re.test(p.detail || ''))?.[1] || null;
}
