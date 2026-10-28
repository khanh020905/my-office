// The camera toolbar: views, zoom, full screen, list mode, first person.
// Static markup: the office's code (src/office) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function CameraToolbar() {
  const t = await getT();
  const home = t('ui.cameraToolbar.home'), desks = t('ui.cameraToolbar.desks'), meeting = t('ui.cameraToolbar.meeting'), server = t('ui.cameraToolbar.server');
  return (
    <div className="toolbar" role="toolbar" aria-label={t('ui.cameraToolbar.label')}>
      <div className="tb-seg">
        <button type="button" className="seg-btn" data-view="home" aria-label={home} title={home} aria-pressed="true"><span data-icon="home"></span><span>{home}</span></button>
        <button type="button" className="seg-btn" data-view="desks" aria-label={desks} title={desks} aria-pressed="false"><span data-icon="monitor"></span><span>{desks}</span></button>
        <button type="button" className="seg-btn" data-view="meeting" aria-label={meeting} title={meeting} aria-pressed="false"><span data-icon="users"></span><span>{meeting}</span></button>
        <button type="button" className="seg-btn" data-view="server" aria-label={server} title={server} aria-pressed="false"><span data-icon="server"></span><span>{server}</span></button>
      </div>
      <span className="tb-sep"></span>
      <div className="tb-zoom"><button type="button" id="zoom-out" aria-label={t('ui.cameraToolbar.zoomOut')}><span data-icon="minus"></span></button><span id="zoom-val">100%</span><button type="button" id="zoom-in" aria-label={t('ui.cameraToolbar.zoomIn')}><span data-icon="plus"></span></button></div>
      <button type="button" className="tb-full" id="btn-full" aria-label={t('ui.cameraToolbar.fullscreen')}><span data-icon="maximize"></span></button>
      <button type="button" className="tb-full" id="btn-photo" aria-label={t('ui.photo.open')} title={t('ui.photo.openTitle')}><span data-icon="camera"></span></button>
      <button type="button" className="tb-full" id="btn-lite" aria-pressed="false" aria-label={t('ui.cameraToolbar.list')} title={t('ui.cameraToolbar.listTitle')}><span data-icon="list"></span></button>
      <span className="tb-sep"></span>
      <button type="button" className="tb-fp" id="btn-fp" aria-pressed="false" aria-label={t('ui.cameraToolbar.walkIn')} title={t('ui.cameraToolbar.walkInTitle')}><span data-icon="walk"></span><span>{t('ui.cameraToolbar.walkIn')}</span></button>
    </div>
  );
}
