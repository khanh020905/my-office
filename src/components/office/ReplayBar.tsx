// Replay: play, seek over the activity heat strip, range, speed, record.
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function ReplayBar() {
  const t = await getT();
  return (
    <div className="rp-bar" id="rp-bar" hidden role="region" aria-label={t('ui.replayBar.label')}>
      <div className="rp-top">
        <button className="rp-play" id="rp-play" type="button" aria-label={t('ui.replayBar.pause')}><span className="rp-ic" data-icon="pause"></span></button>
        <div className="rp-track">
          <canvas id="rp-heat" width="720" height="44" aria-hidden="true"></canvas>
          <input type="range" id="rp-seek" min="0" max="1000" step="1" defaultValue="0" aria-label={t('ui.replayBar.seek')} />
        </div>
        <div className="rp-time"><b id="rp-now">--:--</b><small id="rp-span">{t('ui.replayBar.loading')}</small></div>
      </div>
      <div className="rp-opts">
        <div className="pop-seg" id="rp-range" role="group" aria-label={t('ui.ranges.label')}>
          <button type="button" data-range="1h" aria-pressed="true" title={t('ui.ranges.h1Title')}>{t('ui.ranges.h1')}</button><button type="button" data-range="3h" aria-pressed="false" title={t('ui.ranges.h3Title')}>{t('ui.ranges.h3')}</button><button type="button" data-range="today" aria-pressed="false">{t('ui.ranges.today')}</button><button type="button" data-range="yesterday" aria-pressed="false">{t('ui.ranges.yesterday')}</button>
        </div>
        <div className="pop-seg" id="rp-speed" role="group" aria-label={t('ui.replayBar.speed')}>
          <button type="button" data-speed="10" aria-pressed="false">×10</button><button type="button" data-speed="30" aria-pressed="false">×30</button><button type="button" data-speed="60" aria-pressed="true">×60</button><button type="button" data-speed="120" aria-pressed="false">×120</button>
        </div>
        <button type="button" className="btn btn--sm rp-rec" id="rp-rec" aria-pressed="false"><span data-icon="rec"></span><span id="rp-rec-l">{t('ui.replayBar.record')}</span></button>
        <button type="button" className="btn btn--sm rp-close" id="rp-close"><span data-icon="x"></span>{t('ui.replayBar.backToLive')}</button>
      </div>
    </div>
  );
}
