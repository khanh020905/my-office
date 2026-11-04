// The panel by keyboard: ↑ ↓ through the sessions (Enter brings one's window up, as a click does), Y / N for the first
// request to approve (a risky one wants Y twice, as its button does), Esc closes the menu bar's popover. The menu bar
// app opens the panel from anywhere with ⌃⌥O (menubar/MyOfficeBar.swift). Never while typing in a box.
const typing = (t) => !!t?.closest?.('input, textarea, select, [contenteditable="true"]');

export function startKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || typing(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 'arrowup') {
      const rows = [...document.querySelectorAll('.pn-sess:not(:disabled)')];
      if (!rows.length) return;
      const i = rows.indexOf(document.activeElement);
      const next = rows[k === 'arrowdown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)];
      next.focus(); next.scrollIntoView({ block: 'nearest' });
      e.preventDefault();
    } else if (k === 'y' || k === 'n') {
      // (a tool's request: the cards with a deny button; questions and plans are answered in their own boxes)
      const card = [...document.querySelectorAll('.pn-perm')].find((c) => c.querySelector('.pn-btn--no'));
      const b = card?.querySelector(k === 'y' ? '.pn-btn--ok' : '.pn-btn--no');
      if (b && !b.disabled) { b.click(); e.preventDefault(); }
    } else if (k === 'escape') window.webkit?.messageHandlers?.bar?.postMessage('close');   // (the menu bar's popover only)
  });
}
