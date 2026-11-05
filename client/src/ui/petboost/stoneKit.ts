// Seat widget of the stone tabs: a stone-bag slot shown as a seat (icon, colour by level, stack count) that opens the picker list
// of candidate stones. Reuses the Luyện seats / picker (petfunc/seats.ts); `body` must sit inside a `.pf-win`.

import { petStoneDef } from '@mc/shared';
import { openPicker, seatEl, type PickOption } from '../petfunc/seats';
import { defOf, skillName, stoneTitle } from './stoneRules';
import type { StoneEntry } from './stoneTypes';

export interface StoneSeatOpts {
  body: HTMLElement;
  label: string;
  entries: readonly StoneEntry[];
  /** Currently chosen sid (null = empty). */
  get(): number | null;
  set(sid: number | null): void;
  /** Stones the picker lists (already filtered). */
  candidates: readonly StoneEntry[];
  /** Units one action takes (the count shows have/need). */
  need?: number;
  changed(): void;
}

export const stonePickOption = (e: StoneEntry, onPick: () => void): PickOption => ({
  label: defOf(e)?.name ?? `#${e.tid}`, sub: `x${e.num}${e.skillId > 0 ? ` · ${skillName(e.skillId)}` : ''}`, iconCode: defOf(e)?.icon, color: defOf(e)?.level, onPick,
});

export function stoneSeat(o: StoneSeatOpts): HTMLElement {
  const cur = o.entries.find((e) => e.sid === o.get());
  const def = cur ? petStoneDef(cur.tid) : undefined;
  const box = seatEl(
    {
      label: def ? def.name : o.label, iconCode: def?.icon, color: def?.level,
      count: cur ? (o.need ? `${cur.num}/${o.need}` : String(cur.num)) : undefined, lacking: !!cur && !!o.need && cur.num < o.need,
      title: cur ? stoneTitle(cur) : `${o.label} (nhấp để chọn)`,
    },
    () => {
      const options = o.candidates.map((e) => stonePickOption(e, () => {
        o.set(e.sid);
        o.changed();
      }));
      if (cur) options.unshift({ label: '(Bỏ chọn)', onPick: () => { o.set(null); o.changed(); } });
      openPicker(o.body, box.querySelector<HTMLElement>('.pf-seat') ?? box, options, 'Túi Thú Thạch không có viên phù hợp');
    },
  );
  return box;
}
