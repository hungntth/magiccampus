// Typed data_tbl_skill rows (columns the battle and the skill list need), keyed by skill id. Pure builder, cached by GameDataService.

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export interface SkillTemplate {
  id: number;
  name: string;
  type: number;
  kind: number;
  level: number;
  useMp: number; // < 1 = fraction of max MP, >= 1 absolute
  useSp: number;
  iconCode: string;
  targetType: number;
  reqLevel: number;
  base: number; // Go adapter: int(exp_skill), both 0 / -1 in every starter skill -> basic-attack numbers
  mult: number;
  // pet skill books / passives (phase E)
  buffId: number; // passive skills (type 11): data_tbl_buff id, 0 when none
  creKind: string; // "classIds|minQLevel" creature gate, '' = unrestricted
  codeName: string; // conflict key between pet skills
  scriptReqL: string; // conflict key between pet skills
  description: string;
  // skill window (M9 phase B): learning / upgrade costs and gates. exp_skill is BOTH the damage base above and the upgrade cost.
  useEnv: number;
  reqClass: number[]; // '|1|2|' -> [1, 2]; empty = any class
  reqCl: number; // class rank; 10 = rebirth only
  expSkill: number; // exp pool cost of learning this row
  price: number; // silver cost (moneyBind first, else money, never split)
  // M10 E2.0 NPC skill execution (Go skill_adapter.go): area pattern, targets, hits, buff landing
  areaAttack: number; // -1 / 0 none, 1 vertical, 2 horizontal, 3 cross, 4 random
  targetNum: number;
  attackNum: number;
  buffRate: number; // percent
  buffRound: number;
}

const pipeInts = (v: unknown): number[] =>
  str(v).split('|').map((p) => p.trim()).filter((p) => p !== '').map(Number).filter((n) => Number.isInteger(n));

export function buildSkillTable(rows: readonly Raw[]): Map<number, SkillTemplate> {
  const out = new Map<number, SkillTemplate>();
  for (const r of rows) {
    const id = num(r.id, -1);
    if (id < 0) continue;
    const dex = num(r.dex_skill);
    out.set(id, {
      id, name: String(r.name ?? ''), type: num(r.type), kind: num(r.kind), level: Math.max(1, num(r.level, 1)),
      useMp: Math.max(0, num(r.use_mp)), useSp: Math.max(0, num(r.use_sp)), iconCode: String(r.icon_code ?? 0),
      targetType: num(r.target_type), reqLevel: num(r.req_level),
      base: num(r.exp_skill) > 0 ? Math.trunc(num(r.exp_skill)) : 10,
      mult: dex > 10 ? dex / 100 : dex > 0 ? dex : 1,
      buffId: Math.max(0, num(r.buff_id)), creKind: str(r.cre_kind), codeName: str(r.code_name), scriptReqL: str(r.script_req_l),
      description: str(r.description),
      useEnv: num(r.use_env), reqClass: pipeInts(r.req_class), reqCl: num(r.req_c_l), expSkill: Math.max(0, Math.trunc(num(r.exp_skill))),
      price: Math.max(0, Math.trunc(num(r.price))),
      areaAttack: num(r.area_attack), targetNum: num(r.target_num, 1), attackNum: num(r.attack_num, 1),
      buffRate: num(r.buff_rate), buffRound: num(r.buff_round),
    });
  }
  return out;
}

/** Index by exact name, each list ordered by level then id (the pet book picks the lowest level). */
export function skillsByName(table: ReadonlyMap<number, SkillTemplate>): Map<string, SkillTemplate[]> {
  const out = new Map<string, SkillTemplate[]>();
  for (const t of table.values()) {
    if (!t.name) continue;
    const list = out.get(t.name);
    if (list) list.push(t);
    else out.set(t.name, [t]);
  }
  for (const list of out.values()) list.sort((a, b) => a.level - b.level || a.id - b.id);
  return out;
}

/** code_name families (levels ascending) and every level-1 row, for the skill window and the book lookup. */
export interface SkillIndex {
  byCode: Map<string, SkillTemplate[]>;
  level1: SkillTemplate[];
}

export function buildSkillIndex(table: ReadonlyMap<number, SkillTemplate>): SkillIndex {
  const byCode = new Map<string, SkillTemplate[]>();
  const level1: SkillTemplate[] = [];
  for (const t of table.values()) {
    if (t.level === 1) level1.push(t);
    if (!t.codeName) continue;
    const list = byCode.get(t.codeName);
    if (list) list.push(t);
    else byCode.set(t.codeName, [t]);
  }
  for (const list of byCode.values()) list.sort((a, b) => a.level - b.level || a.id - b.id);
  level1.sort((a, b) => a.id - b.id);
  return { byCode, level1 };
}
