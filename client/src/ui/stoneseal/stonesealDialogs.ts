// Inline dialogs of the Ấn Thạch window: Khai ấn (bore a hole, dust + Kim Cương or gold) and Kết ấn (raise the seal level).

import { STONE_SEAL, type StoneSealEquipView } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { button, el, fmt } from '../feature/dom';
import { STONE_SEAL_U } from './stonesealText';
import { bagDiamonds, boreCost, fillNum, succinctCost } from './stonesealRules';
import type { StoneSealUiHost } from './stonesealTypes';

const close = (host: StoneSealUiHost): void => {
  host.state.dialog = null;
  host.actions.render();
};

function costRow(label: string, have: number, need: number): HTMLElement {
  const row = el('div', 'ss-cost');
  row.append(el('span', '', label), el('span', have >= need ? 'ss-ok' : 'ss-bad', `${STONE_SEAL_U.HAVE}${fmt(have)}`));
  return row;
}

export function boreDialog(host: StoneSealUiHost, v: StoneSealEquipView, idx: number): HTMLElement {
  const box = el('div', 'ss-dialog');
  const cost = boreCost(v.bored);
  const diamonds = bagDiamonds(host.items(), cost.diamondColor);
  const diamondNum = diamonds.reduce((s, d) => s + d.stackNum, 0);
  box.append(el('div', 'ss-dlg-title', `${STONE_SEAL_U.BORE} #${idx} - ${fillNum(STONE_SEAL_U.BORED_COUNT, v.bored)}`), el('div', '', STONE_SEAL_U.BORE_NEED));
  box.append(costRow(fillNum(STONE_SEAL_U.DUST, cost.dust), host.dust(), cost.dust));
  const dia = STONE_SEAL_U.DIAMOND.replace('{level}', String(cost.diamondColor + 1)).replace('{num}', '1');
  box.append(costRow(dia, diamondNum, 1));
  const gold = el('div', 'ss-cost');
  gold.append(el('span', '', `Vàng ${fmt(cost.gold)}`), el('span', host.gold() >= cost.gold ? 'ss-ok' : 'ss-bad', `${STONE_SEAL_U.HAVE}${fmt(host.gold())}`));
  box.appendChild(gold);
  const row = el('div', 'ft-btns');
  const slow = button(STONE_SEAL_U.BORE, () => {
    const d = diamonds[0];
    if (!d) return;
    host.state.dialog = null;
    host.actions.bore(idx, STONE_SEAL.PAY_BORE_DUST, d.id);
  }, host.dust() < cost.dust || diamonds.length === 0);
  const fast = button(STONE_SEAL_U.BORE_FAST, () => {
    askConfirm(fillNum(STONE_SEAL_U.CONFIRM_BORE_GOLD, cost.gold), () => {
      host.state.dialog = null;
      host.actions.bore(idx, STONE_SEAL.PAY_GOLD, 0);
    });
  }, host.gold() < cost.gold);
  row.append(slow, fast, button('Đóng', () => close(host)));
  box.appendChild(row);
  return box;
}

export function succinctDialog(host: StoneSealUiHost, v: StoneSealEquipView): HTMLElement {
  const box = el('div', 'ss-dialog');
  box.appendChild(el('div', 'ss-dlg-title', `${STONE_SEAL_U.SUCCINCT} - ${fillNum(STONE_SEAL_U.LEVEL, v.lvl)}`));
  if (v.lvl >= STONE_SEAL.MAX_LEVEL) {
    box.appendChild(el('div', 'ss-ok', STONE_SEAL_U.MAX_LEVEL));
    box.appendChild(button('Đóng', () => close(host)));
    return box;
  }
  const cost = succinctCost(v.lvl);
  box.appendChild(el('div', '', STONE_SEAL_U.UPGRADE_NEED));
  box.appendChild(costRow(fillNum(STONE_SEAL_U.DUST, cost.dust), host.dust(), cost.dust));
  box.appendChild(costRow(`Vàng ${fmt(cost.gold)}`, host.gold(), cost.gold));
  const row = el('div', 'ft-btns');
  row.append(
    button(STONE_SEAL_U.UPGRADE, () => {
      host.state.dialog = null;
      host.actions.succinct(STONE_SEAL.PAY_SUCCINCT_DUST);
    }, host.dust() < cost.dust),
    button(STONE_SEAL_U.UPGRADE_FAST, () => {
      askConfirm(fillNum(STONE_SEAL_U.CONFIRM_SUCCINCT_GOLD, cost.gold), () => {
        host.state.dialog = null;
        host.actions.succinct(STONE_SEAL.PAY_GOLD);
      });
    }, host.gold() < cost.gold),
    button('Đóng', () => close(host)),
  );
  box.appendChild(row);
  return box;
}
