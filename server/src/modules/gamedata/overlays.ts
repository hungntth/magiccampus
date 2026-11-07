// M10 seed overlays. Go applies the per-feature seed files (`data_tbl_plan_khobau.sql`, …) as INSERT … ON CONFLICT into the
// base table; the H5 importer writes each file to its own collection, so loaders union them here: overlay rows replace base
// rows with the same id, the rest are appended. Overlays are listed explicitly per base table (a prefix match would mix
// data_tbl_npc_creature into data_tbl_npc). UPDATE-only seeds are not parsed by the importer: their values live here.

export type OverlayRow = Record<string, unknown>;

export const OVERLAYS: Readonly<Record<string, readonly string[]>> = {
  data_tbl_npc_creature: [
    'data_tbl_npc_creature_crosscontention', 'data_tbl_npc_creature_langhuyet', 'data_tbl_npc_creature_lietdiem',
    'data_tbl_npc_creature_mehuyen', 'data_tbl_npc_creature_quyhutmau', 'data_tbl_npc_creature_thamhiem',
    'data_tbl_npc_creature_thegioiso',
  ],
  data_tbl_plan: [
    'data_tbl_plan_dragon_wheel', 'data_tbl_plan_khobau', 'data_tbl_plan_kythach', 'data_tbl_plan_langhuyet',
    'data_tbl_plan_lietdiem', 'data_tbl_plan_luctien', 'data_tbl_plan_mehuyen', 'data_tbl_plan_quyhutmau',
    'data_tbl_plan_wish_tree',
  ],
  data_tbl_creature_loot: [
    'data_tbl_creature_loot_langhuyet', 'data_tbl_creature_loot_lietdiem', 'data_tbl_creature_loot_luctien',
    'data_tbl_creature_loot_mehuyen', 'data_tbl_creature_loot_mibao_books', 'data_tbl_creature_loot_quyhutmau',
  ],
  data_tbl_quest_require: [
    'data_tbl_quest_require_langhuyet', 'data_tbl_quest_require_lietdiem', 'data_tbl_quest_require_mehuyen',
    'data_tbl_quest_require_quyhutmau', 'data_tbl_quest_require_thegioiso',
  ],
  data_tbl_creature_skill: ['data_tbl_creature_skill_lietdiem', 'data_tbl_creature_skill_mehdi'],
  data_tbl_item_award: [
    'data_tbl_item_award_aocanh', 'data_tbl_item_award_bicanh_rank_bags', 'data_tbl_item_award_cooking_key',
    'data_tbl_item_award_corridor_high_floors', 'data_tbl_item_award_cross_pk_worship',
    'data_tbl_item_award_dragon_keys', 'data_tbl_item_award_explorer_bags', 'data_tbl_item_award_guild_happy_bags',
    'data_tbl_item_award_kimcuong_levels', 'data_tbl_item_award_kythach', 'data_tbl_item_award_lucky_key',
    'data_tbl_item_award_main_quest_chests', 'data_tbl_item_award_pet_keys', 'data_tbl_item_award_quiz',
    'data_tbl_item_award_reported_bags', 'data_tbl_item_award_reported_bags_2', 'data_tbl_item_award_resist_gem_bag',
    'data_tbl_item_award_site_bags', 'data_tbl_item_award_thankhi_sub_bags', 'data_tbl_item_award_trac_viet_sets',
    'data_tbl_item_award_training_bag', 'data_tbl_item_award_worldboss_bags', 'data_tbl_item_award_zz_database_sync',
  ],
  data_tbl_buff: ['data_tbl_buff_ba_dau_poison', 'data_tbl_buff_mehuyen'],
  data_tbl_boss_loot: ['data_tbl_boss_loot_mibao_books'],
  data_tbl_npc: ['data_tbl_npc_daily_answer'],
};

/** data_tbl_quest_quyhutmau.sql + data_tbl_quest_thegioiso.sql (UPDATE seeds): exp, money (money_type 1 = Ngân phiếu). */
export const QUEST_REWARD_OVERRIDES: Readonly<Record<number, { exp: number; money: number; moneyType: number }>> = {
  5448: { exp: 5_000_000, money: 100_000, moneyType: 1 },
  5449: { exp: 6_000_000, money: 100_000, moneyType: 1 },
  5450: { exp: 6_000_000, money: 100_000, moneyType: 1 },
  5451: { exp: 8_000_000, money: 150_000, moneyType: 1 },
  5452: { exp: 10_000_000, money: 200_000, moneyType: 1 },
  50333: { exp: 30_000_000, money: 150_000, moneyType: 1 },
  50334: { exp: 50_000_000, money: 200_000, moneyType: 1 },
  50335: { exp: 40_000_000, money: 150_000, moneyType: 1 },
  50336: { exp: 80_000_000, money: 300_000, moneyType: 1 },
};

/** data_tbl_npc_khobau_event.sql (UPDATE seed): NPC 2596's expired 2025 event window cleared (always visible). */
export const NPC_AT_OVERRIDES: Readonly<Record<number, string | null>> = { 2596: null };

const idOf = (r: OverlayRow): unknown => r._id ?? r.id;

/** Base rows with every overlay applied in order: same id -> replaced (in place), new id -> appended. Rows without id append. */
export function unionRows(base: readonly OverlayRow[], overlays: readonly (readonly OverlayRow[])[]): OverlayRow[] {
  const out = [...base];
  const at = new Map<unknown, number>();
  out.forEach((r, i) => {
    const id = idOf(r);
    if (id !== undefined && id !== null) at.set(id, i);
  });
  for (const rows of overlays) {
    for (const r of rows) {
      const id = idOf(r);
      const i = id === undefined || id === null ? undefined : at.get(id);
      if (i !== undefined) out[i] = r;
      else {
        if (id !== undefined && id !== null) at.set(id, out.length);
        out.push(r);
      }
    }
  }
  return out;
}

/** UPDATE-seed constants applied to freshly loaded quest rows (mutates and returns them). */
export function applyQuestOverrides(rows: OverlayRow[]): OverlayRow[] {
  for (const r of rows) {
    const o = QUEST_REWARD_OVERRIDES[Number(r.id)];
    if (!o) continue;
    r.award_exp_re = o.exp;
    r.money_num = o.money;
    r.money_type = o.moneyType;
  }
  return rows;
}

/** UPDATE-seed constants applied to freshly loaded NPC rows (mutates and returns them). */
export function applyNpcOverrides(rows: OverlayRow[]): OverlayRow[] {
  for (const r of rows) {
    const id = Number(r.id);
    if (id in NPC_AT_OVERRIDES) r.at = NPC_AT_OVERRIDES[id];
  }
  return rows;
}
