// "C.Hóa H.Khí" tab (legacy hole level-up): the level of the chosen Hồn Khí, its stats now and after the next level, the cost per attempt
// (Bí Ngân + silver of the selected money type), the success rate and the two buttons (1 attempt / 10 attempts).

import { DECO_PANEL, type DecoHoleRow, type PropLine } from '@mc/shared';
import { button, el, fmt } from '../feature/dom';
import { positionBar } from './decoCells';
import { holeRow, propName } from './decoRules';
import type { DecoUiHost } from './decoTypes';

/** The four stat types of a Hồn Khí hole in the Flash panel order (HP, Tốc độ, Công VL, Công MP); a level-0 row carries zeros. */
const TYPES = [1, 11, 4, 5];

function stats(title: string, row: DecoHoleRow | undefined): HTMLElement {
  const box = el('div', 'dc-stats');
  box.appendChild(el('div', 'ft-h', title));
  const by = new Map((row?.props ?? []).map((l: PropLine) => [l.t, l.v]));
  for (const t of TYPES) box.appendChild(el('div', 'ft-prop', `${propName(t)} +${by.get(t) ?? 0}`));
  return box;
}

export function renderUpgrade(body: HTMLElement, host: DecoUiHost): void {
  const p = host.info()[String(host.view.position)];
  const cur = holeRow(host.catalog(), p.hid);
  const next = cur && cur.nextId > 0 ? holeRow(host.catalog(), cur.nextId) : undefined;
  const head = el('div', 'ft-box');
  head.appendChild(el('div', 'ft-h', `${DECO_PANEL.UPGRADE_TITLE}  -  ${DECO_PANEL.UPGRADE_LEVEL}: ${p.level}${next ? '' : `  (${DECO_PANEL.MAX})`}`));
  const cols = el('div', 'dc-cols');
  cols.append(stats('Thuộc tính', cur), stats('Thuộc tính sau', next));
  head.appendChild(cols);
  const need = el('div', 'dc-need');
  if (next && cur) {
    need.append(
      el('div', host.decoSilver() >= cur.costNum ? '' : 'dc-bad', `${DECO_PANEL.NEED_SILVER}${fmt(cur.costNum)}   (${DECO_PANEL.HAVE_SILVER}${fmt(host.decoSilver())})`),
      el('div', host.money() >= cur.costSil ? '' : 'dc-bad', `${DECO_PANEL.NEED_MONEY}${fmt(cur.costSil)}   (${fmt(host.money())})`),
      el('div', '', `${DECO_PANEL.RATE}${cur.rate}%`),
    );
  }
  const btns = el('div', 'ft-btns');
  btns.append(
    button(DECO_PANEL.BTN_UPGRADE, () => host.actions.upgrade(host.view.position, false), !next),
    button(DECO_PANEL.BTN_UPGRADE10, () => host.actions.upgrade(host.view.position, true), !next),
  );
  body.append(positionBar(host), head, need, btns);
}
