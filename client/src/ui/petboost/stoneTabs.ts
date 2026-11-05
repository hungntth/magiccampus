// Dung Hợp, Luyện and Phân Giải tabs of the Tụ Linh Bảo Thạch window: composePetStone(sid, qty), changePetStoneEnergy(sid, cid, type)
// and resolvePetStone(sid, num). Each tab keeps its chosen bag slot and redraws on bag / wallet pushes; refusals leave the state alone.

import { PET_STONE_COMPOSE_RATIO, PET_STONE_ENERGY_COST, petStoneDef, PET_STONE_SKILL_TYPE } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { Runner, button, buildFrame, lines, showResult } from '../petfunc/tabKit';
import { STONE_TEXT as T } from './boostText';
import { stoneSeat } from './stoneKit';
import { composable, defOf, isEnergy, maxCompose, skillName, statLine } from './stoneRules';
import type { StoneTab } from './stoneTypes';

function qtyInput(value: number, max: number, onChange: (n: number) => void): HTMLElement {
  const wrap = el('div', 'pf-stepper');
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = String(Math.max(1, max));
  input.value = String(Math.min(Math.max(1, value), Math.max(1, max)));
  input.className = 'pe-num';
  input.onchange = () => onChange(Math.floor(Number(input.value)));
  wrap.append(el('span', 'pf-line', T.qty), input);
  return wrap;
}

const clampQty = (n: number, max: number): number => Math.min(Math.max(1, Number.isInteger(n) ? n : 1), Math.max(1, max));

export const composeTab: StoneTab = {
  id: 'compose',
  label: T.tabs[0],
  build(host, body) {
    const f = buildFrame(body, T.guides[0]);
    const run = new Runner();
    let sid: number | null = null;
    let qty = 1;
    const draw = (): void => {
      const entries = host.entries();
      const cur = entries.find((e) => e.sid === sid && composable(e));
      if (!cur) sid = null;
      const def = cur ? defOf(cur) : undefined;
      const max = cur ? maxCompose(cur) : 0;
      qty = clampQty(qty, max);
      f.seats.replaceChildren(
        stoneSeat({ body, label: T.stone, entries, get: () => sid, set: (s) => { sid = s; f.result.replaceChildren(); }, candidates: entries.filter(composable), need: cur ? qty * PET_STONE_COMPOSE_RATIO : undefined, changed: draw }),
        qtyInput(qty, max, (n) => { qty = clampQty(n, max); draw(); }),
      );
      const next = def ? petStoneDef(def.nextId) : undefined;
      lines(f.info, cur && def && next
        ? [`${T.composeNeed}: ${qty * PET_STONE_COMPOSE_RATIO} ${def.name} (${cur.num})`, `${T.composeCost}: ${def.costSil * qty}`,
          [`${T.composeAfter}: ${next.name} x${qty}  ${statLine(next)}`, 'ok']]
        : [sid === null && entries.length > 0 ? T.pickStone : entries.length === 0 ? T.noStone : T.composeLimit]);
      f.buttons.replaceChildren(button(T.composeBtn, () => compose(), !!cur && max >= 1 && !run.pending));
    };
    const compose = (): void => {
      const cur = host.entries().find((e) => e.sid === sid);
      const def = cur ? defOf(cur) : undefined;
      if (!cur || !def) return;
      void run.run(async () => {
        const before = cur.num;
        const bag = await host.actions.compose(cur.sid, qty);
        if (bag) showResult(f, T.composeAfter, [el('div', 'pf-line ok', `${def.name}: ${before} → ${host.entries().find((e) => e.sid === cur.sid)?.num ?? 0}`)]);
      }, draw);
    };
    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};

export const energyTab: StoneTab = {
  id: 'energy',
  label: T.tabs[3],
  build(host, body) {
    const f = buildFrame(body, T.guides[3]);
    const run = new Runner();
    let sid: number | null = null;
    const balance = (): number => host.player().currencies?.energyStone ?? 0;
    const draw = (): void => {
      const entries = host.entries();
      const cur = entries.find((e) => e.sid === sid && isEnergy(e));
      if (!cur) sid = null;
      f.seats.replaceChildren(stoneSeat({ body, label: T.refineStone, entries, get: () => sid, set: (s) => { sid = s; f.result.replaceChildren(); }, candidates: entries.filter(isEnergy), changed: draw }));
      const rows: Parameters<typeof lines>[1] = [`${T.refineHave}${balance()}`];
      if (cur) rows.push(`${T.refineSkill} ${cur.skillId > 0 ? skillName(cur.skillId) : T.refineNone}`);
      rows.push(`${T.refineNeed}${PET_STONE_ENERGY_COST.passive} (${T.refinePassive}) / ${PET_STONE_ENERGY_COST.special} (${T.refineSpecial})`);
      lines(f.info, rows);
      f.buttons.replaceChildren(
        button(`${T.refinePassive} (${PET_STONE_ENERGY_COST.passive})`, () => refine(PET_STONE_SKILL_TYPE.passive), !!cur && !run.pending),
        button(`${T.refineSpecial} (${PET_STONE_ENERGY_COST.special})`, () => refine(PET_STONE_SKILL_TYPE.special), !!cur && !run.pending, false),
      );
    };
    const refine = (type: 1 | 2): void => {
      const cur = host.entries().find((e) => e.sid === sid);
      if (!cur) return;
      const go = (): void => void run.run(async () => {
        const r = await host.actions.energy(cur.sid, type);
        if (!r) return;
        sid = r.newSid;
        showResult(f, T.refineSkill, [el('div', 'pf-line ok', skillName(r.skillId) || T.refineNone)]);
      }, draw);
      if (cur.skillId > 0) askConfirm(type === PET_STONE_SKILL_TYPE.passive ? T.confirmPassive : T.confirmSpecial, go);
      else go();
    };
    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};

export const resolveTab: StoneTab = {
  id: 'resolve',
  label: T.tabs[4],
  build(host, body) {
    const f = buildFrame(body, T.guides[4]);
    const run = new Runner();
    let sid: number | null = null;
    let qty = 1;
    const draw = (): void => {
      const entries = host.entries();
      const cur = entries.find((e) => e.sid === sid);
      if (!cur) sid = null;
      const def = cur ? defOf(cur) : undefined;
      qty = clampQty(qty, cur?.num ?? 1);
      f.seats.replaceChildren(
        stoneSeat({ body, label: T.stone, entries, get: () => sid, set: (s) => { sid = s; f.result.replaceChildren(); }, candidates: entries, changed: draw }),
        qtyInput(qty, cur?.num ?? 1, (n) => { qty = clampQty(n, cur?.num ?? 1); draw(); }),
      );
      lines(f.info, [`${T.refineHave}${host.player().currencies?.energyStone ?? 0}`, def ? [`${T.resolveGet}${def.resolveNum * qty}`, 'ok'] : T.pickStone]);
      f.buttons.replaceChildren(button(T.resolveBtn, () => resolve(), !!cur && !run.pending));
    };
    const resolve = (): void => {
      const cur = host.entries().find((e) => e.sid === sid);
      const def = cur ? defOf(cur) : undefined;
      if (!cur || !def) return;
      const get = def.resolveNum * qty;
      askConfirm(T.resolveConfirm.replace('{num}', String(qty)).replace('{get}', String(get)), () => void run.run(async () => {
        const bag = await host.actions.resolve(cur.sid, qty);
        if (bag) showResult(f, T.resolveGet, [el('div', 'pf-line ok', `+${get}`)]);
      }, draw));
    };
    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};
