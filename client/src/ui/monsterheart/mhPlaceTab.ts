// Ma Tâm window tab 1 "Đặt Ma Tâm": box selector, 7 hole rows (open / place / remove), the heart bag grid, active combines and the box upgrade.

import { MONSTER_HEART, MONSTER_HEART_TEXT as T, heartPropTotals, heartStatLines, type MonsterHeartData } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { button, el, fmt } from '../feature/dom';
import { heartCell } from './mhCells';
import { MH_COLOR_NAMES, bagRows, boxBonusText, boxUpgradeInfo, heartCount, heartPropText, holeCost, propValueText } from './mhRules';
import type { MhUiHost } from './mhTypes';

export const HEART_TYPE_NAMES = ['Người', 'Thú', 'Thực Vật', 'Máy', 'Ma', 'Long', 'BOSS'] as const;

function boxBar(host: MhUiHost): HTMLElement {
  const bar = el('div', 'ft-btns');
  for (let b = 1; b <= MONSTER_HEART.BOXES; b++) {
    const lev = host.state().data.heartBoxLev[b] ?? 1;
    const btn = button(`Ô ${b} (Lv${lev})`, () => {
      host.view.box = b;
      host.actions.render();
    });
    btn.classList.toggle('on', host.view.box === b);
    bar.appendChild(btn);
  }
  return bar;
}

function holeRow(host: MhUiHost, box: number, hole: number): HTMLElement {
  const idx = host.index();
  const id = host.state().data.hadActHole[box]?.[hole] ?? 0;
  const cost = holeCost(idx, box, hole);
  const row = el('div', 'mh-hole');
  const accepts = cost.type > 0 ? HEART_TYPE_NAMES[cost.type - 1] ?? '' : 'Tất cả';
  const heart = id > 0 ? idx.hearts.get(id) : undefined;
  row.appendChild(heartCell(heart));
  const text = el('div', 'mh-hole-text');
  text.appendChild(el('div', 'mh-hole-title', `Lỗ ${hole} - ${accepts}`));
  const act = el('div', 'ft-btns');
  if (id === MONSTER_HEART.CLOSED_HOLE) {
    text.appendChild(el('div', 'ft-muted', T.HOLE_CLOSED));
    if (cost.gold > 0) {
      act.appendChild(button(`${fmt(cost.gold)} Vàng`, () => askConfirm(`Xác nhận tiêu phí ${fmt(cost.gold)} Vàng để mở lỗ này`, () => host.actions.openGold(box, hole))));
    }
    if (cost.diamonds > 0) {
      const have = host.diamonds(cost.diamondColor);
      act.appendChild(button(`${cost.diamonds} Kim Cương (có ${have})`, () => askConfirm(
        `Xác nhận dùng ${cost.diamonds} Kim Cương cấp ${cost.diamondColor + 1} để mở lỗ này`, () => host.actions.openDiamond(box, hole),
      ), have < cost.diamonds));
    }
  } else if (heart) {
    text.appendChild(el('div', `mh-name mh-t${heart.color}`, `${heart.name} (${MH_COLOR_NAMES[heart.color] ?? ''})`));
    text.appendChild(el('div', 'ft-muted', heartPropText(heart)));
    act.appendChild(button('Tháo', () => host.actions.remove(hole, box)));
  } else {
    text.appendChild(el('div', 'ft-muted', T.EMPTY_SLOT));
  }
  const sel = idx.hearts.get(host.view.sel);
  if (id !== MONSTER_HEART.CLOSED_HOLE && sel) {
    const fits = cost.type <= 0 || cost.type === sel.type;
    act.appendChild(button(`Đặt ${sel.name}`, () => {
      host.view.sel = heartCount(host.state().bag, sel.id) > 1 ? sel.id : 0;
      host.actions.place(sel.id, hole, box, sel.type);
    }, !fits));
  }
  text.appendChild(act);
  row.appendChild(text);
  return row;
}

