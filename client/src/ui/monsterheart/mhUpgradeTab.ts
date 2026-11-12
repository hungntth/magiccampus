// Ma Tâm window tab 2 "Thăng cấp / Phân giải": fuse 2..5 hearts into the next colour (rate, Tâm Tinh Thạch / gold protection) or dissolve into Ma Năng.

import { MONSTER_HEART, monsterHeartUpgradeRate } from '@mc/shared';
import { button, el, fmt } from '../feature/dom';
import { heartCell } from './mhCells';
import { HEART_TYPE_NAMES } from './mhPlaceTab';
import { bagRows, heartCount, heartPropText } from './mhRules';
import type { MhUiHost } from './mhTypes';

function stepper(value: number, min: number, max: number, set: (n: number) => void): HTMLElement {
  const wrap = el('span', 'ft-btns');
  const clamp = (n: number): number => Math.max(min, Math.min(max, n));
  wrap.append(button('-', () => set(clamp(value - 1)), value <= min), el('span', 'mh-num', String(value)), button('+', () => set(clamp(value + 1)), value >= max));
  return wrap;
}

function pickGrid(host: MhUiHost): HTMLElement {
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
  const grid = el('div', 'mh-grid');
  for (const r of bagRows(host.state().bag, host.view.bagType, host.index())) {
    const cell = heartCell(r.heart, r.n);
    cell.classList.add('mh-pick');
    cell.classList.toggle('pick', host.view.sel === r.id);
    cell.onclick = () => {
      host.view.sel = host.view.sel === r.id ? 0 : r.id;
      host.view.resolveNum = 1;
      host.actions.render();
    };
    grid.appendChild(cell);
  }
  if (!grid.hasChildNodes()) grid.appendChild(el('div', 'ft-muted', '-'));
  wrap.append(tabs, grid);
  return wrap;
}

function check(label: string, on: boolean, set: (v: boolean) => void): HTMLElement {
  const lab = el('label', 'mh-check');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = on;
  box.onchange = () => set(box.checked);
  lab.append(box, document.createTextNode(` ${label}`));
  return lab;
}

export function renderUpgrade(body: HTMLElement, host: MhUiHost): void {
  const v = host.view;
  const idx = host.index();
  const heart = idx.hearts.get(v.sel);
  body.appendChild(pickGrid(host));
  const own = heart ? heartCount(host.state().bag, heart.id) : 0;
  const panel = el('div', 'mh-fuse');
  if (!heart) {
    panel.appendChild(el('div', 'ft-muted', 'Chọn một Ma Tâm trong túi.'));
    body.append(panel, el('div', 'ft-muted mh-status', v.status));
    return;
  }
  panel.appendChild(el('div', 'ft-h', `${heart.name} x${own}`));
  panel.appendChild(el('div', 'ft-muted', heartPropText(heart)));

  const up = heart.color < MONSTER_HEART.MAX_COLOR ? idx.hearts.get(heart.id + 1) : undefined;
  panel.appendChild(el('div', 'ft-h', 'Thăng cấp'));
  if (!up) {
    panel.appendChild(el('div', 'ft-muted', 'Ma Tâm đã đạt phẩm chất cao nhất'));
  } else {
    const num = Math.max(MONSTER_HEART.MIN_FUSE, Math.min(MONSTER_HEART.MAX_FUSE, v.fuseNum));
    const row = el('div', 'ft-btns');
    row.append(el('span', '', 'Số lượng:'), stepper(num, MONSTER_HEART.MIN_FUSE, MONSTER_HEART.MAX_FUSE, (n) => {
      v.fuseNum = n;
      host.actions.render();
    }));
    panel.appendChild(row);
    panel.appendChild(el('div', 'ft-prop', `Tỉ lệ thành công: ${monsterHeartUpgradeRate(heart.color, num)}%  ->  ${up.name}`));
    panel.appendChild(check(`Dùng Tâm Tinh Thạch (Còn: ${fmt(host.stones())})`, v.useStone, (on) => {
      v.useStone = on;
      host.actions.render();
    }));
    panel.appendChild(check(`Dùng vàng (${MONSTER_HEART.PROTECT_GOLD} Vàng khi hết Tâm Tinh Thạch)`, v.byGold, (on) => {
      v.byGold = on;
      host.actions.render();
    }));
    const btns = el('div', 'ft-btns');
    btns.append(
      button('Dung luyện', () => host.actions.fuse(false), own < num),
      button(host.allCooling() ? 'Toàn bộ (chờ...)' : 'Toàn bộ', () => host.actions.fuse(true), own < num || host.allCooling()),
    );
    panel.appendChild(btns);
  }

  panel.appendChild(el('div', 'ft-h', 'Phân giải'));
  const rn = Math.max(1, Math.min(own, v.resolveNum));
  const rrow = el('div', 'ft-btns');
  rrow.append(stepper(rn, 1, Math.max(1, own), (n) => {
    v.resolveNum = n;
    host.actions.render();
  }), el('span', 'ft-muted', `Nhận: ${fmt(heart.exp * rn)} Ma Năng`), button('Phân giải', () => host.actions.resolve(), own < 1));
  panel.appendChild(rrow);
  body.append(panel, el('div', 'ft-muted mh-status', `Ma Năng: ${fmt(host.maNang())}   ${v.status}`));
}
