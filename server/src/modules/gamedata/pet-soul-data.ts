// Typed, cached view of data_tbl_pet_soul (Menh Hon rows): templates by id, family ladders and the prey / exchange pools.
// A family is a chain of consecutive ids with the same name + colour and level + 1 per step (Go level.go sameFamily).
// Pure builder; GameDataService caches the result at startup.

import type { PetSoulTemplate } from '@mc/shared';

type Raw = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Go advanced pool constants (prey_advanced.go): ordinary = Lv.1 type 1 purple / orange rows, rare = Lv.1 type -1 orange rows. */
const ORDINARY_COLORS: ReadonlySet<number> = new Set([3, 4]);
const RARE_COLOR = 4;

export interface PetSoulTables {
  byId: ReadonlyMap<number, PetSoulTemplate>;
  /** Every id -> its family ladder, level ascending (the same array for all members). */
  ladderOf: ReadonlyMap<number, readonly PetSoulTemplate[]>;
  /** Crystal pools: colour (= crystal - 1) -> Lv.1 type -1 ids, ascending. */
  preyByColor: ReadonlyMap<number, readonly number[]>;
  advancedOrdinary: readonly number[];
  advancedRare: readonly number[];
}

export function buildPetSoulTables(rows: readonly Raw[]): PetSoulTables {
  const sorted = [...rows].sort((a, b) => num(a.id) - num(b.id));
  const byId = new Map<number, PetSoulTemplate>();
  const ladderOf = new Map<number, PetSoulTemplate[]>();
  let chain: PetSoulTemplate[] = [];
  let chainKey = '';
  for (const r of sorted) {
    const id = num(r.id);
    const name = String(r.name ?? '');
    const color = num(r.color);
    const level = num(r.level);
    const prev = chain[chain.length - 1];
    const key = `${name}|${color}`;
    const continues = prev !== undefined && key === chainKey && level === prev.level + 1 && id === prev.id + 1;
    if (!continues) chain = [];
    chainKey = key;
    const family = continues ? prev!.family : `${name}:${color}:${id}`;
    const tpl: PetSoulTemplate = {
      id, family, level, color, type: num(r.type), exp: num(r.exp), upExp: num(r.up_exp), chip: num(r.chip), reqChip: num(r.req_chip),
      propType: num(r.prop_type), propValue: num(r.prop_val), iconCode: String(r.icon_code ?? 0),
    };
    byId.set(id, tpl);
    chain.push(tpl);
    ladderOf.set(id, chain);
  }
  const preyByColor = new Map<number, number[]>();
  const advancedOrdinary: number[] = [];
  const advancedRare: number[] = [];
  for (const tpl of byId.values()) {
    if (tpl.level > 1) continue;
    if (tpl.type === -1) {
      const pool = preyByColor.get(tpl.color) ?? [];
      pool.push(tpl.id);
      preyByColor.set(tpl.color, pool);
      if (tpl.color === RARE_COLOR) advancedRare.push(tpl.id);
    } else if (tpl.type === 1 && ORDINARY_COLORS.has(tpl.color)) advancedOrdinary.push(tpl.id);
  }
  return { byId, ladderOf, preyByColor, advancedOrdinary, advancedRare };
}
