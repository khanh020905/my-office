// First-person mode: crosshair, help, the nearby-person button, the touch joystick.
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function FirstPersonHud() {
  const t = await getT();
  return (
    <div className="fp-hud" id="fp-hud" hidden>
      <i className="fp-cross" aria-hidden="true"></i>
      <button type="button" className="fp-near" id="fp-near" hidden></button>
      <div className="fp-help"><b>{t('ui.firstPersonHud.title')}</b><span className="fp-keys">{t('ui.firstPersonHud.keys')}</span><span className="fp-touch">{t('ui.firstPersonHud.touch')}</span></div>
      <button type="button" className="fp-exit" id="fp-exit"><span data-icon="x"></span><span>{t('ui.firstPersonHud.exit')}</span></button>
      <div className="fp-joy" id="fp-joy" aria-hidden="true"><i></i></div>
    </div>
  );
}
