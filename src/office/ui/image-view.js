// Images in the feed: a session that read, wrote or edited an image gets a thumbnail on that line (activity.js), and a
// click opens it here, large, over the office (the server serves it by id: GET /api/image). Esc, the ✕ or a click
// outside the picture closes it.
import { el } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { icon } from './icons.js';
import { t as tr } from '../../i18n/index.js';

export const imageUrl = (id) => `/api/image?id=${encodeURIComponent(id)}${TOKEN ? `&k=${encodeURIComponent(TOKEN)}` : ''}`;
let box = null;
function close() { if (!box || box.hidden) return; box.hidden = true; box.querySelector('img').removeAttribute('src'); }
export function openImage(id, name = '', who = '') {
  if (!box) {
    box = el('div', 'img-view'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const fig = el('figure', 'iv-fig'), img = el('img'), cap = el('figcaption', 'iv-cap'), x = el('button', 'iv-close'), msg = el('p', 'iv-msg');
    x.type = 'button'; x.setAttribute('aria-label', tr('activity.image.close')); x.append(icon('x'));
    fig.append(img, msg, cap); box.append(fig, x); document.body.append(box);
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.iv-close')) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    img.addEventListener('load', () => { box.classList.remove('is-loading'); msg.hidden = true; });
    img.addEventListener('error', () => { box.classList.remove('is-loading'); msg.hidden = false; msg.textContent = tr('activity.image.gone'); });
  }
  const img = box.querySelector('img'), cap = box.querySelector('.iv-cap');
  box.classList.add('is-loading'); box.querySelector('.iv-msg').hidden = true;
  img.alt = name; img.src = imageUrl(id);
  cap.replaceChildren(el('b', null, name), ...(who ? [el('span', null, who)] : []));
  box.hidden = false; box.querySelector('.iv-close').focus();
}
