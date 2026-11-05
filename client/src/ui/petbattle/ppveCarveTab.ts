// "Khắc Văn" tab of the PPVE window: the 8 x 6 rune grid (rows = pet equipment slots, columns = the six runes unlocked at floors
// 0 / 20 / 40 / 60 / 80 / 100), the master level line and the stat totals. A click asks for confirmation and sends ppLevelUpPetIcon.

import { CARVE_PROP_NAMES, PPVE_PART_ICONS, PPVE_PART_SLOTS, carveMasterDef, carveValueText, type CarveNodeDef } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { PPVE_TEXT as T } from './petBattleText';
import type { PpveHost } from './petBattleTypes';
import { carveCell, carveTotals, masterProgress, type CarveCell } from './ppveRules';

const propName = (prop: number): string => CARVE_PROP_NAMES[prop] ?? `#${prop}`;
const stat = (n: CarveNodeDef | undefined): string => (n ? `${propName(n.prop)} +${carveValueText(n.prop, n.pv)}` : '-');

function cellTip(c: CarveCell): string {
  const lines = [T.carveNode(c.part, c.icon), `${T.now}: ${stat(c.cur)}`];
  if (c.locked) lines.push(T.openFloor(c.unlockFloor));
  else if (c.maxed) lines.push(T.maxed);
  else lines.push(`${T.next}: ${stat(c.next)}`, `${T.cost}: ${c.next?.costKp ?? '-'}`);
  return lines.join('\n');
}

export function renderCarveTab(body: HTMLElement, host: PpveHost): void {
  const m = host.model();
  const kp = m.kp!;
  const ppve = m.ppve!;
  const wrap = el('div', 'pbt-carve');
  const progress = masterProgress(ppve.p, ppve.mlv);
  const head = el('div', 'pbt-carve-head');
  head.append(
    el('span', 'pbt-kp', T.kpLeft(kp.kp)),
    el('span', 'pbt-label', `${T.master(ppve.mlv)} · ${progress.now}/${progress.need ?? T.maxed}`),
  );
  const grid = el('div', 'pbt-grid');
  for (let part = 0; part < PPVE_PART_SLOTS; part++) {
    for (let icon = 0; icon < PPVE_PART_ICONS; icon++) {
      const c = carveCell(ppve.p, part, icon, kp.ppvefloor);
      const cell = el('div', `pbt-node${c.locked ? ' locked' : ''}${c.maxed ? ' maxed' : ''}${c.level > 0 ? ' open' : ''}`);
      cell.title = cellTip(c);
      cell.append(
        el('div', 'pbt-node-name', c.cur ? propName(c.cur.prop) : c.next ? propName(c.next.prop) : '-'),
        el('div', 'pbt-node-lv', c.locked ? T.openFloor(c.unlockFloor) : `Lv ${c.level}`),
      );
      if (!c.locked && !c.maxed && c.next) {
        const next = c.next;
        cell.onclick = () => askConfirm(`${T.confirmCarve}\n${T.cost}: ${next.costKp} · ${T.next}: ${stat(next)}`, () => host.actions.levelUp(part, icon));
      }
      grid.appendChild(cell);
    }
  }
  const stats = el('div', 'pbt-carve-stats');
  stats.appendChild(el('div', 'pf-result-title', T.carveStats));
  for (const [prop, pv] of [...carveTotals(ppve.p)].sort((a, b) => a[0] - b[0])) stats.appendChild(el('div', 'pf-line', `${propName(prop)} +${carveValueText(prop, pv)}`));
  const master = carveMasterDef(ppve.mlv);
  stats.appendChild(el('div', 'pf-result-title', `${T.carveMaster} (${T.master(ppve.mlv)})`));
  for (const p of master?.props ?? []) stats.appendChild(el('div', 'pf-line', `${propName(p.prop)} +${carveValueText(p.prop, p.pv)}`));
  const cols = el('div', 'pbt-cols');
  cols.append(grid, stats);
  const guide = el('details', 'pf-guide');
  guide.append(el('summary', '', 'Quy tắc'), el('div', 'pf-guide-text', T.rules[1]));
  wrap.append(head, cols, guide);
  body.replaceChildren(wrap);
}
