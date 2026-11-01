// "Kho lịch sử": every conversation's words, kept after Claude Code deletes its transcript (server/vault.mjs).
// Static markup: the office's code (src/office/ui/vault.js) finds these elements by id and fills them in.
import { getT } from '@/i18n/server';

export default async function VaultDrawer() {
  const t = await getT();
  return (
    <aside className="drawer drawer--wide" id="dr-vault" hidden aria-label={t('vault.title')}>
      <header className="dr-head">
        <div className="dr-title"><h2>{t('vault.title')}</h2><p id="vault-at">{t('vault.loading')}</p></div>
        <button className="icon-btn" type="button" data-close aria-label={t('common.close')}><span data-icon="x"></span></button>
      </header>
      <div className="tabs vl-tabs" role="tablist" id="vault-tabs">
        <button className="tab" type="button" role="tab" data-vt="list" aria-selected="true">{t('vault.tabList')}</button>
        <button className="tab" type="button" role="tab" data-vt="report" aria-selected="false">{t('vault.tabReport')}</button>
      </div>
      <div className="vl-search"><input id="vault-q" type="search" placeholder={t('vault.search')} aria-label={t('vault.search')} autoComplete="off" spellCheck={false} /></div>
      <div className="dr-body" id="vault-body"><p className="muted">{t('vault.loading')}</p></div>
    </aside>
  );
}
