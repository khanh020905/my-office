// Opening the office on a phone: QR code and PIN.
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function PhoneModal() {
  const t = await getT();
  return (
    <div className="modal" id="phone-modal" hidden>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="pm-title">
        <h2 id="pm-title">{t('ui.phoneModal.title')}</h2>
        <div id="pm-body"></div>
        <button className="btn" type="button" data-close>{t('common.close')}</button>
      </div>
    </div>
  );
}
