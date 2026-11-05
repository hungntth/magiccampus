// "Đổi Mảnh Vỡ" tab (legacy SoulExchangePanel): the classic purple / orange gems for Mảnh Vỡ Mệnh Hồn, bought with exchangeSoul(soulId).

import { PET_SOUL_COLOR_CSS, petSoulExchangeList } from '@mc/shared';
import { el } from '../petPanelTabs';
import { button } from '../petfunc/tabKit';
import { colorName, gemFace, gemTip, walletLine } from './soulCells';
import { SOUL_TEXT as T } from './soulText';
import type { SoulCtx } from './soulTypes';

export function renderExchange(ctx: SoulCtx, body: HTMLElement): void {
  const wrap = el('div', 'sc-main');
  const chips = ctx.host.player().currencies?.soulChip ?? 0;
  const list = el('div', 'sc-exchange');
  for (const def of petSoulExchangeList()) {
    const row = el('div', 'sc-ex-row');
    const icon = gemFace('pb-cell sc-cell', def);
    icon.title = gemTip(def);
    const text = el('div', 'sc-ex-text');
    const head = el('div', 'pf-line', `${def.name} (${colorName(def)})`);
    head.style.color = PET_SOUL_COLOR_CSS[def.color] ?? '';
    text.append(head, el('div', 'pf-line', def.desc), el('div', chips >= def.reqChip ? 'pf-line ok' : 'pf-line bad', T.exchangeNeed.replace('{num}', String(def.reqChip))));
    row.append(icon, text, button(T.exchange, () => ctx.host.actions.exchange(def.id), true, false));
    list.appendChild(row);
  }
  wrap.append(walletLine(ctx), list);
  body.replaceChildren(wrap);
}
