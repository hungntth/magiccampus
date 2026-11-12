// Local game-content templates not present in the legacy seed tables. The Ninja Bóng Đêm costume uses a generated H5 sheet.

import type { Row } from './gamedata.service';

/** Developer outfit: equipment kind 11 in the standard costume position (21). */
export const NINJA_SHADOW_EQUIP_ID = 9_000_001;
export const NINJA_SHADOW_RES_CODE = '2060100999999';

const NINJA_SHADOW_TEMPLATE: Row = {
  id: NINJA_SHADOW_EQUIP_ID,
  name: 'Thời Trang Ninja Bóng Đêm',
  info: 'Trang phục ninja mang sức mạnh của bóng đêm.',
  description: 'Trang phục ninja mang sức mạnh của bóng đêm.',
  icon_code: '4030200180384',
  color_code: 6,
  price: 0,
  stack_max: 1,
  single_flag: 1,
  endure_max: 0,
  type: 11,
  kind: 11,
  position: 21,
  req_level: 1,
  req_class: '',
  res_code_male: NINJA_SHADOW_RES_CODE,
  res_code_female: NINJA_SHADOW_RES_CODE,
};

/** H5-authored templates are a narrow fallback, so an imported legacy row always wins if ids ever overlap. */
export function customTemplate(type: number, id: number): Row | undefined {
  if (type === 19 && id === NINJA_SHADOW_EQUIP_ID) return NINJA_SHADOW_TEMPLATE;
  return undefined;
}
