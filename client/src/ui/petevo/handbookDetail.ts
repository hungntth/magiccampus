// Detail pane of the Sách Tiến Hóa book: the creature card, description, bonus, evolution link and the activation bar with the
// "Nạp NLTN" (activePet, natural energy) and "Kích Hoạt" (activePetGold, VIP) buttons.

import { handbookRemaining, petHandbookEntries, petHandbookGoldCost, PET_HANDBOOK_SERIES_NAMES, type PetHandbookDef } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { button } from '../petfunc/tabKit';
import { creatureCard } from './creatureCard';
import { entryBonusText, entryState, evolvablePets, EVOLVE_MIN_LEVEL } from './petEvoRules';
import { confirmGoldActive, confirmNp, EVO_TEXT } from './petEvoText';
import type { PetEvoHost } from './petEvoTypes';

export function detailPane(host: PetEvoHost, def: PetHandbookDef, busy: () => boolean, run: (job: () => Promise<void>) => Promise<void>): HTMLElement {
  const pane = el('div', 'pe-detail');
  const player = host.player();
  const state = entryState(player.activePetObject, def);
  const remaining = handbookRemaining(def, state.activedNum);
  const np = player.currencies?.npPnt ?? 0;
  const done = state.actived || remaining === 0;

  pane.appendChild(creatureCard(`${PET_HANDBOOK_SERIES_NAMES[def.classId] ?? ''}`, def.creature));
  const text = el('div', 'pe-detail-text');
  text.append(
    el('div', 'pe-detail-name', def.name),
    el('div', 'pf-line', `Mô tả: ${def.desc}`),
    el('div', 'pf-line', def.propType > 0 ? `Kích hoạt (pet chiến đấu): ${entryBonusText(def)}` : 'Kích hoạt: không có thuộc tính riêng'),
  );
  if (def.evolved) text.appendChild(el('div', 'pf-line', `${EVO_TEXT.title}: ${def.evolved.name}`));
  pane.appendChild(text);

  const bar = el('div', 'pe-bar pe-book-bar');
  const fill = el('div', 'pe-bar-fill');
  fill.style.width = `${Math.min(100, Math.round((state.activedNum * 100) / Math.max(1, def.activeNum)))}%`;
  bar.append(fill, el('span', 'pe-bar-text', done ? 'Đã kích hoạt' : `${state.activedNum}/${def.activeNum}`));
  pane.appendChild(bar);

  if (!done) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'pe-num';
    input.min = '1';
    input.max = String(Math.max(1, Math.min(np, remaining)));
    input.value = String(Math.max(1, Math.min(np, remaining)));
    const amount = (): number => Math.floor(Number(input.value));
    const row = el('div', 'pf-buttons');
    row.append(
      el('span', 'pf-line', `${EVO_TEXT.npLabel}${np}`), input,
      button('Nạp NLTN', () => {
        const n = amount();
        if (!Number.isInteger(n) || n < 1) return void toast('Nhập số lượng');
        if (n > np) return void toast(EVO_TEXT.noNp);
        askConfirm(confirmNp(Math.min(n, remaining)), () => void run(async () => void (await host.actions.activate(def.id, n))));
      }, !busy()),
      button(`Kích Hoạt (${petHandbookGoldCost(remaining)} vàng)`, () => {
        if (!player.pmLevel) return void toast('Chức năng dành cho VIP');
        askConfirm(confirmGoldActive(petHandbookGoldCost(remaining)), () => void run(async () => void (await host.actions.activateGold(def.id))));
      }, !busy()),
    );
    pane.appendChild(row);
  }
  if (def.evolutionId > 0) {
    pane.appendChild(button(EVO_TEXT.title, () => {
      if (player.level < EVOLVE_MIN_LEVEL) return void toast(EVO_TEXT.levelGate);
      host.actions.openEvolve(evolvablePets(host.pets()).find((p) => p.tid === def.relateId) ?? null);
    }, state.actived, false));
  }
  return pane;
}

/** Entries of a series with their activation state (list rows and the overview). */
export function seriesProgress(host: PetEvoHost, classId: number): { total: number; actived: number } {
  const all = host.player().activePetObject;
  const rows = petHandbookEntries().filter((h) => h.classId === classId);
  return { total: rows.length, actived: rows.filter((h) => entryState(all, h).actived).length };
}
