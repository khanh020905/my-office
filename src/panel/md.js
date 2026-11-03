// A small markdown reader for a plan in the narrow panel. Text nodes only: the plan's text is never put in innerHTML.
// (The office's own mdBlocks lives in the 3D world's module graph and has a copy button; the panel stays light.)
import { el } from './fmt.js';

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/;
function inline(parent, text) {
  for (const bit of String(text).split(INLINE)) {
    if (!bit) continue;
    let m;
    if (bit.startsWith('`') && bit.endsWith('`') && bit.length > 2) parent.append(el('code', null, bit.slice(1, -1)));
    else if (bit.startsWith('**') && bit.endsWith('**') && bit.length > 4) parent.append(el('strong', null, bit.slice(2, -2)));
    else if ((m = /^\[([^\]]+)\]\([^)\s]+\)$/.exec(bit))) parent.append(m[1]);   // (a link: its words, nothing to open from here)
    else parent.append(bit);
  }
}
const LIST = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
export function planBlocks(text) {
  const frag = document.createDocumentFragment(), lines = String(text ?? '').replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if (/^\s*```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++; frag.append(el('pre', null, code.join('\n'))); continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { const h = el('h4'); inline(h, m[2].replace(/\s#+\s*$/, '')); frag.append(h); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { frag.append(el('hr')); i++; continue; }
    if (LIST.test(line)) {
      const ul = el('ul');
      while (i < lines.length && LIST.test(lines[i])) {
        const lm = LIST.exec(lines[i]), li = el('li');
        li.style.marginLeft = `${Math.min(3, Math.floor(lm[1].replace(/\t/g, '  ').length / 2)) * 12}px`;
        if (/\d/.test(lm[2])) li.dataset.n = lm[2];
        inline(li, lm[3]); ul.append(li); i++;
      }
      frag.append(ul); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++].replace(/^\s*>\s?/, ''));
    const p = el('p'); inline(p, para.join(' ')); frag.append(p);
  }
  return frag;
}
