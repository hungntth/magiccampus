// Tụ Linh tab: absorbPetStone([main, s1..s4]). Five level 5 regular stones (a slot may repeat while its stack covers it); the main
// stone decides the result (its family's Tụ Linh Thạch), the four others are consumed. "Tự chọn đủ" fills the seats automatically.

import { PET_STONE_ABSORB_COUNT, petStoneDef } from '@mc/shared';
import { el } from '../petPanelTabs';
import { Runner, button, buildFrame, lines, showResult } from '../petfunc/tabKit';
import { STONE_TEXT as T } from './boostText';
import { stoneSeat } from './stoneKit';
import { absorbResult, absorbable, autoPicks } from './stoneRules';
import type { StoneTab } from './stoneTypes';

export const absorbTab: StoneTab = {
  id: 'absorb',
  label: T.tabs[1],
  build(host, body) {
    const f = buildFrame(body, T.guides[1]);
    const run = new Runner();
    /** Seat i holds a bag sid or null. */
    let picks: (number | null)[] = Array.from({ length: PET_STONE_ABSORB_COUNT }, () => null);

    const otherSeats = (i: number): number[] => picks.filter((p, k): p is number => k !== i && p !== null);
    const chosen = (): number[] => picks.filter((p): p is number => p !== null);
    const draw = (): void => {
      const entries = host.entries();
      // A stack that shrank or vanished under a seat (push) drops the seats beyond it.
      const used = new Map<number, number>();
      picks = picks.map((p) => {
        if (p === null) return null;
        const n = (used.get(p) ?? 0) + 1;
        used.set(p, n);
        const e = entries.find((x) => x.sid === p);
        return e && absorbable(e) && e.num >= n ? p : null;
      });
      f.seats.replaceChildren(...picks.map((p, i) => stoneSeat({
        body, label: i === 0 ? T.main : `${T.sub} ${i}`, entries, get: () => p,
        set: (s) => { picks[i] = s; f.result.replaceChildren(); },
        // The picker only offers stones whose stack still has a free unit beyond the other seats.
        candidates: entries.filter((e) => absorbable(e) && otherSeats(i).filter((x) => x === e.sid).length < e.num),
        changed: draw,
      })));
      const all = chosen();
      const result = all.length === PET_STONE_ABSORB_COUNT && picks[0] !== null ? absorbResult(all, entries) : null;
      const out = result ? petStoneDef(result) : undefined;
      const rows: Parameters<typeof lines>[1] = [];
      if (all.length < PET_STONE_ABSORB_COUNT) rows.push(`${T.absorbNeed} (${all.length}/${PET_STONE_ABSORB_COUNT})`);
      if (out) rows.push([`${T.absorbResult}: ${out.name}`, 'ok']);
      else if (all.length === PET_STONE_ABSORB_COUNT) rows.push([T.absorbMainNeed, 'bad']);
      lines(f.info, rows);
      f.buttons.replaceChildren(
        button(T.absorbBtn, () => absorb(), result !== null && !run.pending),
        button(T.absorbFill, () => fill(), !run.pending, false),
        button(T.absorbClear, () => { picks = picks.map(() => null); draw(); }, !run.pending, false),
      );
    };

    const fill = (): void => {
      const main = picks[0] ?? host.entries().find(absorbable)?.sid;
      if (main === undefined) return;
      const auto = autoPicks(host.entries(), main);
      picks = Array.from({ length: PET_STONE_ABSORB_COUNT }, (_, i) => auto[i] ?? null);
      draw();
    };

    const absorb = (): void => {
      const sids = chosen();
      const mainDef = petStoneDef(host.entries().find((e) => e.sid === sids[0])?.tid ?? 0);
      const out = mainDef ? petStoneDef(mainDef.energyId) : undefined;
      void run.run(async () => {
        const bag = await host.actions.absorb(sids);
        if (!bag) return;
        picks = picks.map(() => null);
        showResult(f, T.absorbResult, [el('div', 'pf-line ok', out ? out.name : '')]);
      }, draw);
    };

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};
