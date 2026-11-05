// Typed combat tables: data_tbl_map_creature rows by map, the data_tbl_creature columns the battle stats need and
// data_tbl_creature_loot rows by creature.
// Pure builders (no Mongo) so they can be unit-tested; GameDataService caches the result at startup.

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface MapCreatureRow {
  id: number;
  mapId: number;
  creatureId: number;
  startRate: number;
  endRate: number;
  level: number;
  bossFlag: number;
  exp: number; // -1 = none (use level * 10)
  expMulti: number;
  withCloud: number;
}

export interface CreatureTemplate {
  id: number;
  name: string;
  useLevel: number;
  life: number; // per-10000 hp percent
  growBase: number;
  att: { str: number; agi: number; sta: number; int: number; eng: number };
  apt: { str: number; agi: number; sta: number; int: number; eng: number }; // per-mille
  propHit: number;
  propDodge: number;
  propSpeed: number;
  propCritical: number;
  resCode: string;
  element: number; // 0 Vô … 6 Hỏa (Go NormalizeClientElementID: out of range = 0)
}

/** data_tbl_creature_loot: qid > 0 = only while that quest is active, rate is x/50000. qty columns are absent in the seeds (1). */
export interface LootRow {
  id: number;
  creatureId: number;
  itemId: number;
  type: number; // 29 item (the only value in the seeds)
  questId: number; // -1 = none
  rate: number;
  qtyMin: number;
  qtyMax: number;
  bound: boolean;
}

export function toLoot(r: Raw): LootRow {
  const qtyMin = Math.max(1, num(r.qty_min, 1));
  return {
    id: num(r.id), creatureId: num(r.cid), itemId: num(r.item_id), type: num(r.type, 29), questId: num(r.qid, -1),
    rate: num(r.rate), qtyMin, qtyMax: Math.max(qtyMin, num(r.qty_max, qtyMin)), bound: num(r.b) === 1,
  };
}

export function toMapCreature(r: Raw): MapCreatureRow {
  return {
    id: num(r.id), mapId: num(r.mid), creatureId: num(r.cid), startRate: num(r.start_rate), endRate: num(r.end_rate),
    level: num(r.level), bossFlag: num(r.boss_flag), exp: num(r.exp, -1), expMulti: num(r.exp_multi, 1),
    withCloud: num(r.with_cloud, -1),
  };
}

export function toCreature(r: Raw): CreatureTemplate {
  return {
    id: num(r.id),
    name: String(r.name ?? ''),
    useLevel: num(r.use_lv),
    life: num(r.life, 10000),
    growBase: num(r.grow_base),
    att: {
      str: num(r.att_strength), agi: num(r.att_agility), sta: num(r.att_stamina), int: num(r.att_intelligence),
      eng: num(r.att_energy),
    },
    apt: {
      str: num(r.apt_strength), agi: num(r.apt_agility), sta: num(r.apt_stamina), int: num(r.apt_intelligence),
      eng: num(r.apt_energy),
    },
    propHit: num(r.prop_hit), propDodge: num(r.prop_dodge), propSpeed: num(r.prop_speed),
    propCritical: num(r.prop_critical),
    resCode: String(r.res_code ?? 0),
    element: Number.isInteger(num(r.element)) && num(r.element) >= 0 && num(r.element) <= 6 ? num(r.element) : 0,
  };
}

export interface CombatTables {
  mapCreatures: Map<number, MapCreatureRow[]>;
  creatures: Map<number, CreatureTemplate>;
  loot: Map<number, LootRow[]>;
}

export function buildCombatTables(
  mapRows: readonly Raw[], creatureRows: readonly Raw[], lootRows: readonly Raw[] = [],
): CombatTables {
  const mapCreatures = new Map<number, MapCreatureRow[]>();
  for (const raw of mapRows) {
    const row = toMapCreature(raw);
    const list = mapCreatures.get(row.mapId);
    if (list) list.push(row);
    else mapCreatures.set(row.mapId, [row]);
  }
  const creatures = new Map<number, CreatureTemplate>();
  for (const raw of creatureRows) {
    const c = toCreature(raw);
    creatures.set(c.id, c);
  }
  const loot = new Map<number, LootRow[]>();
  for (const raw of lootRows) {
    const row = toLoot(raw);
    const list = loot.get(row.creatureId);
    if (list) list.push(row);
    else loot.set(row.creatureId, [row]);
  }
  return { mapCreatures, creatures, loot };
}
