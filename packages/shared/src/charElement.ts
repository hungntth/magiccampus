// Character element ("Thuộc tính") of the character panel figure (legacy property ee / en / ef): the dominant element of
// the worn gear and how many pieces carry it. Mirrors the Go ApplyCharacterElementState; ids are the Flash enum.

/** GamePredef ELEMENT_NAME (GAMEPREDEF_S[241..247]): 0 Vô, 1 Quang, 2 Ám, 3 Phong, 4 Địa, 5 Thủy, 6 Hỏa. */
export const CHAR_ELEMENT_NAMES = ['Vô', 'Quang', 'Ám', 'Phong', 'Địa', 'Thủy', 'Hỏa'] as const;
export const CHAR_ELEMENT_MAX_RANK = 12;

export interface CharElementState {
  ee: number; // dominant element id, 0 = none
  en: number; // pieces carrying it, 0..12 (figure fill level)
  ef: boolean; // MAX glow: all 12 soul slots active (soul activation is not ported yet, always false)
}

/** Dominant element of the worn pieces; ties go to the lower id. */
export function charElementOf(items: Iterable<{ element?: number }>): CharElementState {
  const counts = new Map<number, number>();
  let ee = 0;
  let best = 0;
  for (const it of items) {
    const e = Number(it.element ?? 0);
    if (!Number.isInteger(e) || e < 1 || e >= CHAR_ELEMENT_NAMES.length) continue;
    const n = (counts.get(e) ?? 0) + 1;
    counts.set(e, n);
    if (n > best || (n === best && e < ee)) {
      ee = e;
      best = n;
    }
  }
  return { ee, en: Math.min(best, CHAR_ELEMENT_MAX_RANK), ef: false };
}

/** Tooltip strength word (CHARACTORPANEL_S[3..5], [36]): Yếu < 4, Vừa 4-8, Mạnh 9+, MAX with ef. */
export function charElementStrength(s: CharElementState): string {
  if (s.ef) return 'MAX';
  return s.en < 4 ? 'Yếu' : s.en < 9 ? 'Vừa' : 'Mạnh';
}
