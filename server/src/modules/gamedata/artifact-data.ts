// Typed view over data_tbl_artifact (6 main magic weapon templates x 50 levels) and the magic-weapon skill pool
// (data_tbl_skill use_env = 5). Pure: GameDataService feeds the raw rows.

type Raw = Record<string, unknown>;

export interface ArtifactRow {
  tid: number;
  level: number;
  propNum1: number; // HP of the level
  propNum2: number; // speed of the level
  spirit: number; // spirituality cost of reaching this level
  itemNum: number; // stage crystals consumed by the attempt
  rate: number; // success chance in percent
}

export interface MwSkill {
  id: number;
  name: string;
  description: string;
}

export interface ArtifactTables {
  /** Rows per template id, ordered by level (index = level - 1 when the levels are contiguous from 1). */
  byTid: Map<number, ArtifactRow[]>;
  skills: Map<number, MwSkill>;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function buildArtifactTables(rows: readonly Raw[], skillRows: readonly Raw[]): ArtifactTables {
  const byTid = new Map<number, ArtifactRow[]>();
  for (const r of rows) {
    const row: ArtifactRow = {
      tid: num(r.tid), level: num(r.level), propNum1: num(r.prop_num1), propNum2: num(r.prop_num2), spirit: num(r.spirit_num),
      itemNum: num(r.item_num), rate: num(r.rate),
    };
    const list = byTid.get(row.tid);
    if (list) list.push(row);
    else byTid.set(row.tid, [row]);
  }
  for (const list of byTid.values()) list.sort((a, b) => a.level - b.level);
  const skills = new Map<number, MwSkill>();
  for (const s of skillRows) {
    const id = num(s.id);
    if (id > 0) skills.set(id, { id, name: String(s.name ?? `#${id}`), description: String(s.description ?? '') });
  }
  return { byTid, skills };
}

/** The row of `tid` at `level`, if any. */
export function artifactRowAt(t: ArtifactTables, tid: number, level: number): ArtifactRow | undefined {
  return t.byTid.get(tid)?.find((r) => r.level === level);
}

/** Total spirituality paid to reach `level` from 0 (rows 1..level), the base of the resolve refund. */
export function cumulativeSpirit(t: ArtifactTables, tid: number, level: number): number {
  let sum = 0;
  for (const r of t.byTid.get(tid) ?? []) if (r.level >= 1 && r.level <= level) sum += r.spirit;
  return sum;
}
