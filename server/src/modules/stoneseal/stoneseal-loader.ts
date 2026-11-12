// Loads what the stone seal view / stats need for one character: the worn pieces of position 1..12 (equip rows, gems read from properties t1..t10, never
// on a magic weapon whose t1..t10 are skill ids) and the item facts of every gem and stone involved. Models + game data only (usable from StatsModule).

import { MAX_HOLES, MW, SlotType, type StoneSealItemInfo } from '@mc/shared';
import type { Model } from 'mongoose';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import type { CharacterItem } from '../inventory/character-item.schema';
import { gemTemplateIds } from '../inventory/equip-stats';
import type { ItemInfoOf, WornPiece } from './stoneseal-stats';
import type { StoneSealState } from './stoneseal-state';

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

export const infoOf = (tid: number, row: Row | undefined): StoneSealItemInfo | undefined => (row
  ? { tid, name: String(row.name ?? ''), icon: String(row.icon_code ?? 0), prop: int(row.prop_type), num: int(row.propl_num), color: int(row.color) }
  : undefined);

export interface SealContext {
  worn: Map<number, WornPiece>;
  itemOf: ItemInfoOf;
}

/** `extra` = more item template ids the caller wants resolved (the stone being set, ...). */
export async function loadSealContext(
  items: Model<CharacterItem>, gameData: GameDataService, characterId: number, state: StoneSealState, extra: readonly number[] = [],
): Promise<SealContext> {
  const rows = await items.find({ characterId, slotType: SlotType.EQUIP, slotIndex: { $gte: 0, $lte: 11 } }).lean();
  const tpls = await gameData.templatesByIds(19, [...new Set(rows.map((r) => r.templateId))]);
  const worn = new Map<number, WornPiece>();
  const gemIds = new Set<number>();
  for (const r of rows) {
    const tpl = tpls.get(r.templateId);
    if (!tpl) continue;
    const isMw = Number(tpl.kind) === MW.KIND;
    const gems = isMw ? [] : Array.from({ length: MAX_HOLES }, (_, i) => int((r.properties as Record<string, unknown> | undefined)?.[`t${i + 1}`]));
    if (!isMw) for (const g of gemTemplateIds(r.properties)) gemIds.add(g);
    worn.set(r.slotIndex + 1, { sid: r.slotIndex + 1, tid: r.templateId, name: String(tpl.name ?? ''), icon: String(tpl.icon_code ?? 0), gems });
  }
  for (const slot of Object.values(state)) for (const v of Object.values(slot.holes)) if (v > 0) gemIds.add(v);
  for (const e of extra) if (e > 0) gemIds.add(e);
  const itemTpls = await gameData.templatesByIds(29, [...gemIds]);
  return { worn, itemOf: (tid) => infoOf(tid, itemTpls.get(tid)) };
}
