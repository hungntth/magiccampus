// Pure helpers of the Hồn Khí window (no DOM): show / hole lookups, rune slot geometry, the next free socket for a rune, dissolve preview, text.

import {
  DECO_PROP_NAMES, DECO_RUNE_SLOTS, decoMaxShowLvl, decoRuneSlotOpen, decoShowLive, runeStatValue, runeValueText,
  type DecoCatalog, type DecoHoleRow, type DecoPositionInfo, type DecoShowRow, type PropLine, type RuneBag, type RuneRow,
} from '@mc/shared';

export const showsAt = (c: DecoCatalog, position: number): DecoShowRow[] => c.shows.filter((s) => s.position === position).sort((a, b) => a.id - b.id);

export const holeRow = (c: DecoCatalog, id: number): DecoHoleRow | undefined => c.holes.find((h) => h.id === id);

/** holePos (1-based) list of a page: 0 character = odd, 1 pet = even. */
export const pageHoles = (page: number): number[] => Array.from({ length: DECO_RUNE_SLOTS / 2 }, (_, i) => 2 * i + 1 + page);

/** Highest look tier a position may show. */
export const maxTier = (p: DecoPositionInfo): number => decoMaxShowLvl(p.level);

export function showState(p: DecoPositionInfo, show: DecoShowRow, now: number): 'locked' | 'owned' | 'worn' {
  const due = p.activeFlag.s[String(show.id)];
  if (due === undefined || !decoShowLive(due, now)) return 'locked';
  return p.did === show.id ? 'worn' : 'owned';
}

/** First open, empty hole of the rune's page whose page has no rune of the same prop type yet (the server refuses duplicates); 0 when none. */
export function firstSocket(p: DecoPositionInfo, rune: RuneRow, runeOf: (id: number) => RuneRow | undefined): number {
  const page = rune.k === 2 ? 1 : 0;
  const taken = new Set(pageHoles(page).map((h) => runeOf(p.r[h - 1])?.pt).filter((t): t is number => t !== undefined));
  if (taken.has(rune.pt)) return 0;
  return pageHoles(page).find((h) => decoRuneSlotOpen(p.level, h - 1) && p.r[h - 1] === 0) ?? 0;
}

/** Exp a dissolve of the picked slots would give (exp x stack of matching slots). */
export function dissolveGain(bag: RuneBag, page: number, picked: ReadonlySet<string>, runeOf: (id: number) => RuneRow | undefined): number {
  const slots = page === 1 ? bag.petBag : bag.chaBag;
  let sum = 0;
  for (const k of picked) {
    const s = slots[k];
    const def = s ? runeOf(s.r) : undefined;
    if (s && def) sum += def.e * s.n;
  }
  return sum;
}

export const propName = (t: number): string => DECO_PROP_NAMES[t] ?? `#${t}`;

/** "HP+187" from a raw hole / show line. */
export const lineText = (l: PropLine): string => `${propName(l.t)}+${l.v}`;

export const runeLine = (r: RuneRow): string => `${propName(r.pt)}+${runeValueText(r.pt, r.pn)}`;

/** Tooltip of a rune: name, level, prop, dissolve / up-level exp. */
export function runeTip(r: RuneRow, name: string): string {
  const next = r.nx > 0 ? `Exp thăng cấp: ${r.ue}` : 'Cấp tối đa';
  return `${name} Lv${r.lv}\n${runeLine(r)}\nExp phân giải: ${r.e}\n${next}`;
}

/** Stat total of a page over the four Hồn Khí, as lines (panel units; types without a label are skipped). */
export function pageTotals(info: Record<string, DecoPositionInfo>, page: number, runeOf: (id: number) => RuneRow | undefined): { t: number; v: number }[] {
  const totals = new Map<number, number>();
  for (const p of Object.values(info)) {
    const props = new Map<number, number>();
    for (const h of pageHoles(page)) {
      const def = decoRuneSlotOpen(p.level, h - 1) ? runeOf(p.r[h - 1]) : undefined;
      const v = def ? runeStatValue(def.pt, def.pn) : 0;
      if (def && v !== 0) props.set(def.pt, v);
    }
    for (const [t, v] of props) totals.set(t, (totals.get(t) ?? 0) + v);
  }
  return [...totals].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t);
}
