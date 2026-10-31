// What eats your plan: where Claude Code's usage goes, by model, MCP server, skill, plugin, subagent, project and session.
// Static markup: the office's code (src/office/ui/burn.js) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function BurnDrawer() {
  const t = await getT();
  return (
    <aside className="drawer drawer--wide" id="dr-burn" hidden aria-label={t('burn.title')}>
      <header className="dr-head">
        <div className="dr-title"><h2>{t('burn.title')}</h2><p id="burn-at">{t('burn.loading')}</p></div>
        <button className="icon-btn" type="button" data-close aria-label={t('common.close')}><span data-icon="x"></span></button>
      </header>
      <div className="tabs bn-range" role="tablist" id="burn-range">
        <button className="tab" type="button" role="tab" data-range="today" aria-selected="true">{t('burn.today')}</button>
        <button className="tab" type="button" role="tab" data-range="7d" aria-selected="false">{t('burn.week')}</button>
      </div>
      <div className="dr-body" id="burn-body"><p className="muted">{t('burn.loading')}</p></div>
    </aside>
  );
}
