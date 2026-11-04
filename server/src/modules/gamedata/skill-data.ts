// Typed data_tbl_skill rows (columns the battle and the skill list need), keyed by skill id. Pure builder, cached by GameDataService.

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

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
}

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
    });
  }
  return out;
}
