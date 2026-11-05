// Pet stat bonus registry (M12 3.1 / 5.3): feature modules register a PetStatProvider (talent now; guard, soul, handbook,
// contract, carve later) on PetStatRegistry at startup, so PetModule never imports them. Gear and passive skills stay
// computed in pet-bonus.ts. The merged provider bonuses fill the `feature` bucket of PetBonuses (flats, then percents).

import { emptyBonuses, mergeBonuses, type Bonuses } from '../character/character-stats';
import type { Pet } from './pet.schema';

/** Where a pet sheet is evaluated: the panel, a normal battle, the arena or the PPVE tower. */
export type PetStatContext = 'panel' | 'battle' | 'arena' | 'ppve';
export const PET_STAT_CONTEXTS: readonly PetStatContext[] = ['panel', 'battle', 'arena', 'ppve'];

export interface PetStatProvider {
  /** Stable name: used for de-duplicated registration, logs and tests. */
  readonly key: string;
  /** Contexts this source applies to. */
  readonly contexts: readonly PetStatContext[];
  /** Bonuses per pet id; pets the provider does not touch are simply absent. Read models / game data only. */
  bonuses(ownerId: number, pets: readonly Pet[], ctx: PetStatContext): Promise<Map<number, Bonuses>>;
}

/** Nest token of the (mutable) provider list owned by PetModule; feature modules call PetStatRegistry.register(). */
export const PET_STAT_BONUS_PROVIDERS = Symbol('PET_STAT_BONUS_PROVIDERS');

/** Sums the bonuses of every provider active in `ctx`, per pet. Pets nobody contributes to are absent (no feature bucket). */
export async function collectPetBonuses(
  providers: readonly PetStatProvider[], ownerId: number, pets: readonly Pet[], ctx: PetStatContext,
): Promise<Map<number, Bonuses>> {
  const active = providers.filter((p) => p.contexts.includes(ctx));
  const parts = await Promise.all(active.map((p) => p.bonuses(ownerId, pets, ctx)));
  const out = new Map<number, Bonuses>();
  for (const pet of pets) {
    let merged: Bonuses | undefined;
    for (const part of parts) {
      const b = part.get(pet._id);
      if (b) merged = merged ? mergeBonuses(merged, b) : mergeBonuses(emptyBonuses(), b);
    }
    if (merged) out.set(pet._id, merged);
  }
  return out;
}
