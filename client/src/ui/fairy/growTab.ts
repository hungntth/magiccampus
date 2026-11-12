// Tiểu Tinh Linh "Nuôi dưỡng" page (legacy FairyFuncCanvas): grow level and points, the five attributes now and at the next grow level
// (Hiệu quả trước đó / sau), the three fairyGrowUp buttons (100 000 silver x daily count, 39 gold, 20 x for 780 gold) and the last result.

import { FAIRY, FAIRY_COLOR_EFFECT, FAIRY_GROW_EXP, FAIRY_TEXT, fairyColour, fairyGrowLevel, fairyOwnStats, type FairyInfo } from '@mc/shared';
import { bar, button, el, fmt } from '../feature/dom';
import { FAIRY_UI, type FairyUiHost } from './fairyTypes';
import { ATTR_KEYS, tableProgress } from './infoTab';

function compare(f: FairyInfo, g: number): HTMLElement {
  const box = el('div', 'fy-compare');
  const now = fairyOwnStats(f);
  const next = g < FAIRY.GROW_MAX ? fairyOwnStats({ ...f, gexp: FAIRY_GROW_EXP[g] }) : null;
  const ng = Math.min(g + 1, FAIRY.GROW_MAX);
  box.append(el('span', '', ''), el('span', 'fy-title', FAIRY_UI.BEFORE), el('span', 'fy-title', FAIRY_UI.AFTER));
  box.append(el('span', 'fy-k', FAIRY_UI.EFFECT), el('span', '', `${FAIRY_COLOR_EFFECT[fairyColour(g)]}%`),
    el('span', 'fy-up', next ? `${FAIRY_COLOR_EFFECT[fairyColour(ng)]}%` : '-'));
  ATTR_KEYS.forEach((k, i) => {
    box.append(el('span', 'fy-k', FAIRY_TEXT.ATTRS[i]), el('span', '', String(now[k])), el('span', 'fy-up', next ? String(next[k]) : '-'));
  });
  return box;
}

export function renderGrowTab(host: FairyUiHost, f: FairyInfo, body: HTMLElement): void {
  const g = fairyGrowLevel(f.gexp);
  const [ge, span] = tableProgress(f.gexp, g, FAIRY_GROW_EXP);
  const maxed = g >= FAIRY.GROW_MAX;
  body.append(
    el('div', 'fy-title', `${FAIRY_UI.GROW_LV} ${g} - ${FAIRY_TEXT.COLOURS[fairyColour(g)]}`),
    el('div', 'fy-k', FAIRY_UI.GROW_POINTS),
    bar(ge, span, maxed ? 'MAX' : `${fmt(ge)}/${fmt(span)}`),
    el('div', 'fy-help', FAIRY_UI.GROW_HELP),
    compare(f, g),
  );
  const btns = el('div', 'fy-grow-btns');
  [FAIRY.GROW_TYPE.MONEY, FAIRY.GROW_TYPE.GOLD, FAIRY.GROW_TYPE.BATCH].forEach((type, i) => {
    const cell = el('div', 'fy-grow-cell');
    const b = button(FAIRY_UI.GROW_NAMES[i], () => host.grow(type), host.busy() || maxed);
    b.title = FAIRY_UI.GROW_TIPS[i];
    cell.append(b, el('div', 'fy-help', FAIRY_UI.GROW_TIPS[i]));
    btns.appendChild(cell);
  });
  const left = f.flag?.gnum ?? 0;
  body.append(
    btns,
    el('div', left > 0 ? 'fy-k' : 'fy-warn', left > 0 ? FAIRY_TEXT.GROWS_LEFT(f.name, left) : FAIRY_TEXT.NO_GROWS),
    el('div', 'ft-muted', `${FAIRY_UI.SILVER}: ${fmt(host.silver())}   ${FAIRY_UI.GOLD}: ${fmt(host.gold())}`),
  );
  if (maxed) body.appendChild(el('div', 'fy-warn', FAIRY_TEXT.GROW_MAX));
  const note = host.growNote();
  if (note) body.appendChild(el('div', 'fy-note', note));
}