function bagGrid(host: MhUiHost): HTMLElement {
  const wrap = el('div', 'mh-bag');
  const tabs = el('div', 'ft-btns');
  HEART_TYPE_NAMES.forEach((name, i) => {
    const b = button(name, () => {
      host.view.bagType = i;
      host.view.sel = 0;
      host.actions.render();
    });
    b.classList.toggle('on', host.view.bagType === i);
    tabs.appendChild(b);
  });
  wrap.appendChild(tabs);
  const grid = el('div', 'mh-grid');
  const rows = bagRows(host.state().bag, host.view.bagType, host.index());
  if (rows.length === 0) grid.appendChild(el('div', 'ft-muted', T.NO_QUICK));
  for (const r of rows) {
    const cell = heartCell(r.heart, r.n);
    cell.classList.add('mh-pick');
    cell.classList.toggle('pick', host.view.sel === r.id);
    cell.onclick = () => {
      host.view.sel = host.view.sel === r.id ? 0 : r.id;
      host.actions.render();
    };
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  const sel = host.index().hearts.get(host.view.sel);
  wrap.appendChild(el('div', 'ft-muted', sel ? `${sel.name}: ${heartPropText(sel)}` : 'Chọn một Ma Tâm rồi bấm "Đặt" ở lỗ trống.'));
  return wrap;
}

function combineSection(host: MhUiHost, box: number, data: MonsterHeartData): HTMLElement {
  const idx = host.index();
  const sec = el('div', 'mh-combos');
  sec.appendChild(el('div', 'ft-h', 'Tổ hợp'));
  const active = Object.entries(data.hadActCombine[box] ?? {});
  if (active.length === 0) sec.appendChild(el('div', 'ft-muted', '-'));
  for (const [pid, e] of active) {
    const row = idx.combines.get(Number(pid) * 10 + e.color);
    if (!row) continue;
    sec.appendChild(el('div', 'mh-combo', `${row.name} (${MH_COLOR_NAMES[e.color - 1] ?? e.color})`));
  }
  sec.appendChild(el('div', 'ft-h', 'Tổng thuộc tính'));
  const totals = heartPropTotals(heartStatLines(data, idx.look));
  if (totals.size === 0) sec.appendChild(el('div', 'ft-muted', '-'));
  for (const [prop, v] of [...totals].sort((a, b) => a[0] - b[0])) sec.appendChild(el('div', 'ft-prop', propValueText(prop, v)));
  return sec;
}

function boxUpgrade(host: MhUiHost, box: number): HTMLElement {
  const lev = host.state().data.heartBoxLev[box] ?? 1;
  const info = boxUpgradeInfo(host.index(), box, lev, host.maNang());
  const row = el('div', 'ft-btns');
  row.appendChild(el('span', 'ft-h', `Ô ${box} Lv${lev}: ${boxBonusText(host.index(), box, lev)}`));
  if (info.max) {
    row.appendChild(el('span', 'ft-muted', T.MAX_BOX));
    return row;
  }
  row.appendChild(el('span', 'ft-muted', `Lên Lv${lev + 1} (${boxBonusText(host.index(), box, lev + 1)}): ${info.byGold ? `${fmt(info.gold)} Vàng` : `${fmt(info.maNang)} Ma Năng`}`));
  row.appendChild(button('Nâng cấp ô chứa', () => askConfirm(
    info.byGold ? `Ma Năng không đủ, xác nhận dùng ${fmt(info.gold)} Vàng để thăng cấp Vật chứa?` : `Xác nhận dùng ${fmt(info.maNang)} Ma Năng để thăng cấp Vật chứa?`,
    () => host.actions.upgradeBox(box),
  )));
  return row;
}

export function renderPlace(body: HTMLElement, host: MhUiHost): void {
  const box = host.view.box;
  body.appendChild(boxBar(host));
  body.appendChild(boxUpgrade(host, box));
  const cols = el('div', 'mh-cols');
  const holes = el('div', 'mh-holes');
  for (let h = 1; h <= MONSTER_HEART.HOLES; h++) holes.appendChild(holeRow(host, box, h));
  const right = el('div', 'mh-right');
  right.append(bagGrid(host), combineSection(host, box, host.state().data));
  cols.append(holes, right);
  body.appendChild(cols);
  body.appendChild(el('div', 'ft-muted mh-status', `Ma Năng: ${fmt(host.maNang())}   ${host.view.status}`));
}
