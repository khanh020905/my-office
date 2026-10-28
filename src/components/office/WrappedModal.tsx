// The week in review: a picture card (the office plus the week's numbers) to save or copy.
// Static markup: src/office/ui/wrapped.js draws the card and wires the buttons.
import { getT } from '@/i18n/server';

export default async function WrappedModal() {
  const t = await getT();
  return (
    <div className="modal" id="wrap-modal" hidden>
      <div className="modal-card wrap-card" role="dialog" aria-modal="true" aria-labelledby="wrap-title">
        <h2 id="wrap-title">{t('ui.wrapped.title')}</h2>
        <canvas id="wrap-canvas" width={1080} height={1350} aria-label={t('ui.wrapped.card')}></canvas>
        <p className="wrap-note" id="wrap-note">{t('wrapped.loading')}</p>
        <div className="wrap-actions">
          <button className="btn btn--primary" type="button" id="wrap-save">{t('ui.wrapped.save')}</button>
          <button className="btn" type="button" id="wrap-copy">{t('ui.wrapped.copy')}</button>
          <button className="btn" type="button" data-close>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
