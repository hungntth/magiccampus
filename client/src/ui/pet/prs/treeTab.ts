// "Thăng Cấp" tab of the Chân Hồn Thần Thú window (PRSPanel tree page): the 10 nodes of the current tree page, level-up for Chân Hồn Thạch,
// the three collect buttons (free with Lộ Thu Thập, 148 and 888 gold) and the tree's property totals (PRSPropLbl1_*).

import { PRS, PRS_PROP_IDS, PRS_TEXT, PRS_TREE_ROWS, prsPanelValue, prsPropText, prsRawSums, prsTreeView, type PrsPanel } from '@mc/shared';
import { button, el, fmt } from '../../feature/dom';
import { showOf, treeOf, type PrsUiHost } from './prsTypes';

/** "HP + 545" lines of a raw sum map in PRS_PROP_IDS order (props without a value are skipped). */
export function propList(sums: ReadonlyMap<number, number>): HTMLElement {
  const box = el('div', 'prs-props');
  const ids = PRS_PROP_IDS.filter((p) => (sums.get(p) ?? 0) !== 0);
  if (ids.length === 0) box.appendChild(el('div', 'ft-muted', '-'));
  for (const p of ids) box.appendChild(el('div', 'prs-prop', prsPropText(p, prsPanelValue(p, sums.get(p)!))));
  return box;
}

function nodes(p: PrsPanel): HTMLElement {
  const view = prsTreeView(p.tid, treeOf);
  const box = el('div', 'prs-tree');
  for (let i = 1; i <= PRS.TREE_PAGE; i++) {
    const id = (view.page - 1) * PRS.TREE_PAGE + i;
    const cls = id < p.tid ? ' done' : id === p.tid ? ' cur' : '';
    const node = el('div', `prs-node${cls}${i === PRS.TREE_PAGE ? ' top' : ''}`, String(treeOf(id)?.level ?? id));
    node.title = `Cấp ${treeOf(id)?.level ?? id}`;
    box.appendChild(node);
  }
  return box;
}

export function renderTreeTab(host: PrsUiHost, body: HTMLElement): void {
  const p = host.panel();
  if (!p) return;
  const view = prsTreeView(p.tid, treeOf);
  const left = el('div', 'prs-col');
  left.append(el('div', 'prs-title', `${PRS_TEXT.TREE} - Cấp ${view.level}/${PRS_TREE_ROWS.length}`), nodes(p));
  const up = el('div', 'prs-row');
  up.append(
    el('span', '', `${PRS_TEXT.STONE_NEED}: ${view.max ? '-' : fmt(view.cost)}`),
    el('span', '', `${PRS_TEXT.STONE_HAVE}: ${fmt(host.stone())}`),
    button(PRS_TEXT.LEVEL_UP, () => host.treeUp(), host.busy() || view.max || host.stone() < view.cost),
  );
  const collect = el('div', 'prs-row');
  collect.append(
    button(`${PRS_TEXT.FREE}(${host.water()})`, () => host.collect('free'), host.busy() || host.water() < PRS.FREE_WATER),
    button(`${PRS_TEXT.GOLD} (${PRS.GOLD_COLLECT})`, () => host.collect('gold'), host.busy()),
    button(`${PRS_TEXT.SIX} (${PRS.GOLD_COLLECT_SIX})`, () => host.collect('six'), host.busy()),
  );
  left.append(up, collect, el('div', 'ft-muted', `Vàng: ${fmt(host.gold())}   Kết Tinh Thần Dụ: ${fmt(host.crystal())}`));
  const right = el('div', 'prs-col');
  const sums = prsRawSums(p, PRS_TREE_ROWS, treeOf, showOf, host.now());
  right.append(el('div', 'prs-title', PRS_TEXT.PROPS), propList(sums.tree), el('div', 'prs-help', PRS_TEXT.HELP_TREE));
  const cols = el('div', 'prs-cols');
  cols.append(left, right);
  body.appendChild(cols);
}
