// Pet catch and pet-turn-in rules shared by server and client (legacy catch.go / quality.go, Flash BattleCreatureView
// checkCatchValid and QuestPanel.checkPet): the catch success rate, the Flash client gates ("Pet đã đầy!" / "Pet cao hơn
// bạn 5 cấp"), and which pets satisfy a quest_require kind 3 (pet) objective. Pure.

import { petGrowColor } from './pet.js';

/** Strings from Language.BATTLECREATUREVIEW_S[0] / [1]. */
export const CATCH_PET_FULL = 'Pet đã đầy!';
export const CATCH_TOO_HIGH = 'Pet cao hơn bạn 5 cấp, không thể bắt!';
/** Creatures up to this many levels above the owner can still be caught (Go catch.go, Flash checkCatchValid). */
export const CATCH_LEVEL_MARGIN = 5;

/**
 * Easy catches (Go combat catch_luctien.go, M10 Lục Tiên): creature id -> minimum rate in percent. Such a creature skips the
 * 5-level gate (Phù Thủy Hắc Ám 625 meets lv 83-86 encounters), the rate is raised to at least the value; the free pet slot
 * and catchable gates still apply.
 */
export const EASY_CATCH_MIN_RATE: Readonly<Record<number, number>> = { 625: 60 };

/** Client pre-check before sending -70: the pet bag is full, or target.level - 5 >= player.level. Null = allowed. */
export function catchClientBlocker(
  petCount: number, petMaxNum: number, targetLevel: number, playerLevel: number, creatureId = 0,
): string | null {
  if (petCount >= petMaxNum) return CATCH_PET_FULL;
  if (targetLevel - CATCH_LEVEL_MARGIN >= playerLevel && !(creatureId in EASY_CATCH_MIN_RATE)) return CATCH_TOO_HIGH;
  return null;
}

export interface CatchInput {
  catchable: number; // creature template column; Go accepts exactly 1
  ownerLevel: number;
  creatureLevel: number;
  hp: number;
  hpMax: number;
  room: number; // free pet slots, counting pets already caught earlier in this battle
  creatureId?: number; // creature template id; listed in EASY_CATCH_MIN_RATE = easy catch
  /** Extra catch points from buffs (Luyen Thu Don 565 = +4): a creature with `catchable` up to 1 + bonusPoints can be caught. */
  bonusPoints?: number;
}

/** Level term of the rate: +min(5, lv - clv) when the owner is at or above the creature, else -2 * min(5, clv - lv). */
export function catchLevelTerm(ownerLevel: number, creatureLevel: number): number {
  return ownerLevel >= creatureLevel ? Math.min(5, ownerLevel - creatureLevel) : -2 * Math.min(5, creatureLevel - ownerLevel);
}

/**
 * Success chance in percent (Go AttemptCatch): 0 when any gate fails (not catchable == 1, creature more than 5 levels above the
 * owner, no free pet slot), else clamp(20 + round((1 - hp / hpMax) * 65) + levelTerm, 5, 95). The roll is `rand(100) < rate`.
 * An easy-catch creature skips the level gate and gets at least its listed rate.
 */
export function catchRate(i: CatchInput): number {
  const easy = i.creatureId !== undefined ? EASY_CATCH_MIN_RATE[i.creatureId] : undefined;
  if (i.catchable < 1 || i.catchable > 1 + Math.max(0, Math.trunc(i.bonusPoints ?? 0)) || i.room <= 0 || i.hpMax <= 0) return 0;
  if (i.creatureLevel > i.ownerLevel + CATCH_LEVEL_MARGIN && easy === undefined) return 0;
  const missing = Math.round((1 - Math.max(0, Math.min(i.hp, i.hpMax)) / i.hpMax) * 65);
  const rate = Math.max(5, Math.min(95, 20 + missing + catchLevelTerm(i.ownerLevel, i.creatureLevel)));
  return easy !== undefined ? Math.max(rate, easy) : rate;
}

/** The facts of one owned pet that decide a pet objective (the client PetView carries all of them). */
export interface PetObjectiveFacts {
  id: number;
  tid: number;
  petName: string;
  growRate: number;
}

/**
 * Whether a pet satisfies a kind-3 objective (Go petQualifiesForQuestSubmit): same creature template, the name unchanged
 * (equal to the template name; an unknown template name skips the check), and growth colour >= colour of q / 10.
 */
export function petMatchesObjective(pet: PetObjectiveFacts, creatureId: number, q: number, templateName: string): boolean {
  if (pet.tid !== creatureId) return false;
  if (templateName !== '' && pet.petName !== templateName) return false;
  return petGrowColor(pet.growRate) >= petGrowColor(q / 10);
}

/** How many of the pets satisfy the objective (the quest tracker and the server sync use the same count). */
export function countMatchingPets(
  pets: readonly PetObjectiveFacts[], creatureId: number, q: number, templateName: string,
): number {
  return pets.filter((p) => petMatchesObjective(p, creatureId, q, templateName)).length;
}

export interface PetObjectiveNeed {
  creatureId: number;
  q: number;
  required: number;
  templateName: string;
}

/**
 * Pet ids a finish deletes to pay every objective (Go consumeSubmitPetObjectives): per objective in order, the matching pets
 * with the LOWEST growRate first (ties: lower id), never reusing a pet. Null when some objective cannot be paid.
 * The battle pet is not exempt (Go has no such rule).
 */
export function petsToConsume(pets: readonly PetObjectiveFacts[], needs: readonly PetObjectiveNeed[]): number[] | null {
  const used = new Set<number>();
  const out: number[] = [];
  for (const n of needs) {
    const candidates = pets
      .filter((p) => !used.has(p.id) && petMatchesObjective(p, n.creatureId, n.q, n.templateName))
      .sort((a, b) => a.growRate - b.growRate || a.id - b.id);
    if (candidates.length < n.required) return null;
    for (const p of candidates.slice(0, n.required)) {
      used.add(p.id);
      out.push(p.id);
    }
  }
  return out;
}

/** Failure text of a catch step (BATTLESTAGE_S[14] with the rate, or [13] with the catcher's level when the rate is 0). */
export function catchFailText(f: { rate: number; selfCatch: number }): string {
  if (f.rate > 0) return `Bạn có ${Math.round(f.rate)}% xác suất bắt được pet này, tiếp tục cố gắng nào.`;
  return `Điểm bắt Pet của bạn là${Math.round(f.selfCatch)}，quá thấp nên không thể bắt Pet.`;
}
