// Pure part of the award bag: the picked data_tbl_item_award rows become a plan (grants, pets, titles, exp message). The row ->
// grant conversion is injected (GrantService.fromAwardRow) so this file needs no services. Legacy: effect_award.go grantAward.

import type { Grant } from '../rewards/grant.service';
import type { ItemAwardRow } from '../rewards/item-award';

export const PET_AWARD = 12;
export const TITLE_AWARD = 33;
export const EXP_AWARD = 31;
/** Row types the conversion handles: equipment, item, basic currency, exp, game currency. */
const GRANTABLE_TYPES: ReadonlySet<number> = new Set([19, 29, 30, 31, 35]);

export interface AwardPlan {
  grants: Grant[];
  pets: { templateId: number; count: number; growRate: number }[];
  titles: number[];
  /** Amount of the first exp row (Go: that row decides the note), 0 = none. */
  expMessage: number;
  /** Rows of a type with no H5 grant (32 buff, 34 skill, 36 medal, 37 dress material, unknown). */
  skipped: ItemAwardRow[];
}

export function buildAwardPlan(picked: readonly ItemAwardRow[], toGrants: (row: ItemAwardRow) => Grant[]): AwardPlan {
  const plan: AwardPlan = { grants: [], pets: [], titles: [], expMessage: 0, skipped: [] };
  for (const r of picked) {
    if (r.type === PET_AWARD) {
      plan.pets.push({ templateId: r.awardId, count: r.count, growRate: r.quality > 0 ? r.quality : 0 });
    } else if (r.type === TITLE_AWARD) {
      plan.titles.push(r.awardId);
    } else if (GRANTABLE_TYPES.has(r.type)) {
      if (r.type === EXP_AWARD && plan.expMessage === 0) plan.expMessage = r.count;
      plan.grants.push(...toGrants(r));
    } else {
      plan.skipped.push(r);
    }
  }
  return plan;
}
