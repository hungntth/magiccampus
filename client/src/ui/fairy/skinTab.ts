// Tiểu Tinh Linh "Hoán đổi" page (legacy FairySkinCanvas): every fairy template as a skin card. Owned = unlocked (actFairyList) or a
// fairy of that template in the roster; Hiện / Ẩn = setFairyRes(tid, 2 | 1) (the guarding fairy shows the active skin on the map),
// Kích Hoạt = setFairyResList(tid) for 550 gold (tids 15 / 16 need an item that does not exist: refusal text only).

import { FAIRY, FAIRY_SKIN_ITEM_TIDS, FAIRY_TEMPLATE_ROWS, FAIRY_TEXT, parseSkinList } from '@mc/shared';
import { drawCreatureModel } from '../petTip';
import { button, el } from '../feature/dom';
import { FAIRY_UI, type FairyUiHost } from './fairyTypes';

export function renderSkinTab(host: FairyUiHost, body: HTMLElement): void {
  const skin = host.skin();
  const unlocked = new Set(parseSkinList(skin?.actFairyList));
  const roster = new Set(host.fairies().map((f) => f.tid));
  const act = Number(skin?.actFairy ?? 0);
  const grid = el('div', 'fy-skins');
  for (const t of FAIRY_TEMPLATE_ROWS) {
    const owned = unlocked.has(t.id) || roster.has(t.id);
    const card = el('div', `fy-skin${act === t.id ? ' on' : ''}${owned ? '' : ' locked'}`);
    const canvas = document.createElement('canvas');
    canvas.width = 72;
    canvas.height = 72;
    void drawCreatureModel(canvas, t.rc);
    card.append(canvas, el('div', 'fy-skin-name', t.name));
    if (act === t.id) {
      card.append(el('div', 'fy-up', FAIRY_UI.SKIN_IN_USE), button(FAIRY_TEXT.SKIN_HIDE, () => host.showSkin(t.id, false), host.busy()));
    } else if (owned) {
      card.appendChild(button(FAIRY_TEXT.SKIN_SHOW, () => host.showSkin(t.id, true), host.busy()));
    } else {
      const label = FAIRY_SKIN_ITEM_TIDS.includes(t.id) ? FAIRY_TEXT.SKIN_UNLOCK : `${FAIRY_TEXT.SKIN_UNLOCK} (${FAIRY.SKIN_COST})`;
      card.appendChild(button(label, () => host.unlockSkin(t.id), host.busy()));
    }
    grid.appendChild(card);
  }
  body.append(el('div', 'fy-title', FAIRY_TEXT.TITLE), grid);
}
