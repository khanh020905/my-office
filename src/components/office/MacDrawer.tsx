// The Mac drawer: memory, CPU, disk, dev servers, cleanup.
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function MacDrawer() {
  const t = await getT();
  return (
    <aside className="drawer drawer--wide" id="dr-mac" hidden aria-label={t('ui.macDrawer.title')}>
      <header className="dr-head">
        <div className="dr-title"><h2>{t('ui.macDrawer.title')}</h2><p id="mac-at">{t('ui.macDrawer.measuring')}</p></div>
        <button className="btn btn--sm" type="button" id="mac-refresh">{t('ui.macDrawer.refresh')}</button>
        <button className="icon-btn" type="button" data-close aria-label={t('common.close')}><span data-icon="x"></span></button>
      </header>
      <div className="dr-body" id="mac-body"><p className="muted">{t('ui.macDrawer.loading')}</p></div>
    </aside>
  );
}
