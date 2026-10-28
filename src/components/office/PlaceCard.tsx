// The card that opens over a place (library, pantry, lift…).
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function PlaceCard() {
  const t = await getT();
  return (
    <section className="plc" id="plc" hidden role="dialog" aria-labelledby="plc-title">
      <header className="plc-head">
        <span className="plc-ico" id="plc-ico"></span>
        <div className="plc-title"><h3 id="plc-title"></h3><p id="plc-sub"></p></div>
        <button type="button" className="icon-btn" id="plc-close" aria-label={t('common.close')}><span data-icon="x"></span></button>
      </header>
      <div className="plc-body" id="plc-body"></div>
      <footer className="plc-foot" id="plc-foot" hidden></footer>
    </section>
  );
}
