// The six (prop, prop_num) slots of a data_tbl_buff row as a list, for consumers that read single props (battle exp rate 24 / 25,
// catch points 27) instead of the stat pipeline.

type Tpl = Record<string, unknown>;

export interface BuffProp {
  prop: number;
  num: number;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Non-empty prop slots of the template; `percent` is its percent_flag (1 = the numbers are percents). */
export function buffProps(tpl: Tpl | undefined): { percent: boolean; props: BuffProp[] } {
  const props: BuffProp[] = [];
  for (let n = 1; n <= 6; n++) {
    const prop = Math.trunc(num(tpl?.[`prop${n}`]));
    if (prop > 0) props.push({ prop, num: num(tpl?.[`prop_num${n}`]) });
  }
  return { percent: num(tpl?.percent_flag) === 1, props };
}

/** Catch points (prop 27) of a buff, e.g. Luyen Thu Don buff 565 = 4. */
export function catchPointsOfBuff(tpl: Tpl | undefined): number {
  return buffProps(tpl).props.reduce((sum, p) => sum + (p.prop === 27 ? Math.max(0, Math.trunc(p.num)) : 0), 0);
}
