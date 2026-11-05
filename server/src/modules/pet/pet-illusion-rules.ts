// Pure Ao Hoa rules (Go application/pet/illusion.go): which pets may take part, how a pet maps to the shared rate inputs and the
// rolled illusion value. Randomness is injected (`rng` returns [0, 1)). The luck-stone and rate math is in @mc/shared (petAdvanced).

import { PET_EAT_MIN_COLOR, PET_EAT_ORANGE_COLOR, petGrowColor, type PetEatPet } from '@mc/shared';
import type { PetTemplate } from '../gamedata/pet-data';
import { creatureClassIds } from './pet-owned';
import type { Pet } from './pet.schema';

type Rng = () => number;
type EatPet = Pick<Pet, '_id' | 'growRate' | 'binded' | 'state' | 'following' | 'equ'>;

export const EAT_MSG = {
  default: 'Vui lòng đặt pet và vật phẩm chính xác!',
  color: 'Pet chính và pet phụ đều phải từ màu tím trở lên!',
  notBound: 'Pet chính tiến hành ảo hóa phải là pet đã khóa!',
  aptType: 'Vui lòng chọn tư chất ảo hóa!',
  busy: 'Pet phụ đang xuất chiến, đi theo hoặc cưỡi, hãy cho nghỉ trước khi ảo hóa!',
  equip: 'Phải gỡ trang bị của pet phụ trước khi ảo hóa!',
  luck: 'Đá May Mắn không hợp lệ!',
  luckColor: 'Pet phụ màu cam cần dùng Đá May Mắn Cam!',
  noPending: 'Không có kết quả ảo hóa nào để áp dụng.',
  applied: 'Đã áp dụng tư chất ảo hóa mới.',
} as const;

export const eatSuccessMsg = (rate: number): string => `Ảo hóa thành công! (Tỉ lệ ${rate}%)`;
export const eatFailMsg = (rate: number): string => `Ảo hóa thất bại, pet phụ đã mất. (Tỉ lệ ${rate}%)`;

/** Why the pair cannot be used (Go PetEat check order), null when fine. `guarded` holds ids in a guard slot (busy as well). */
export function eatBlocker(main: EatPet, sub: EatPet, guarded: ReadonlySet<number>): string | null {
  if (!main.binded) return EAT_MSG.notBound;
  if (petGrowColor(main.growRate) < PET_EAT_MIN_COLOR || petGrowColor(sub.growRate) < PET_EAT_MIN_COLOR) return EAT_MSG.color;
  if (sub.state === 1 || sub.following || guarded.has(sub._id)) return EAT_MSG.busy;
  if ((sub.equ ?? []).some((id) => id > 0)) return EAT_MSG.equip;
  return null;
}

/** An orange sub pet only accepts orange luck stones (item colour 4+). */
export const luckColorBlocker = (sub: Pick<Pet, 'growRate'>, luckItemColor: number): string | null =>
  petGrowColor(sub.growRate) >= PET_EAT_ORANGE_COLOR && luckItemColor < PET_EAT_ORANGE_COLOR ? EAT_MSG.luckColor : null;

/** The rate inputs of a pet: Go IsDivineBeast (class_ids 10) and RaceClassID (class_id). */
export const eatPetOf = (pet: Pick<Pet, 'growRate'>, tpl: PetTemplate): PetEatPet =>
  ({ growRate: pet.growRate, divine: creatureClassIds(tpl).includes(10), classId: tpl.classId });

/**
 * Rolled illusion of one aptitude: the sub pet's base aptitude (+ its Vu Hoa aptitude) x 10..15 % (purple sub) or 25..30 %
 * (orange sub), rounded.
 */
export function eatIllusionValue(subBase: number, subGrowRate: number, rng: Rng): number {
  const [low, high] = petGrowColor(subGrowRate) >= PET_EAT_ORANGE_COLOR ? [25, 30] : [10, 15];
  return Math.round((subBase * (low + rng() * (high - low))) / 100);
}
