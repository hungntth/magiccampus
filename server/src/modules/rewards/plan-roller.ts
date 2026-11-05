// TBL_PLAN rolls (Go dungeon chest / package rolls, dungeon-mehuyen "Chest"): rows `t = 3, st = <plan>`; `r >= 1` always drops,
// `r < 1` is an independent roll. `ti` 29 item, 19 equipment, 98 medal (H5 has no medals: skipped by the caller); `b` bound;
// `q` = material grade (item colour q - 1, 0 = template colour). Pure.

export interface PlanRow {
  id: number;
  st: string;
  t: number;
  ti: number; // table: 29 item, 19 equipment, 98 medal
  ii: number; // template id
  n: number; // count
  b: boolean; // bound
  q: number; // grade (0 = template colour)
  r: number; // rate
  qid: number; // -1 = any
}

export interface PlanDrop {
  table: number;
  templateId: number;
  qty: number;
  bound: boolean;
  grade: number;
  rowId: number;
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function toPlanRow(r: Record<string, unknown>): PlanRow {
  return {
    id: num(r.id), st: String(r.st ?? ''), t: num(r.t), ti: num(r.ti), ii: num(r.ii), n: Math.max(1, num(r.n)),
    b: num(r.b) > 0, q: num(r.q), r: num(r.r), qid: r.qid === undefined || r.qid === null ? -1 : num(r.qid),
  };
}

/** Rolls every row of one plan: `rng()` in [0, 1) per row with `r < 1`. */
export function rollPlan(rows: readonly PlanRow[], rng: () => number): PlanDrop[] {
  const out: PlanDrop[] = [];
  for (const row of rows) {
    if (row.ii <= 0 || row.r <= 0) continue;
    if (row.r < 1 && rng() >= row.r) continue;
    out.push({ table: row.ti, templateId: row.ii, qty: row.n, bound: row.b, grade: row.q, rowId: row.id });
  }
  return out;
}

/** Item colour of a graded plan drop (q - 1), or -1 to keep the template colour. */
export function gradeColor(grade: number): number {
  return grade > 0 ? grade - 1 : -1;
}
