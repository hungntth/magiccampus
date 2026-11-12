// Mật Bảo "Thu Thập" page (legacy MysTreShow / MysTreDisplay): 11 kind buttons with their progress, the pieces of the chosen kind (grey until collected, "Chưa K.Hoạt" /
// "Đã K.Hoạt"), the kind progress and the stat lines it activates (getMysTreBuffByKind), plus the total of every kind (getMysTreBuffSimpleData).

import { MYS, MYS_TEXT, type MysBuffSimple } from '@mc/shared';
import { button, el } from '../feature/dom';
import { iconCell } from '../deco/decoCells';
import { propName } from '../deco/decoRules';
import { isCollected, itemsOfKind, kindProgress } from './mysteryRules';
import type { MysteryUiHost } from './mysteryTypes';

const SIMPLE_LABEL: Readonly<Record<keyof MysBuffSimple, number>> = { hp: 1, attack: 4, mAttack: 5, speed: 11, hit: 8, dodge: 9, critical: 13 };

function kindBar(host: MysteryUiHost): HTMLElement {
  const catalog = host.catalog()!;
  const bar = el('div', 'my-kinds');
  for (let kind = MYS.KIND_MIN; kind <= MYS.KIND_MAX; kind++) {
    const p = kindProgress(catalog, host.book(), host.bag(), kind);
    const b = button(`${MYS_TEXT.KINDS[kind - 1] ?? kind} ${p.owned}/${p.total}`, () => {
      host.view.kind = kind;
      host.actions.selectKind(kind);
      host.actions.render();
    });
    if (host.view.kind === kind) b.classList.add('on');
    bar.appendChild(b);
  }
  return bar;
}

function pieces(host: MysteryUiHost): HTMLElement {
  const grid = el('div', 'my-pieces');
  for (const row of itemsOfKind(host.catalog()!, host.view.kind)) {
    const got = isCollected(host.book(), host.bag(), row);
    const cell = el('div', `my-piece${got ? ' got' : ''}`);
    cell.title = `${row.name} ${MYS_TEXT.STAR(row.star)}\n${propName(row.pt)}+${row.pn}\nCấp ${row.level}`;
    cell.append(iconCell(row.iconCode), el('div', 'my-piece-name', `${row.name}`), el('div', 'my-piece-sub', `${MYS_TEXT.STAR(row.star)} · ${got ? MYS_TEXT.ACTIVE : MYS_TEXT.NOT_ACTIVE}`));
    grid.appendChild(cell);
  }
  return grid;
}

function buffLines(host: MysteryUiHost): HTMLElement {
  const box = el('div', 'ft-box my-buffs');
  const p = kindProgress(host.catalog()!, host.book(), host.bag(), host.view.kind);
  box.appendChild(el('div', 'ft-h', `${MYS_TEXT.PROGRESS}: ${p.owned}/${p.total}`));
  const lines = Object.values(host.buffs(host.view.kind) ?? {});
  box.appendChild(el('div', 'dc-label', MYS_TEXT.BUFF_TITLE));
  if (lines.length === 0) box.appendChild(el('div', 'ft-muted', MYS_TEXT.NO_BUFF));
  for (const l of lines) box.appendChild(el('div', 'ft-prop', `${propName(l.t)}+${l.propVal}`));
  const simple = host.simple();
  const all = (Object.keys(SIMPLE_LABEL) as (keyof MysBuffSimple)[]).filter((k) => simple[k]).map((k) => `${propName(SIMPLE_LABEL[k])}+${simple[k]}`);
  box.appendChild(el('div', 'dc-sub', `${MYS_TEXT.TABS[0]}: ${all.join('  ') || '-'}`));
  return box;
}

export function renderCollect(body: HTMLElement, host: MysteryUiHost): void {
  body.append(kindBar(host), pieces(host), buffLines(host));
}
