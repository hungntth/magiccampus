// Guild static data builders (pure): data_tbl_building rows -> BuildingRow, data_tbl_extend_position -> lots on the guild map,
// data_tbl_skill rows with use_env 4 -> GuildSkillRow plus the per-chain index. Cached by GameDataService.

import { GUILD_SKILL, skillChainKey, type GuildSkillRow, type BuildingRow } from '@mc/shared';

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export interface GuildLot {
  id: number;
  mid: number;
  posX: number;
  posY: number;
  posDir: number;
  tid: number;
  buildType: number;
}

export interface GuildBuildingTables {
  rows: Map<number, BuildingRow>;
  lots: GuildLot[];
}

export function buildGuildBuildingTables(buildings: readonly Raw[], lots: readonly Raw[]): GuildBuildingTables {
  const rows = new Map<number, BuildingRow>();
  for (const r of buildings) {
    const id = num(r.id, -1);
    if (id < 0) continue;
    rows.set(id, {
      id, chain: str(r.code_name), level: num(r.level), name: str(r.name), description: str(r.description), type: num(r.type),
      numLimit: num(r.num_limit, -1), moneyCost: num(r.money_cost), expCost: num(r.exp_cost), genCost: num(r.gen_m_cost),
      rareCost: num(r.rare_m_cost), spCost: num(r.sp_m_cost),
      pre: str(r.pre_building).split('|').map((p) => Number(p)).filter((p) => Number.isInteger(p) && p > 0),
      resCode: str(r.res_code) || '0', iconCode: str(r.icon_code) || '0', funcScript: str(r.func_script),
    });
  }
  const list = lots.map((l) => ({
    id: num(l.id), mid: num(l.mid), posX: num(l.pos_x), posY: num(l.pos_y), posDir: num(l.pos_dir), tid: num(l.tid, 1),
    buildType: num(l.build_type, 1),
  })).sort((a, b) => a.id - b.id);
  return { rows, lots: list };
}

export interface GuildSkillTables {
  byId: Map<number, GuildSkillRow>;
  /** chain -> rows by ascending level. */
  chains: Map<string, GuildSkillRow[]>;
}

/** Only rows with a develop cost are guild skills a guild can open (levels 7..10 "NO" rows have none and stay unreachable). */
export function buildGuildSkillTables(skills: readonly Raw[]): GuildSkillTables {
  const byId = new Map<number, GuildSkillRow>();
  const chains = new Map<string, GuildSkillRow[]>();
  for (const r of skills) {
    if (num(r.use_env) !== GUILD_SKILL.USE_ENV || num(r.guild_dev_exp) <= 0) continue;
    const row: GuildSkillRow = {
      id: num(r.id), chain: skillChainKey(str(r.code_name)), level: Math.max(1, num(r.level, 1)), name: str(r.name),
      description: str(r.description).replace(/\s*\r?\n\s*/g, ' ').trim(), iconCode: str(r.icon_code) || '0',
      devExp: num(r.guild_dev_exp), devMoney: num(r.guild_dev_money), contrib: num(r.cost_guild_contrib),
      buffId: Math.max(0, num(r.buff_id)), reqLevel: num(r.req_level),
      reqClasses: str(r.req_class).split('|').map((c) => Number(c)).filter((c) => Number.isInteger(c) && c > 0),
    };
    byId.set(row.id, row);
    const list = chains.get(row.chain) ?? [];
    list.push(row);
    chains.set(row.chain, list);
  }
  for (const list of chains.values()) list.sort((a, b) => a.level - b.level);
  return { byId, chains };
}
