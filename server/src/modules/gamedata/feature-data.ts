// Typed views over the stat-feature tables (data_tbl_soul, data_tbl_awakening, data_tbl_awakening_skill, data_tbl_war_sprite):
// rows by level / id with the prop / prop_num pairs folded into PropLine lists. Pure: GameDataService feeds the raw rows.

import type { PropLine } from '@mc/shared';

type Raw = Record<string, unknown>;

export interface SoulRow {
  level: number;
  requireNum: number;
  props: PropLine[];
}

export interface AwakenRow {
  level: number;
  name: string;
  itemNum: number;
  money: number;
  rate: number;
  points: number;
  reqLevel: number;
  props: PropLine[];
}

export interface AwakenSkillRow {
  id: number;
  code: string;
  name: string;
  desc: string;
  cost: number;
  max: number;
  req: number;
  reqClass: number;
}

export interface WspRow {
  id: number;
  kind: number;
  level: number;
  name: string;
  nextId: number;
  costNum: number;
  costGold: number;
  props: PropLine[];
}

export interface FeatureTables {
  soul: Map<number, SoulRow>;
  awakening: Map<number, AwakenRow>;
  awakenSkills: Map<number, AwakenSkillRow>;
  warSprites: Map<number, WspRow>;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** `[{t: prop<i>, v: <valueKey><i>}]` for i = 1..count, skipping empty (t <= 0) pairs. */
function pairs(r: Raw, typeKey: string, valueKey: string, count: number): PropLine[] {
  const out: PropLine[] = [];
  for (let i = 1; i <= count; i++) {
    const t = num(r[`${typeKey}${i}`]);
    if (t > 0) out.push({ t, v: num(r[`${valueKey}${i}`]) });
  }
  return out;
}

export function buildFeatureTables(soul: Raw[], awakening: Raw[], skills: Raw[], warSprites: Raw[]): FeatureTables {
  const t: FeatureTables = { soul: new Map(), awakening: new Map(), awakenSkills: new Map(), warSprites: new Map() };
  for (const r of soul) {
    const level = num(r.id);
    t.soul.set(level, { level, requireNum: num(r.require_num), props: pairs(r, 'prop', 'prop_num', 10) });
  }
  for (const r of awakening) {
    const level = num(r.id);
    t.awakening.set(level, {
      level, name: String(r.name ?? ''), itemNum: num(r.item_num), money: num(r.money), rate: num(r.rate),
      points: num(r.points), reqLevel: num(r.req_level), props: pairs(r, 'prop', 'prop_num', 2),
    });
  }
  for (const r of skills) {
    const id = num(r.id);
    const code = String(r.skill_code_name ?? '').split('|')[0] ?? '';
    t.awakenSkills.set(id, {
      id, code, name: String(r.name ?? ''), desc: String(r.description ?? ''), cost: num(r.cost_points),
      max: num(r.max_level), req: num(r.req_points), reqClass: num(r.req_class),
    });
  }
  for (const r of warSprites) {
    const id = num(r.id);
    t.warSprites.set(id, {
      id, kind: num(r.kind), level: num(r.level), name: String(r.name ?? ''), nextId: num(r.next_id),
      costNum: num(r.cost_num), costGold: num(r.cost_gold), props: pairs(r, 'p_t', 'p_n', 8),
    });
  }
  return t;
}
