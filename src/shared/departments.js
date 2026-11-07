// The ten production departments (spec §6) and which one a real agent event belongs to. Shared by the server and the page;
// it carries no words (the page names departments with tr('world.dept.<id>')). Honesty rule: an event we cannot place
// returns null, never a guessed department.

export const DEPARTMENTS = [
  { id: 'director', accent: '#D97757' },
  { id: 'research', accent: '#3F7CC4' },
  { id: 'script', accent: '#6A8042' },
  { id: 'storyboard', accent: '#8C4FA8' },
  { id: 'visual', accent: '#C9A227' },
  { id: 'animation', accent: '#2E9C8F' },
  { id: 'audio', accent: '#B5487A' },
  { id: 'editing', accent: '#5B6BBF' },
  { id: 'qa', accent: '#C2413B' },
  { id: 'library', accent: '#7A6A55' },
];
export const DEPT_IDS = DEPARTMENTS.map((d) => d.id);

// file or command words -> department, checked in order (first match wins)
const BY_WORD = [
  [/video_qa|video-qa|\bqa\b|review|contact.?sheet/i, 'qa'],
  [/ffmpeg|render|remotion|\.mp4\b|mux|export/i, 'editing'],
  [/storyboard|shot.?list|shots?\.json/i, 'storyboard'],
  [/\b(audio|music|sfx|voice|narration|whisper)\b|\.(wav|mp3|m4a)\b/i, 'audio'],
  [/anim|scenes?\//i, 'animation'],
  [/\.(png|jpe?g|svg|webp)\b|style|asset|image/i, 'visual'],
  [/script|\.srt\b|\.vtt\b|caption|subtitle/i, 'script'],
];
// subagent type words -> department
const BY_ROLE = [
  [/qa|review|test/i, 'qa'], [/research|explore|search/i, 'research'], [/script|narrat|writ/i, 'script'],
  [/storyboard|plan/i, 'storyboard'], [/visual|design|style|art/i, 'visual'], [/anim/i, 'animation'],
  [/audio|sound|music/i, 'audio'], [/edit|render/i, 'editing'], [/director|lead/i, 'director'],
];
const match = (table, s) => { for (const [re, id] of table) if (re.test(s)) return id; return null; };

// A normalised agent event (src/shared/agent-events.js normalize) -> department id, or null when the event says nothing.
export function deptOf(n) {
  if (!n || typeof n !== 'object') return null;
  const label = n.label || '', type = n.type || '';
  if (n.runner) return 'qa';
  if (type === 'substart' && n.name) return match(BY_ROLE, n.name);
  if (type === 'prompt' || type === 'start' || type === 'wait' || type === 'stop') return 'director';
  const w = match(BY_WORD, label);
  if (w) return w;
  if (type === 'web') return 'research';
  if (type === 'read' || type === 'grep') return 'library';
  return null;
}
