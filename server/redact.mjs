// Masks secrets (API keys, tokens, passwords, credentials in URLs, IPs, long opaque strings) in anything shown in
// the UI: commands, prompts, transcripts, process labels. Shared by server.mjs and system.mjs.
const REDACT = [
  [/(\bbearer\s+)[^\s"']+/gi, '$1•••'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '•••'],
  [/\bgh[pousr]_[A-Za-z0-9]{10,}/g, '•••'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/g, '•••'],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g, '•••'],
  [/(\b(?:api[_-]?key|access[_-]?key|token|secret|password|passwd|pwd|authorization|cookie)\b["']?\s*[:=]\s*["']?)[^\s"'&]+/gi, '$1•••'],
  [/(\/\/)[^\s/:@]+:[^\s/@]+@/g, '$1•••@'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '•••'],
  [/[A-Za-z0-9+_-]{32,}={0,2}/g, '•••'],
];
export const redact = (s) => REDACT.reduce((acc, [re, rep]) => acc.replace(re, rep), String(s ?? ''));
