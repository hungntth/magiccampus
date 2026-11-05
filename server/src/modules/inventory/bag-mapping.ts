// Maps a CharacterItem document + its template row to the BagItem wire shape.

import {
  EQUIP_INSTANCE_TYPE, ITEM_INSTANCE_TYPE, ItemKind, MAX_HOLES, sidOf, type BagItem, type EquipInstanceView, type EquipLines,
} from '@mc/shared';
import { parseSublimeState } from '../forge/sublime-rules';
import type { Row } from '../gamedata/gamedata.service';
import { sellUnit } from './bag-rules';
import type { CharacterItem } from './character-item.schema';

/** Template table type: 19 equipment, 29 item. */
export const templateTable = (itemType: number): number => (itemType === ItemKind.EQUIP ? 19 : 29);

const LINE_KEYS = [
  'mainProp1', 'mainPropNum1', 'mainProp2', 'mainPropNum2', 'prop1', 'propNum1', 'prop2', 'propNum2',
  'bindMainPropNum1', 'bindMainPropNum2',
] as const;

/** Wire view of an equipment instance's rolls (crafted quality, maker, holes, gems, star); empty for plain pieces. */
export function instanceView(doc: Pick<CharacterItem, 'itemType' | 'properties' | 'star'>): EquipInstanceView {
  if (doc.itemType !== ItemKind.EQUIP) return {};
  const p = doc.properties ?? {};
  const out: EquipInstanceView = {};
  if (doc.star > 0) out.star = doc.star;
  if (p.quality !== undefined) out.quality = p.quality;
  if (p.prefix !== undefined) out.prefix = p.prefix;
  if (p.element) out.element = p.element;
  if (p.makerName) out.makerName = p.makerName;
  if (p.activeProp) {
    out.activeProp = p.activeProp;
    out.activePropNum = p.activePropNum ?? 0;
  }
  const holes = Math.min(MAX_HOLES, Math.max(0, p.holeNum ?? 0));
  if (holes > 0) {
    out.holeNum = holes;
    out.gems = Array.from({ length: holes }, (_, i) => Number(p[`t${i + 1}`] ?? 0));
  }
  const lines: EquipLines = {};
  for (const k of LINE_KEYS) if (p[k] !== undefined) lines[k] = p[k];
  if (Object.keys(lines).length > 0) out.lines = lines;
  if (p.flag3) out.flag3 = p.flag3;
  if (p.flag) {
    const { state } = parseSublimeState(p.flag);
    if (state.id > 0 || state.add > 0 || state.element > 0) out.sublime = { id: state.id, add: state.add, element: state.element };
  }
  return out;
}

export function toBagItem(doc: CharacterItem, tpl: Row | undefined): BagItem {
  return {
    id: doc._id,
    // equipped items: sid = template position = slotIndex + 1 (1..22); bank / pages per the shared sid map
    sid: sidOf(doc.slotType, doc.slotIndex),
    slotType: doc.slotType,
    slotIndex: doc.slotIndex,
    tid: doc.templateId,
    type: doc.itemType === ItemKind.EQUIP ? EQUIP_INSTANCE_TYPE : ITEM_INSTANCE_TYPE,
    itemType: doc.itemType,
    stackNum: doc.stackCount,
    binded: doc.isBound,
    color: doc.colorCode,
    durability: doc.durability,
    maxDurability: doc.maxDurability,
    position: doc.itemType === ItemKind.EQUIP ? Number(tpl?.position ?? 0) || 0 : 0,
    tplType: doc.itemType === ItemKind.EQUIP ? 0 : Number(tpl?.type ?? 0) || 0,
    reqLevel: Number(tpl?.req_level ?? 0) || 0,
    name: tpl?.name ? String(tpl.name) : `#${doc.templateId}`,
    iconCode: tpl?.icon_code ? String(tpl.icon_code) : '0',
    info: String(tpl?.info || tpl?.description || ''),
    sellPrice: sellUnit(tpl),
    ...(doc.itemType === ItemKind.EQUIP ? {} : { tplKind: Number(tpl?.kind ?? 0) || 0 }),
    ...(doc.itemType !== ItemKind.EQUIP && Number(tpl?.type) === 507
      ? { tplPropType: Number(tpl?.prop_type ?? 0) || 0, tplPropNum: Number(tpl?.propl_num ?? 0) || 0 }
      : {}),
    ...instanceView(doc),
  };
}
