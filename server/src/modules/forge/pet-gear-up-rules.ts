// Pure helpers of the pet gear upgrades: the stat lines written onto the instance after a tier / colour change (the item tooltip
// reads them), the durability of a new tier, and the refusal / note texts shared by the RPC layer. No Nest / Mongo here.

import { petEquipColor, scalePetGearValue, type EquipLines } from '@mc/shared';

type Tpl = Record<string, unknown>;

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export const PET_EQU_TEXT = {
  invalid: 'Trang bị không thể thao tác',
  noShard: 'Không đủ nguyên liệu',
  noMoney: 'Không đủ bạc',
  noGold: 'Không đủ vàng',
  colorFail: 'Đổi màu thất bại',
  notBound: 'Chỉ có trang bị pet khóa mới thao tác được',
  badMaterial: 'Vui lòng đặt chính xác trang bị và nguyên liệu!',
  needColor: 'Chỉ có trang bị pet màu tím hoặc màu cam mới có thể tái thiết lập thuộc tính',
  noDust: 'Không đủ Bụi Vô Hạn',
  noRestrainDust: 'Không đủ Bụi Ma Pháp',
  busy: 'Túi đồ vừa thay đổi, hãy thử lại',
} as const;

const COLOR_NAMES = ['Trắng', 'Xanh lá', 'Lam', 'Tím', 'Cam'] as const;
const COLOR_HEX = ['#FFFFFF', '#00FF00', '#0066FF', '#FF33FF', '#FA5B05'] as const;

/** The mid-screen note of a recolour (Go petEquModColorNote). */
export function petEquColorNote(success: boolean, color: number): string {
  if (!success) return PET_EQU_TEXT.colorFail;
  const c = petEquipColor(color);
  return `Đổi màu thành công! Trang bị pet đã lên màu <font color='${COLOR_HEX[c]}'>${COLOR_NAMES[c]}</font>`;
}

/** Template lines scaled by the display colour: what Go writes into the instance on tier-up / recolour (syncPetGearProps). */
export function petGearLines(tpl: Tpl, color: number): EquipLines {
  const c = petEquipColor(color);
  return {
    mainProp1: int(tpl.main_prop1), mainPropNum1: scalePetGearValue(int(tpl.main_prop_num1), c),
    mainProp2: int(tpl.main_prop2), mainPropNum2: scalePetGearValue(int(tpl.main_prop_num2), c),
    prop1: int(tpl.prop1), propNum1: scalePetGearValue(int(tpl.prop_num1), c),
    prop2: int(tpl.prop2), propNum2: scalePetGearValue(int(tpl.prop_num2), c),
  };
}

/** `$set` of the instance properties for the lines + the Go-semantics marker (dotted keys keep the other properties). */
export function petGearLineSet(tpl: Tpl, color: number): Record<string, number> {
  const out: Record<string, number> = { 'properties.petGear': 1 };
  for (const [k, v] of Object.entries(petGearLines(tpl, color))) out[`properties.${k}`] = v;
  return out;
}

/** Current bind percentages shown by the preview: the instance values, else the template bind_prop_num; 0 for an empty main line. */
export function petEquCurrentBind(
  tpl: Tpl, props: { bindMainPropNum1?: number; bindMainPropNum2?: number },
): [number, number] {
  const pick = (v: number | undefined, mainProp: number): number => (mainProp > 0 ? int(v ?? tpl.bind_prop_num) : 0);
  return [pick(props.bindMainPropNum1, int(tpl.main_prop1)), pick(props.bindMainPropNum2, int(tpl.main_prop2))];
}
