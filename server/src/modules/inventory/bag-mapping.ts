// Maps a CharacterItem document + its template row to the BagItem wire shape.

import { EQUIP_INSTANCE_TYPE, ITEM_INSTANCE_TYPE, ItemKind, SlotType, type BagItem } from '@mc/shared';
import type { Row } from '../gamedata/gamedata.service';
import { sellUnit, sidOf } from './bag-rules';
import type { CharacterItem } from './character-item.schema';

/** Template table type: 19 equipment, 29 item. */
export const templateTable = (itemType: number): number => (itemType === ItemKind.EQUIP ? 19 : 29);

export function toBagItem(doc: CharacterItem, tpl: Row | undefined): BagItem {
  return {
    id: doc._id,
    // equipped items: sid = template position = slotIndex + 1 (1..22)
    sid: doc.slotType === SlotType.EQUIP ? doc.slotIndex + 1 : sidOf(doc.slotIndex),
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
    reqLevel: Number(tpl?.req_level ?? 0) || 0,
    name: tpl?.name ? String(tpl.name) : `#${doc.templateId}`,
    iconCode: tpl?.icon_code ? String(tpl.icon_code) : '0',
    info: String(tpl?.info || tpl?.description || ''),
    sellPrice: sellUnit(tpl),
  };
}
