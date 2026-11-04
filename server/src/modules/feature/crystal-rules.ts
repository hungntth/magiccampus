// Magic crystal (Pháp Tinh) pool rules, pure. A mutation returns the new pool plus the currency changes the service applies
// (dust = magiccystalrec, permanent = magiccystalpre, temporary / limit = magiccystallimit), or a refusal. Catalog numbers: shared.

import {
  crystalActivateCost, crystalCurrentValue, crystalLevelUpCost, crystalMaxAt, crystalStatType, MAGIC_CRYSTAL,
  type CrystalSlot, type CurrencyKey, type MagicCrystalData,
} from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';

export interface CrystalChange {
  slot: CrystalSlot;
  /** Currency spent / refunded by this action (positive = spend, negative = refund). */
  spend: Partial<Record<CurrencyKey, number>>;
}

export type CrystalOutcome = { ok: true; change: CrystalChange } | { ok: false; note: string };

const fail = (note: string): CrystalOutcome => ({ ok: false, note });

export function activate(slot: number, c: CrystalSlot): CrystalOutcome {
  const cost = crystalActivateCost(slot);
  if (cost === null) return fail('Vị trí không hợp lệ');
  if (c.a === 1) return fail('Hồ năng lượng này đã kích hoạt');
  return { ok: true, change: { slot: { a: 1, lv: 0, max: crystalMaxAt(0), l: 0, s: 0 }, spend: { magiccystalrec: cost } } };
}

export function levelUp(slot: number, c: CrystalSlot): CrystalOutcome {
  if (crystalActivateCost(slot) === null) return fail('Vị trí không hợp lệ');
  if (c.a !== 1) return fail('Hồ năng lượng chưa kích hoạt');
  if (c.lv >= MAGIC_CRYSTAL.MAX_LEVEL) return fail('Đã đạt cấp tối đa');
  const cost = crystalLevelUpCost(slot, c.lv) ?? 0;
  if (cost <= 0) return fail('Đã đạt cấp tối đa');
  return { ok: true, change: { slot: { ...c, lv: c.lv + 1, max: crystalMaxAt(c.lv + 1) }, spend: { magiccystalrec: cost } } };
}

/** pointType "1" = permanent (l, magiccystalpre), "2" = limit (s, magiccystallimit). */
export function addPower(slot: number, c: CrystalSlot, amount: number, pointType: string): CrystalOutcome {
  if (crystalActivateCost(slot) === null) return fail('Vị trí không hợp lệ');
  if (!Number.isInteger(amount) || amount < 1 || amount > MAGIC_CRYSTAL.MAX_ADD) return fail('Số lượng không hợp lệ');
  if (pointType !== '1' && pointType !== '2') return fail('Loại pha lê không hợp lệ');
  if (c.a !== 1) return fail('Hồ năng lượng chưa kích hoạt');
  const max = c.max > 0 ? c.max : crystalMaxAt(c.lv);
  if (c.l + c.s + amount > max) return fail('Hồ năng lượng đã đầy');
  return pointType === '1'
    ? { ok: true, change: { slot: { ...c, max, l: c.l + amount }, spend: { magiccystalpre: amount } } }
    : { ok: true, change: { slot: { ...c, max, s: c.s + amount }, spend: { magiccystallimit: amount } } };
}

/** Refunds l / s to their currencies (negative spend) for RECOVER_COST dust. */
export function recover(slot: number, c: CrystalSlot): CrystalOutcome {
  if (crystalActivateCost(slot) === null) return fail('Vị trí không hợp lệ');
  if (c.a !== 1) return fail('Hồ năng lượng chưa kích hoạt');
  if (c.l + c.s <= 0) return fail('Hồ năng lượng đang trống');
  return {
    ok: true,
    change: {
      slot: { ...c, l: 0, s: 0 },
      spend: { magiccystalrec: MAGIC_CRYSTAL.RECOVER_COST, magiccystalpre: -c.l, magiccystallimit: -c.s },
    },
  };
}

/** Stat bonuses of every active pool: V * min(l + s, max) / max on the slot's prop (types 32 / 58 have no H5 key and are ignored). */
export function crystalBonuses(data: MagicCrystalData): Bonuses {
  const b = emptyBonuses();
  for (let i = 0; i < MAGIC_CRYSTAL.SLOTS; i++) {
    const c = data[String(i)];
    if (c) addProp(b, BUFF_PROP, crystalStatType(i), crystalCurrentValue(i, c), false);
  }
  return b;
}
