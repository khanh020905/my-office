// The left column: session counts, search and the session list.
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function SessionRail() {
  const t = await getT();
  return (
    <aside className="side side-left" aria-label={t('ui.sessionRail.title')}>
      <div className="lp-head">
        <div className="lp-title"><h2>{t('ui.sessionRail.title')}</h2><p className="conn" id="conn" data-state="off"><i></i><span>{t('ui.sessionRail.connecting')}</span></p></div>
        <p className="lp-sub" id="active-count">{t('ui.sessionRail.loading')}</p>
        <div className="st-row" role="group" aria-label={t('ui.sessionRail.statusFilter')}>
          <button type="button" className="st" data-st="work" aria-pressed="false"><i></i><b id="st-work">0</b><span>{t('ui.sessionRail.work')}</span></button>
          <button type="button" className="st" data-st="wait" aria-pressed="false"><i></i><b id="st-wait">0</b><span>{t('ui.sessionRail.wait')}</span></button>
          <button type="button" className="st" data-st="rest" aria-pressed="false"><i></i><b id="st-rest">0</b><span>{t('ui.sessionRail.rest')}</span></button>
        </div>
        <label className="search"><span data-icon="search"></span><input id="sess-search" type="search" placeholder={t('ui.sessionRail.search')} autoComplete="off" aria-label={t('ui.sessionRail.searchLabel')} /></label>
      </div>
      <ul className="sess-list" id="rail-list"></ul>
    </aside>
  );
}
