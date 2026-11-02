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
        <b className="pn-brand"><span className="pn-logo" aria-hidden="true"></span>My Office</b>
        <span className="pn-sum" id="pn-sum">{t('panel.connecting')}</span>
      </header>
      <main id="pn-body" className="pn-body" aria-live="polite"></main>
      <footer className="pn-foot">
        <button type="button" className="pn-btn" data-open="office">{t('panel.open3d')}</button>
        <button type="button" className="pn-btn pn-btn--ghost" data-open="2d">{t('panel.open2d')}</button>
      </footer>
      <PanelBoot />
    </div>
  );
}
