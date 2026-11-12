// Tiểu Tinh Linh "Thuộc tính" page (legacy FairyManagerPanel detail + FairyDetailCanvas): animated model, level / exp, grow level and colour
// band (Thiên chất), satiety, the five attributes with their growth, the guard power and the owner bonus, Thủ hộ / Nghỉ and Thả.

import {
  FAIRY, FAIRY_GROW_EXP, FAIRY_LEVEL_EXP, FAIRY_TEXT, fairyColour, fairyGrowLevel, fairyGuardEffect, fairyGuardStats, fairyLevel, fairyOwnStats,
  type FairyAttrs, type FairyInfo,
} from '@mc/shared';
import { animateCreatureModel } from '../petTip';
import { bar, button, el, fmt } from '../feature/dom';
import { fairyArtOf } from './fairyConfig';
import { FAIRY_UI, colourClass, type FairyUiHost } from './fairyTypes';

export const ATTR_KEYS: readonly (keyof FairyAttrs)[] = ['sta', 'ste', 'agi', 'inte', 'ener'];
const GROWTH_KEYS = ['staG', 'steG', 'agiG', 'inteG', 'enerG'] as const;

/** Progress inside the current level of a cumulative table: [value, span]; full at the cap. */
export function tableProgress(v: number, lv: number, table: readonly number[]): [number, number] {
  if (lv >= table.length) return [1, 1];
  const lo = lv > 0 ? table[lv - 1] : 0;
  return [Math.max(0, v - lo), table[lv] - lo];
}

/** Animated preview of `rc` (creature sheet, standing clip). */
export function fairyModel(rc: string, size = 120): HTMLElement {
  const box = el('div', 'fy-model');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  box.appendChild(canvas);
  if (rc) animateCreatureModel(canvas, rc, 1, true);
  return box;
}

function attrTable(f: FairyInfo): HTMLElement {
  const own = fairyOwnStats(f);
  const g = fairyGrowLevel(f.gexp);
  const t = el('div', 'fy-attrs');
  ATTR_KEYS.forEach((k, i) => {
    const line = el('div', 'fy-attr');
    line.title = FAIRY_UI.ATTR_TIPS[i];
    const growth = Math.round((f[GROWTH_KEYS[i]] + 0.2 * g) * 10) / 10;
    line.append(el('span', 'fy-k', FAIRY_TEXT.ATTRS[i]), el('span', 'fy-v', String(own[k])),
      el('span', 'fy-k', `${FAIRY_TEXT.ATTRS[i]} ${FAIRY_UI.GROWTH}`), el('span', 'fy-v', String(growth)));
    t.appendChild(line);
  });
  return t;
}

function guardBox(f: FairyInfo): HTMLElement {
  const box = el('div', 'fy-box');
  const eff = Math.round(fairyGuardEffect(fairyGrowLevel(f.gexp), f.doh) * 1000) / 10;
  box.appendChild(el('div', 'fy-title', `${FAIRY_UI.GUARD_POWER}: ${eff}%`));
  const bonus = fairyGuardStats(f);
  const line = el('div', 'fy-row');
  ATTR_KEYS.forEach((k, i) => line.appendChild(el('span', 'fy-bonus', `${FAIRY_TEXT.ATTRS[i]} +${bonus[k]}`)));
  box.append(line, el('div', 'fy-help', FAIRY_UI.ATTR_HELP));
  if (f.doh < 7500) box.appendChild(el('div', 'fy-warn', FAIRY_UI.LOW_DOH(f.name)));
  return box;
}

export function renderInfoTab(host: FairyUiHost, f: FairyInfo, body: HTMLElement): void {
  const lv = fairyLevel(f.exp);
  const g = fairyGrowLevel(f.gexp);
  const guard = f.state === FAIRY.STATE.GUARD;
  const head = el('div', 'fy-head');
  const [e, eSpan] = tableProgress(f.exp, lv, FAIRY_LEVEL_EXP);
  const [ge, gSpan] = tableProgress(f.gexp, g, FAIRY_GROW_EXP);
  head.append(
    el('div', `fy-name ${colourClass(f)}`, f.name),
    el('div', '', `${FAIRY_UI.LEVEL}: ${lv}`),
    el('div', 'fy-k', FAIRY_UI.EXP),
    bar(e, eSpan, lv >= FAIRY.MAX_LEVEL ? 'MAX' : `${fmt(e)}/${fmt(eSpan)}`),
    el('div', 'fy-k', `${FAIRY_UI.TALENT}: ${FAIRY_TEXT.COLOURS[fairyColour(g)]} (${FAIRY_UI.GROW_LV} ${g})`),
    bar(ge, gSpan, g >= FAIRY.GROW_MAX ? 'MAX' : `${fmt(ge)}/${fmt(gSpan)}`),
    el('div', 'fy-k', FAIRY_UI.DOH),
    bar(f.doh, FAIRY.DOH_MAX, `${fmt(f.doh)}/${fmt(FAIRY.DOH_MAX)}`),
  );
  const top = el('div', 'fy-top');
  top.append(fairyModel(fairyArtOf(f.tid, guard ? host.skin()?.actFairy ?? 0 : 0)), head);
  const actions = el('div', 'fy-row');
  const toggle = button(guard ? FAIRY_TEXT.REST : FAIRY_TEXT.GUARD, () => host.setGuard(f, !guard), host.busy());
  toggle.title = FAIRY_UI.STATE_TIP;
  actions.append(
    el('span', guard ? 'fy-guard' : 'ft-muted', guard ? FAIRY_TEXT.GUARD : FAIRY_TEXT.REST),
    toggle,
    button(FAIRY_UI.RELEASE, () => host.release(f), host.busy()),
  );
  body.append(top, actions, attrTable(f), guardBox(f));
}
