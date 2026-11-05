// Pure pet-stone rules: the sparse stone bag (add / take / capacity / wire), silver kind order, absorb plan, skill draw,
// refusal texts. No Mongo and no Nest here so the rules are unit-testable.

import { PET_STONE_BAG_SLOTS, petStoneAbsorbValid, type PetStoneBag, type PetStoneTemplate } from '@mc/shared';

/** A player-visible refusal (Go petstone.PlayerMessage text): the RPC layer shows it as a note and replies the unchanged state. */
export class PetStoneRefusal extends Error {}

export const STONE_TEXT = {
  badSlot: 'Ô túi không hợp lệ',
  noStone: 'Không tìm thấy thú thạch trong túi',
  badQty: 'Số lượng không hợp lệ',
  notEnough: 'Không đủ thú thạch',
  noNextTier: 'Thú thạch cấp 5 hoặc Tụ Linh Thạch không thể dung hợp',
  noSilver: 'Không đủ ngân phiếu hoặc bạc',
  bagFull: 'Túi thú thạch đã đầy',
  badHole: 'Lỗ khảm không hợp lệ',
  holeTaken: 'Lỗ này đã có bảo thạch, phải gỡ mới có thể khảm vào',
  holeEmpty: 'Lỗ khảm này đang trống',
  notEnergySlot: 'Lỗ này chỉ có thể đặt Tụ Linh Thạch',
  energyOnlyFirst: 'Tụ Linh Thạch chỉ khảm được vào lỗ đầu tiên',
  sameProp: 'Trang bị này đã khảm thú thạch cùng thuộc tính',
  notPetGear: 'Chỉ khảm được vào trang bị pet',
  noEnergy: 'Không đủ Tụ Linh Thạch',
  noEnergyTarget: 'Thú thạch này không thể Tụ Linh',
  needFive: 'Cần 5 thú thạch cấp 5',
  needLevel5: 'Thú thạch cấp 5 mới có thể Tụ Linh',
  notEnergyStone: 'Chỉ được đặt Tụ Linh Thạch',
  badSkillType: 'Loại kỹ năng không hợp lệ',
  noSkillPool: 'Không có kỹ năng để luyện',
  failed: 'Thao tác thất bại, vui lòng thử lại',
} as const;

export const refuse = (text: string): PetStoneRefusal => new PetStoneRefusal(text);

export interface StoneSlot {
  g: number; // stone template id
  n: number; // stack count
  s: number; // refined (Tu Linh) skill id, 0 = none
}
export type StoneBag = Record<string, StoneSlot>;

export const cloneBag = (bag: Readonly<Record<string, StoneSlot>>): StoneBag =>
  Object.fromEntries(Object.entries(bag).map(([k, v]) => [k, { ...v }]));

const live = (e: StoneSlot | undefined): e is StoneSlot => !!e && e.g > 0 && e.n > 0;

/** Slot entry at a client sid, undefined for an empty / invalid slot. */
export function slotAt(bag: Readonly<StoneBag>, sid: number): StoneSlot | undefined {
  if (!Number.isInteger(sid) || sid < 0 || sid >= PET_STONE_BAG_SLOTS) return undefined;
  const e = bag[String(sid)];
  return live(e) ? e : undefined;
}

function freeSlot(bag: Readonly<StoneBag>, cap: number): number {
  for (let i = 0; i < cap; i++) if (!live(bag[String(i)])) return i;
  return -1;
}

/** Existing stack an addition merges into: only unrefined stacks of the same stone (Go addStone). */
function mergeSlot(bag: Readonly<StoneBag>, tid: number, skillId: number): string | undefined {
  if (skillId !== 0) return undefined;
  return Object.entries(bag).find(([, e]) => live(e) && e.g === tid && e.s === 0)?.[0];
}

/** Dry run of bagAdd: true when `tid` can be added (a mergeable stack or a free slot exists). */
export function bagCanAdd(bag: Readonly<StoneBag>, tid: number, skillId = 0, cap = PET_STONE_BAG_SLOTS): boolean {
  return mergeSlot(bag, tid, skillId) !== undefined || freeSlot(bag, cap) >= 0;
}

/** Adds `count` stones (mutates); returns the slot, or -1 when the bag has neither a stack to merge into nor a free slot. */
export function bagAdd(bag: StoneBag, tid: number, count: number, skillId = 0, cap = PET_STONE_BAG_SLOTS): number {
  const merge = mergeSlot(bag, tid, skillId);
  if (merge !== undefined) {
    bag[merge].n += count;
    return Number(merge);
  }
  const slot = freeSlot(bag, cap);
  if (slot < 0) return -1;
  bag[String(slot)] = { g: tid, n: count, s: skillId };
  return slot;
}

/** Takes `count` from a slot (mutates); false when the slot holds fewer. An emptied slot is removed. */
export function bagTake(bag: StoneBag, sid: number, count: number): boolean {
  const e = slotAt(bag, sid);
  if (!e || !Number.isInteger(count) || count < 1 || e.n < count) return false;
  e.n -= count;
  if (e.n <= 0) delete bag[String(sid)];
  return true;
}

/** Sparse wire array, index = sid, length = highest live slot + 1. */
export function bagWire(bag: Readonly<StoneBag>): PetStoneBag {
  const out: PetStoneBag = [];
  for (const [k, e] of Object.entries(bag)) if (live(e)) out[Number(k)] = [e.g, e.n, e.s];
  return out;
}

export type SilverKey = 'moneyBind' | 'money';

/** Silver kinds in charge order: the selected kind first (1 moneyBind / 2 money; anything but 2 means bound), then the other. */
export function silverOrder(selectedMoneyType: number | undefined): readonly [SilverKey, SilverKey] {
  return selectedMoneyType === 2 ? ['money', 'moneyBind'] : ['moneyBind', 'money'];
}

/** The kind that pays `cost` in full (never split), null when neither covers it. */
export function pickSilver(order: readonly SilverKey[], wallet: Readonly<Record<SilverKey, number>>, cost: number): SilverKey | null {
  if (cost <= 0) return order[0];
  return order.find((k) => wallet[k] >= cost) ?? null;
}

export interface AbsorbPlan {
  take: Map<number, number>; // sid -> stones taken
  outTid: number; // the main stone's family energy stone
}

/** Validates the five absorb selections against the bag (Go Absorb); throws a PetStoneRefusal. */
export function planAbsorb(
  bag: Readonly<StoneBag>, sids: readonly number[], templateOf: (id: number) => PetStoneTemplate | undefined,
): AbsorbPlan {
  if (sids.length !== 5) throw refuse(STONE_TEXT.needFive);
  const take = new Map<number, number>();
  for (const sid of sids) take.set(sid, (take.get(sid) ?? 0) + 1);
  for (const [sid, count] of take) {
    const e = slotAt(bag, sid);
    if (!e) throw refuse(STONE_TEXT.noStone);
    if (e.n < count) throw refuse(STONE_TEXT.notEnough);
    const t = templateOf(e.g);
    if (!t || t.level !== 5 || t.energyFlag) throw refuse(STONE_TEXT.needLevel5);
  }
  const tpls = sids.map((s) => templateOf(slotAt(bag, s)!.g)!);
  const outTid = petStoneAbsorbValid(tpls);
  const target = outTid ? templateOf(outTid) : undefined;
  if (!outTid || !target || !target.energyFlag) throw refuse(STONE_TEXT.noEnergyTarget);
  return { take, outTid };
}

/** Uniform draw from a skill pool; 0 when the pool is empty. */
export function drawSkill(pool: readonly number[], rng: () => number): number {
  return pool.length === 0 ? 0 : pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
