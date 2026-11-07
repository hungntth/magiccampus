// Attribute point reset (Go domain/character/attr_reset.go ResetAttributePoints, Quy Nguyen Chau 995 / Quy Nguyen Don 1475): every
// distributed point returns to the free pool. Pure helpers; CharacterStatsService.resetAllocated runs the atomic update.

import { distributedOf, type AttrDoc } from '../character/character-profile';

/** Points the character has distributed (the refund of a reset). */
export function refundOf(doc: AttrDoc): number {
  const d = distributedOf(doc);
  return d.str + d.agi + d.sta + d.int + d.eng;
}

/** Aggregation-pipeline update: zero the five apt* columns and add their sum to attrPoints (atomic, no read-modify-write race). */
export const RESET_PIPELINE = [{
  $set: {
    attrPoints: { $add: ['$attrPoints', '$aptStrength', '$aptAgility', '$aptStamina', '$aptIntelligence', '$aptEnergy'] },
    aptStrength: 0, aptAgility: 0, aptStamina: 0, aptIntelligence: 0, aptEnergy: 0,
  },
}];
