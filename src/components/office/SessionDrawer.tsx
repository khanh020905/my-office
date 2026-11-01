// The drawer for one session: counts, conversation, subagents, activity.
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function SessionDrawer() {
  const t = await getT();
  return (
    <aside className="drawer" id="dr-session" hidden aria-label={t('ui.sessionDrawer.label')}>
      <header className="dr-head">
        <span className="dr-dot" id="ds-dot"></span>
        <div className="dr-title"><h2 id="ds-name"></h2><p id="ds-dir"></p><p className="ds-cache" id="ds-cache" title={t('drawer.cache.title')} hidden></p></div>
        <span className="pill" id="ds-status"></span>
        <button className="icon-btn" type="button" data-close aria-label={t('common.close')}><span data-icon="x"></span></button>
      </header>
      <div className="dr-actions" id="ds-actions"></div>
      <ul className="counts">
        <li><b id="ds-read">0</b><span>{t('ui.sessionDrawer.read')}</span></li>
        <li><b id="ds-edit">0</b><span>{t('ui.sessionDrawer.edit')}</span></li>
        <li><b id="ds-cmd">0</b><span>{t('ui.sessionDrawer.cmd')}</span></li>
        <li><b id="ds-time">–</b><span>{t('ui.sessionDrawer.time')}</span></li>
        <li><b id="ds-ctx">–</b><span>{t('ui.sessionDrawer.ctx')}</span></li>
        <li><b id="ds-cost">–</b><span>{t('ui.sessionDrawer.cost')}</span></li>
      </ul>
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" id="tab-chat" aria-selected="true" type="button">{t('ui.sessionDrawer.chat')}</button>
        <button className="tab" role="tab" id="tab-subs" aria-selected="false" type="button">{t('ui.sessionDrawer.subs')}</button>
        <button className="tab" role="tab" id="tab-act" aria-selected="false" type="button">{t('ui.sessionDrawer.activity')}</button>
        <button className="tab" role="tab" id="tab-pins" aria-selected="false" type="button">{t('drawer.pins.tab')}</button>
      </div>
      <div className="dr-body" id="ds-body"></div>
    </aside>
  );
}
