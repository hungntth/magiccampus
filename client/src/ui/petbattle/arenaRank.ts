// Rank views of the arena window: the caller's group top 50 with the win-streak list (onPetArenaRank) and last week's final ladder per
// group (getLastPetArenaRank, PetArenaPrevRankPanel). Pure builders; the window swaps them into its body.

import type { PetArenaPrevRank, PetArenaRankReply } from '@mc/shared';
import { el } from '../petPanelTabs';
import { ARENA_TEXT as T } from './petBattleText';

function row(cells: string[], cls = ''): HTMLElement {
  const r = el('div', `pbt-trow ${cls}`);
  cells.forEach((c, i) => r.appendChild(el('span', `pbt-r${i}`, c)));
  return r;
}

function back(onBack: () => void): HTMLElement {
  const b = el('button', 'pet-btn', T.back);
  b.onclick = onBack;
  return b;
}

export function renderRank(rank: PetArenaRankReply | null, onBack: () => void): HTMLElement {
  const wrap = el('div', 'pbt-arena-wrap');
  wrap.appendChild(el('div', 'pbt-floor', T.rankTitle));
  const cols = el('div', 'pbt-cols');
  const ladder = el('div', 'pbt-table pbt-rankbox');
  ladder.appendChild(row([T.colRank, T.colTeam, T.colOwner, T.rankLevel, T.rankPoints], 'head'));
  for (const r of rank?.r ?? []) ladder.appendChild(row([String(r.rank + 1), r.tName, r.name, String(r.level), String(r.pnt)]));
  const combo = el('div', 'pbt-table pbt-rankbox narrow');
  combo.appendChild(row([T.colOwner, T.rankCombo], 'head'));
  for (const c of rank?.c ?? []) if (c.maxCombo > 0) combo.appendChild(row([c.name, String(c.maxCombo)]));
  cols.append(ladder, combo);
  wrap.append(cols, back(onBack));
  return wrap;
}

export function renderPrev(prev: PetArenaPrevRank | null, onBack: () => void): HTMLElement {
  const wrap = el('div', 'pbt-arena-wrap');
  wrap.appendChild(el('div', 'pbt-floor', T.prevTitle));
  const groups = el('div', 'pbt-cols pbt-prev');
  T.groupShort.forEach((label, rid) => {
    const col = el('div', 'pbt-table pbt-rankbox narrow');
    col.appendChild(el('div', 'pbt-rank-title', label));
    for (const r of prev?.[String(rid)] ?? []) col.appendChild(row([String(r.rank + 1), r.tName, r.name]));
    groups.appendChild(col);
  });
  wrap.append(groups, back(onBack));
  return wrap;
}
