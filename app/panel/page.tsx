import PanelBoot from '@/components/PanelBoot';
import { getT } from '@/i18n/server';
import '@/styles/panel.css';

// The small panel (src/panel/main.js): who is working, who waits for you, the plans' limits; no 3D. For a narrow place
// the office is always in: the editor's side bar (vscode-extension/), the Mac's menu bar (menubar/). ?embed=ide|menubar.
export default async function PanelPage() {
  const t = await getT();
  return (
    <div id="panel" className="pn">
      <header className="pn-head">
        <b className="pn-brand"><svg className="pn-logo" viewBox="0 0 32 32" width="16" height="16" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#121822" /><path transform="translate(4 4.5)" fill="#EF8A5F" fillRule="evenodd" d="M7 2h10a3 3 0 0 1 3 3v17H4V5a3 3 0 0 1 3-3zM7.5 6h3v3h-3zM13.5 6h3v3h-3zM7.5 11h3v3h-3zM13.5 11h3v3h-3zM10.2 17h3.6v5h-3.6z" /></svg>My Office</b>
        <span className="pn-sum" id="pn-sum">{t('panel.connecting')}</span>
      </header>
      <main id="pn-body" className="pn-body" aria-live="polite"></main>
      <footer className="pn-foot">
        <button type="button" className="pn-btn" data-open="office">{t('panel.open3d')}</button>
        <button type="button" className="pn-btn pn-btn--ghost" data-open="2d">{t('panel.open2d')}</button>
        <small className="pn-keys">{t('panel.keys')}</small>
      </footer>
      <PanelBoot />
    </div>
  );
}
