// Detail box + action buttons of the selected medal (bag stack or worn slot): equip / unequip, level up, dissolve (with count stepper).

import { MEDAL, MEDAL_TEXT, medalIsBag, medalIsEquip, medalIsPetEquip, type MedalRow } from '@mc/shared';
import { button, el, fmt } from '../feature/dom';
import { firstFreeBag, medalPropText, medalSlotLabel } from './medalRules';
import { MEDAL_P, MEDAL_UI } from './medalText';
import type { MedalUiHost } from './medalTypes';

function info(box: HTMLElement, text: string, cls = 'md-sub'): void {
  box.appendChild(el('div', cls, text));
}

function describe(box: HTMLElement, row: MedalRow, host: MedalUiHost): void {
  box.appendChild(el('div', `md-name md-tq${Math.min(row.q, 4)}`, `${row.name} - ${MEDAL_UI.LEVEL} ${row.level}`));
  info(box, `${MEDAL_UI.QUALITY} ${row.q}`);
  info(box, `${MEDAL_P[27]} ${row.clevel}`, host.charLevel() >= row.clevel ? 'md-sub' : 'md-sub md-bad');
  if (medalIsEquip(row.sid)) {
    info(box, `${MEDAL_P[23]} ${medalSlotLabel(row.sid)}`);
    info(box, `${MEDAL_P[24]} ${medalIsPetEquip(row.sid) ? MEDAL_P[25] : MEDAL_P[26]}`);
  }
  info(box, `${MEDAL_P[21]}: ${medalPropText(row)}`, 'md-prop');
}

function upgradeBlock(box: HTMLElement, row: MedalRow, slot: number, host: MedalUiHost): void {
  const next = host.look().next(row);
  const exp = host.info().medalExp;
  if (!next) {
    info(box, MEDAL_P[52] ?? MEDAL_TEXT.MAX_LEVEL, 'md-dim');
    return;
  }
  info(box, `${MEDAL_P[51]} ${medalPropText(next)}`, 'md-prop');
  info(box, `${MEDAL_P[6]}: ${fmt(row.upExp)} - ${MEDAL_P[7]}: ${fmt(exp)}`, exp >= row.upExp ? 'md-ok' : 'md-bad');
  if (next.clevel > host.charLevel()) info(box, `${MEDAL_P[29]} ${next.clevel}`, 'md-bad');
  const btns = el('div', 'md-btns');
  btns.appendChild(button(MEDAL_P[2] ?? '', () => host.actions.upgrade(slot), medalIsEquip(slot)));
  box.appendChild(btns);
}

function dissolveBlock(box: HTMLElement, row: MedalRow, slot: number, count: number, host: MedalUiHost): void {
  const n = Math.max(1, Math.min(host.view.breakCount, count));
  const line = el('div', 'md-btns');
  if (count > 1) {
    const step = (d: number): void => {
      host.view.breakCount = Math.max(1, Math.min(count, n + d));
      host.actions.render();
    };
    line.append(el('span', 'md-sub', MEDAL_UI.COUNT), button('-', () => step(-1), n <= 1), el('span', 'md-count-num', String(n)),
      button('+', () => step(1), n >= count), button('Max', () => step(count - n), n >= count));
  }
  line.appendChild(button(count > 1 ? (MEDAL_P[12] ?? '') : (MEDAL_P[3] ?? ''), () => host.actions.dissolve(slot, n, row), row.q >= MEDAL.RARE_Q));
  box.appendChild(line);
  info(box, (MEDAL_P[56] ?? '').replace('{num}', fmt(row.exp * n)), 'md-ok');
}

export function renderDetail(body: HTMLElement, host: MedalUiHost): void {
  const box = el('div', 'md-detail');
  body.appendChild(box);
  const slot = host.view.sel;
  const entry = slot ? host.bag()[String(slot)] : undefined;
  const row = entry ? host.look().row(entry.t) : undefined;
  if (!entry || !row) {
    info(box, MEDAL_UI.PICK, 'md-dim');
    return;
  }
  describe(box, row, host);
  if (medalIsEquip(slot)) {
    const btns = el('div', 'md-btns');
    btns.appendChild(button(MEDAL_UI.UNEQUIP, () => host.actions.unequip(slot), firstFreeBag(host.bag()) === 0));
    box.appendChild(btns);
    return;
  }
  if (!medalIsBag(slot)) return;
  const btns = el('div', 'md-btns');
  btns.appendChild(button(MEDAL_UI.EQUIP, () => host.actions.equip(slot, row.sid), !medalIsEquip(row.sid)));
  box.appendChild(btns);
  upgradeBlock(box, row, slot, host);
  dissolveBlock(box, row, slot, entry.n, host);
}
