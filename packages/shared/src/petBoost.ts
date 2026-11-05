// M12 pet guard and talent wire contracts. State is character-wide and reused by login / panels.

export interface PetGuardData extends Record<string, unknown> {
  lvData: Record<string, number>;
  petData: Record<string, number>;
}

export interface TalentBagEntry { t: number; n: number; }
export interface PetTalentData extends Record<string, unknown> {
  tal: Record<string, number>;
  inTal: Record<string, number>;
  b: Record<string, TalentBagEntry>;
}

/** Character-login fields owned by M12 guard and talent systems. */
export interface PetBoostLoginInfo {
  petGuardData: PetGuardData;
  petTalentInfo: PetTalentData;
}

/** Flash bag delta (PetTalentFuncPanel._updateTalentData): `a[slot] = {tid, ln}` added / updated, `d[slot] = {ln}` the stack left (0 = gone). */
export interface TalentBagDelta {
  a: Record<string, { tid: number; ln: number }>;
  d: Record<string, { ln: number }>;
}

/** `onFillOrTakeOffTalentStone`: the bag delta plus the socket change (`pan.a[sid] = {tid}`, `pan.d[sid] = 1`; PetTalentPanel._updateTalentDataInTal). */
export interface TalentStonePush {
  bag: TalentBagDelta;
  pan: { a: Record<string, { tid: number }>; d: Record<string, 1> };
}

/** `upTalentSlotLv` reply: the slot sid and its new talent record id. */
export type TalentSlotDelta = Record<string, number>;

/** Direction talisman (Dinh Huong Phu) of the stone fusion and its quantity by source stone level (PetTalentFuncPanel TAL_UP_PLAN_ITEM[_NUM]). */
export const TALENT_DIRECTION_ITEM = 4181;
export const TALENT_DIRECTION_QTY: Readonly<Record<number, number>> = { 1: 1, 2: 3, 3: 15, 4: 50 };
/** Gold per Anh Linh point of a talent slot upgrade (PetTalentPanel._goldPoint; the client shows ceil(upExp * rate)). */
export const TALENT_GOLD_RATE = 0.0666666666666667;
export const TALENT_MAX_SLOT_LEVEL = 5;
export const TALENT_BAG_SLOTS = 320;

// --- Chien Thu Ho Ve constants (Go pet_guard*.go, Flash PetGuardPanel); the server rules and the client window share them ---

export const GUARD_CENTRE_SID = 0;
export const GUARD_CENTRE_MAX_LEVEL = 5;
export const GUARD_MAX_LEVEL = 30;
/** A pet must be a divine beast (class 10) of use level >= 50 to sit in any slot (PANEL_PETGUARD[10]). */
export const GUARD_MIN_PET_LEVEL = 50;
/** Centre level -> % applied to every guard row (Flash PET_GUARD_ADD[lv].per). */
export const GUARD_CENTRE_PER: Readonly<Record<number, number>> = { 1: 0, 2: 3, 3: 8, 4: 15, 5: 25 };
/** Sub-pet colour (0 white .. 4 orange) -> % (Flash PET_GUARD_INDEX_SID per[color + 1]). */
export const GUARD_INNER_PER: readonly number[] = [0.0016, 0.08, 0.4, 2, 10];
/** Centre upgrade cost by current level (Flash PET_GUARD_ADD: tokens / gold). */
export const GUARD_CENTRE_COSTS: Readonly<Record<number, { num: number; gold: number }>> = {
  1: { num: 75, gold: 7500 }, 2: { num: 150, gold: 15000 }, 3: { num: 250, gold: 25000 }, 4: { num: 380, gold: 38000 },
};
export const GUARD_SLOT_NAMES: Readonly<Record<number, string>> = {
  0: 'Thánh Anh Thú', 1: 'Chiến Thú-Xích Đảm', 2: 'Chiến Thú-Trung Thành', 3: 'Chiến Thú-Anh Dũng', 4: 'Chiến Thú-Vô Úy',
};
/** Token currency per slot: Thu Phu Chien Thu (petguardout) pays the centre, Lenh Bai Trung Thanh (petguardin) the four guards. */
export const guardTokenKey = (sid: number): 'petguardout' | 'petguardin' => (sid === GUARD_CENTRE_SID ? 'petguardout' : 'petguardin');
export const guardTokenName = (sid: number): string => (sid === GUARD_CENTRE_SID ? 'Thủ Phù Chiến Thú' : 'Lệnh Bài Trung Thành');
export const guardMaxLevel = (sid: number): number => (sid === GUARD_CENTRE_SID ? GUARD_CENTRE_MAX_LEVEL : GUARD_MAX_LEVEL);

/** Total inlaid stone power -> % added to every summed talent stat (Flash TALENT_PANEL_U[13]). */
export function talentPowerRate(power: number): number {
  for (const [need, rate] of [[850, 10], [700, 8], [400, 6], [200, 4], [100, 2]] as const) if (power >= need) return rate;
  return 0;
}
