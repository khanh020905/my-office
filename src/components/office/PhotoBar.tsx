// Photo mode's bar: names and the logo on or off, day or night, the picture's size, a 15-second clip, the shutter, and
// the way out.
// Static markup: src/office/ui/photo.js drives it.
import { getT } from '@/i18n/server';

export default async function PhotoBar() {
  const t = await getT();
  const seg = (attr: string, items: [string, string][], on: string) => items.map(([v, label]) => (
    <button key={v} type="button" {...{ [attr]: v }} aria-pressed={v === on ? 'true' : 'false'}>{label}</button>
  ));
  return (
    <div className="photo-bar" id="photo-bar" hidden role="toolbar" aria-label={t('ui.photo.label')}>
      <p className="photo-hint">{t('ui.photo.hint')}</p>
      <div className="pb-row">
        <button type="button" className="pb-tgl" id="ph-names" aria-pressed="true">{t('ui.photo.names')}</button>
        <button type="button" className="pb-tgl" id="ph-mark" aria-pressed="true">{t('ui.photo.mark')}</button>
        <span className="pb-sep"></span>
        <div className="pb-seg">{seg('data-ph-time', [['auto', t('ui.topBar.auto')], ['day', t('ui.topBar.day')], ['night', t('ui.topBar.night')]], 'auto')}</div>
        <span className="pb-sep"></span>
        <div className="pb-seg" title={t('ui.photo.sizeTitle')}>{seg('data-ph-size', [['screen', t('ui.photo.screen')], ['fhd', 'Full HD'], ['4k', '4K']], 'fhd')}</div>
        <button type="button" className="pb-clip" id="ph-clip" title={t('ui.clip.buttonTitle')}><span data-icon="rec"></span><span>{t('ui.clip.button')}</span></button>
        <button type="button" className="pb-shoot" id="ph-shoot"><span data-icon="camera"></span><span>{t('ui.photo.shoot')}</span></button>
        <button type="button" className="pb-exit" id="ph-exit" aria-label={t('ui.photo.exit')} title={t('ui.photo.exit')}><span data-icon="x"></span></button>
      </div>
    </div>
  );
}
