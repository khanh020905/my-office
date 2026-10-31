// Settings: four tabs of picture cards instead of a long list. Office (floor plan, scenery, time of day, real weather),
// Characters (the two looks, drawn live by the office's renderer), Display (graphics, language, what shows on screen)
// and More (phone, alerts, behaviour). Static markup: src/office/ui/settings.js drives it; ids and data-* stay as the
// office's code expects them.
import { LANGS } from '@/i18n/index.js';
import { getT } from '@/i18n/server';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const LAYOUTS = ['cozy', 'pro', 'hq'] as const;
const SCENES = [['city', 'sc-city'], ['country', 'sc-country'], ['beach', 'sc-beach']] as const;
const TIMES = ['auto', 'day', 'night'] as const;
const LOOKS = ['toy', 'pixar'] as const;
const QUALITY = [['auto', 0], ['low', 1], ['medium', 2], ['high', 3]] as const;
const CITIES = [['hn', 'Hà Nội'], ['hcm', ''], ['dn', 'Đà Nẵng'], ['hue', 'Huế'], ['hp', 'Hải Phòng'], ['ct', 'Cần Thơ'], ['dl', 'Đà Lạt'], ['nt', 'Nha Trang']] as const;
const TIME_ICON = { auto: 'clock', day: 'sun', night: 'moon' } as const;
const LOOP_N = [2, 3, 4, 5], LOOP_MIN = [5, 10, 20, 30];   // (the server's choices: server/loops.mjs)

