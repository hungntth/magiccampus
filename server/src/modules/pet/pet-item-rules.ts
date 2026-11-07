// Pure rules of the pet-target items (Go effect_pet_grow.go, effect_consumable.go life, effect_pet_aptitude_fruit.go): grow potion exp gain
// under the owner level cap, the lifespan roll / gain and the aptitude fruit pick. No Mongo, no Nest.

import { PET_GROW_ITEM_EXP, PetLimits, petGrowExpRoom, petXsdRange } from '@mc/shared';
import type { AttrKey } from '../character/character-stats';
import { APT_ATTR, APT_KEYS, type AptKey } from './pet-growth-rules';

export interface GrowGain {
  /** Exp added (0 = the pet is at the owner level cap). */
  gain: number;
  /** Units a batch of `count` consumes: ceil(gain / amount). */
  units: number;
}

/** Exp of `count` grow potions `templateId` for a pet with `exp` under the owner level cap (Go petGrowBatchGain). */
export function growGain(templateId: number, petExp: number, ownerLevel: number, count = 1): GrowGain {
  const amount = PET_GROW_ITEM_EXP[templateId] ?? 0;
  if (amount <= 0 || count <= 0) return { gain: 0, units: 0 };
  const gain = Math.min(amount * count, petGrowExpRoom(petExp, ownerLevel));
  return gain > 0 ? { gain, units: Math.ceil(gain / amount) } : { gain: 0, units: 0 };
}

/** Lifespan a Tho Menh Dan gives: uniform in [min, max] (rng in [0, 1)). */
export function rollLife(min: number, max: number, rng: () => number): number {
  return max <= min ? min : min + Math.floor(rng() * (max - min + 1));
}

/** Lifespan after the item, capped at the pet maximum; `gained` is what was really added. */
export function lifeAfter(life: number, amount: number): { life: number; gained: number } {
  const next = Math.min(life + amount, PetLimits.maxLife);
  return { life: next, gained: next - life };
}

export interface AptitudeRaise {
  key: AptKey;
  attr: AttrKey;
  /** Panel (stored) value before the raise. */
  before: number;
  after: number;
}

/**
 * Tinh Hon Chi Thuc: +1 to the lowest of Luc / Xao / Nhan / Tri / Than still below its cap (Go pickPetAptitudeRaise). The cap is the
 * Tay Tuy maximum (round(template * 1.2)); a never-refined aptitude starts from max(template, stored); ties go to the lower index.
 * `stored` / `refined` come from sheetAptitudes (base) and aptRefined; null when every aptitude is at its cap.
 */
export function pickAptitudeRaise(
  template: Readonly<Record<AttrKey, number>>, base: Readonly<Record<AttrKey, number>>, refined: Readonly<Record<string, number | undefined>>,
): AptitudeRaise | null {
  let best: AptitudeRaise | null = null;
  for (const key of APT_KEYS) {
    const attr = APT_ATTR[key];
    const tpl = template[attr];
    if (!(tpl > 0)) continue;
    const limit = petXsdRange(tpl)[1];
    const current = base[attr];
    const start = (refined[key] ?? 0) > 0 ? current : Math.max(current, Math.round(tpl));
    if (start >= limit) continue;
    if (best === null || start + 1 < best.after) best = { key, attr, before: current, after: start + 1 };
  }
  return best;
}

/** Display names of the five aptitudes (Go petAptitudeNames). */
export const APT_LABEL: Readonly<Record<AptKey, string>> = {
  strength: 'Lực', agility: 'Xảo', stamina: 'Nhẫn', intelligence: 'Trí', energy: 'Thần',
};
