// The right column: today's numbers, the timeline button, filters and the activity feed.
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function ActivityPanel() {
  const t = await getT();
  return (
    <aside className="side side-right" id="feed" aria-label={t('ui.activityPanel.title')}>
      <button className="act-head" id="feed-toggle" type="button" aria-expanded="false"><span className="act-title">{t('ui.activityPanel.title')}</span><span className="live-tag" id="live-tag"><i></i><span>{t('ui.activityPanel.live')}</span></span></button>
      <div className="kpis" id="feed-stats" aria-label={t('ui.activityPanel.today')}></div>
      <button type="button" className="tl-open" id="tl-open"><span data-icon="timeline"></span><b>{t('ui.activityPanel.timeline')}</b><span className="tl-open-v" id="tl-open-v">{t('ui.activityPanel.timelineSub')}</span></button>
      <button type="button" className="tl-open" id="wrap-open"><span data-icon="trophy"></span><b>{t('ui.activityPanel.wrapped')}</b><span className="tl-open-v">{t('ui.activityPanel.wrappedSub')}</span></button>
      <div className="seg" role="group" aria-label={t('ui.activityPanel.filter')}>
        <button type="button" id="flt-all" aria-pressed="true"><span data-icon="list"></span><span>{t('ui.activityPanel.all')}</span></button>
        <button type="button" id="flt-att" aria-pressed="false"><i className="red-dot"></i><span>{t('ui.activityPanel.attention')}</span><b id="att-count" hidden></b></button>
      </div>
      <div className="type-chips" id="type-chips" role="group" aria-label={t('ui.activityPanel.types')}>
        <button type="button" data-k="cmd" aria-pressed="false"><span data-icon="terminal"></span>{t('ui.activityPanel.cmd')}</button>
        <button type="button" data-k="edit" aria-pressed="false"><span data-icon="pencil"></span>{t('ui.activityPanel.edit')}</button>
        <button type="button" data-k="read" aria-pressed="false"><span data-icon="file"></span>{t('ui.activityPanel.read')}</button>
        <button type="button" data-k="web" aria-pressed="false"><span data-icon="globe"></span>{t('ui.activityPanel.web')}</button>
        <button type="button" data-k="agent" aria-pressed="false"><span data-icon="users"></span>{t('ui.activityPanel.agent')}</button>
      </div>
      <ul className="feed-list" id="feed-list"><li className="fi-empty">{t('ui.activityPanel.empty')}</li></ul>
    </aside>
  );
}