export default async function SettingsPanel() {
  const t = await getT();
  const toggle = (k: string, on: boolean) => (
    <button key={k} type="button" className="tgl" data-tgl={k} role="switch" aria-checked={on ? 'true' : 'false'}><span>{t(`ui.topBar.toggles.${k}`)}</span><i></i></button>
  );
  return (
    <div className="pop pop-settings" id="pop-look" hidden role="dialog" aria-label={t('ui.topBar.settings')}>
      <div className="st-head">
        <b>{t('ui.topBar.settings')}</b>
        <button type="button" className="st-close" id="st-close" aria-label={t('common.close')}><span data-icon="x"></span></button>
      </div>
      <div className="st-tabs" role="tablist">
        {(['office', 'people', 'display', 'more'] as const).map((k, i) => (
          <button key={k} type="button" role="tab" id={`st-tab-${k}`} aria-controls={`st-panel-${k}`} aria-selected={i === 0 ? 'true' : 'false'} data-st-tab={k}>{t(`settings.tabs.${k}`)}</button>
        ))}
      </div>

      <div className="st-body">
        <section className="st-panel" id="st-panel-office" role="tabpanel" aria-labelledby="st-tab-office" data-st-panel="office">
          <h3>{t('ui.topBar.office')}</h3>
          <div className="st-cards st-cards--3">
            {LAYOUTS.map((l) => (
              <button key={l} type="button" className="scene st-layout" data-layout={l} aria-pressed="false">
                {/* eslint-disable-next-line @next/next/no-img-element -- a small static picture, no optimisation needed */}
                <img className="sc-art st-shot" src={`${BASE}/assets/thumbs/layout-${l}.jpg`} alt="" loading="lazy" decoding="async" />
                <b>{t(`settings.layouts.${l}.name`)}</b><small>{t(`settings.layouts.${l}.sub`)}</small>
              </button>
            ))}
          </div>
          <p className="pop-note">{t('settings.layoutNote')}</p>

          <h3>{t('ui.topBar.scenery')}</h3>
          <div className="st-cards st-cards--3">
            {SCENES.map(([k, art]) => (
              <button key={k} type="button" className="scene" data-scene={k} aria-pressed="false"><span className={`sc-art ${art}`}></span><b>{t(`ui.topBar.scenes.${k}`)}</b><small>{t(`ui.topBar.scenes.${k}Sub`)}</small></button>
            ))}
          </div>

          <h3>{t('ui.topBar.time')}</h3>
          <div className="st-cards st-cards--3">
            {TIMES.map((k) => (
              <button key={k} type="button" className="scene" data-time={k} aria-pressed={k === 'auto' ? 'true' : 'false'}>
                <span className={`sc-art st-time st-time--${k}`}><span data-icon={TIME_ICON[k]}></span></span>
                <b>{t(`settings.times.${k}.name`)}</b><small>{t(`settings.times.${k}.sub`)}</small>
              </button>
            ))}
          </div>

          <h3>{t('ui.topBar.weather')}</h3>
          <div className="wx-chips" id="wx-cities" role="group" aria-label={t('ui.topBar.weatherCity')}>
            <button type="button" data-wx="" aria-pressed="true">{t('settings.weatherOff')}</button>
            {CITIES.map(([k, name]) => <button key={k} type="button" data-wx={k} aria-pressed="false">{name || t('life.weather.hcm')}</button>)}
          </div>
          <p className="pop-note wx-now" id="wx-now">{t('ui.topBar.weatherHint')}</p>
          <div className="pop-toggles">{toggle('season', true)}</div>
        </section>

        <section className="st-panel" id="st-panel-people" role="tabpanel" aria-labelledby="st-tab-people" data-st-panel="people" hidden>
          <h3>{t('ui.topBar.characters')}</h3>
          <div className="st-cards st-cards--2">
            {LOOKS.map((l) => (
              <button key={l} type="button" className="scene st-look" data-look={l} aria-pressed="false">
                <span className="sc-art st-portrait" data-portrait={l}><span className="st-spin" aria-hidden="true"></span></span>
                <b>{t(`ui.topBar.${l}`)}</b><small>{t(`settings.looks.${l}.sub`)}</small>
              </button>
            ))}
          </div>
          <p className="pop-note">{t('settings.lookNote')}</p>
        </section>

        <section className="st-panel" id="st-panel-display" role="tabpanel" aria-labelledby="st-tab-display" data-st-panel="display" hidden>
          <h3>{t('settings.graphics')}</h3>
          <div className="st-cards st-cards--4">
            {QUALITY.map(([q, bars]) => (
              <button key={q} type="button" className="scene" data-quality={q} aria-pressed={q === 'auto' ? 'true' : 'false'}>
                <span className="sc-art st-q">{bars ? <span className="q-bars" data-n={bars}><i></i><i></i><i></i></span> : <span data-icon="sparkle"></span>}</span>
                <b>{t(`settings.q.${q}`)}</b><small>{t(`settings.qSub.${q}`)}</small>
              </button>
            ))}
          </div>
          <p className="pop-note" id="q-note"></p>

          <h3>{t('settings.language')}</h3>
          <div className="st-cards st-cards--2">
            {Object.entries(LANGS).map(([code, l]) => (
              <button key={code} type="button" className="scene st-lang" lang={code} data-lang={code} aria-pressed={code === t.lang ? 'true' : 'false'}>
                <span className="st-code">{code.toUpperCase()}</span><b>{l.name}</b>
              </button>
            ))}
          </div>

          <h3>{t('ui.topBar.more')}</h3>
          <div className="pop-toggles">{toggle('zones', false)}{toggle('stream', false)}{toggle('autocam', true)}</div>
        </section>

        <section className="st-panel" id="st-panel-more" role="tabpanel" aria-labelledby="st-tab-more" data-st-panel="more" hidden>
          <div className="st-group">
          <h3>{t('settings.notify')}</h3>
          <div className="pop-acts">
            <button id="btn-phone" className="tb-btn" type="button" hidden><span data-icon="phone"></span><span className="lbl">{t('ui.topBar.phone')}</span></button>
            <button id="btn-bell" className="tb-btn" type="button" aria-pressed="false" hidden><span data-icon="bell"></span><span className="lbl">{t('ui.topBar.bell')}</span><i className="badge" id="bell-dot" hidden></i></button>
          </div>
          </div>
          <h3>{t('settings.behaviour')}</h3>
          <div className="pop-toggles">{toggle('sound', true)}{toggle('perm', true)}</div>
          <div className="pop-acts"><button id="btn-tips" className="tb-btn" type="button"><span data-icon="sparkle"></span><span className="lbl">{t('tips.again')}</span></button></div>
          {/* the stuck-loop breaker (src/office/ui/stuck.js fills it in from the server; hidden in the demo) */}
          <div className="st-loop" id="st-loop" hidden>
            <h3>{t('settings.loop.title')}</h3>
            <div className="pop-toggles"><button type="button" className="tgl" data-loop-tgl="" role="switch" aria-checked="true"><span>{t('settings.loop.on')}</span><i></i></button></div>
            <p className="pop-note">{t('settings.loop.note')}</p>
            <div className="st-loop-row"><span>{t('settings.loop.after')}</span>
              <div className="seg">{LOOP_N.map((n) => <button key={n} type="button" data-loop-n={n} aria-pressed={n === 3 ? 'true' : 'false'}>{t('settings.loop.tries', { n })}</button>)}</div></div>
            <div className="st-loop-row"><span>{t('settings.loop.costAfter')}</span>
              <div className="seg">{LOOP_MIN.map((n) => <button key={n} type="button" data-loop-min={n} aria-pressed={n === 10 ? 'true' : 'false'}>{t('settings.loop.mins', { n })}</button>)}</div></div>
            <p className="pop-note st-loop-install" id="st-loop-install" hidden>{t('settings.loop.install')}</p>
          </div>
          {/* the prompt cache's clock: the cups on the desks, and a phone told before a session waiting for you goes cold (src/office/ui/cache-words.js; hidden in the demo) */}
          <div className="st-cache" id="st-cache" hidden>
            <h3>{t('settings.cache.title')}</h3>
            <p className="pop-note">{t('settings.cache.note')}</p>
            <div className="pop-toggles"><button type="button" className="tgl" data-cache-nudge="" role="switch" aria-checked="false"><span>{t('settings.cache.nudge')}</span><i></i></button></div>
          </div>
        </section>
      </div>
    </div>
  );
}
