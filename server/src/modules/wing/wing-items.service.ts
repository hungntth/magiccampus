// Shared plumbing of the wing flows (M13 phase C): loading an owned wing with its parsed state, loading item stacks, charging silver, writing
// the wing row (always under the character lock of the caller) and the after-effects of a change: slot + stat pushes (ForgeItemsService), the
// look push of a worn wing (AppearanceService) and the pet refresh of the even-hole feathers (WingPetService).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, WING_KIND, WING_TEXT, parseWing, wingColourOf, type WingData } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { AppearanceService } from '../appearance/appearance.service';
import { ForgeItemsService } from '../forge/forge-items.service';
import { ForgeMoneyService, type Charge } from '../forge/forge-money.service';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import type { Push } from '../inventory/pushes';
import { WingPetService } from './wing-pets.service';

export interface WingRow {
  row: CharacterItem;
  tpl: Row;
  /** Display colour 0..4. */
  colour: number;
  wing: WingData;
  worn: boolean;
  /** Template res_code (the base of every look). */
  base: number;
}

@Injectable()
export class WingItemsService {
  constructor(
    @InjectModel(CharacterItem.name) readonly items: Model<CharacterItem>,
    readonly gameData: GameDataService,
    readonly forgeItems: ForgeItemsService,
    readonly money: ForgeMoneyService,
    private readonly appearance: AppearanceService,
    private readonly pets: WingPetService,
  ) {}

  /** An owned wing (bag or worn); throws the refusal otherwise. */
  async load(characterId: number, id: number): Promise<WingRow> {
    const row = await this.forgeItems.equipRow(characterId, id, true, false);
    const tpl = row ? await this.gameData.template(19, row.templateId) : undefined;
    if (!row || !tpl || Number(tpl.kind) !== WING_KIND) throw RpcException.forbidden(WING_TEXT.NOT_WING);
    return {
      row, tpl, colour: wingColourOf(row.colorCode), wing: parseWing(row.properties?.wing), worn: row.slotType === SlotType.EQUIP,
      base: Number(tpl.res_code ?? 0) || 0,
    };
  }

  /** The worn wing, null when none. */
  async worn(characterId: number): Promise<WingRow | null> {
    const row = await this.items.findOne({ characterId, slotType: SlotType.EQUIP, slotIndex: 21, itemType: ItemKind.EQUIP }, { _id: 1 }).lean();
    return row ? this.load(characterId, row._id) : null;
  }

  /** A bag item stack (any template) of the character with its item template; null when missing. */
  async stackOf(characterId: number, id: number): Promise<{ row: CharacterItem; tpl: Row } | null> {
    if (!Number.isInteger(id) || id <= 0) return null;
    const row = await this.items.findOne({ _id: id, characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
    const tpl = row ? await this.gameData.template(29, row.templateId) : undefined;
    return row && tpl ? { row, tpl } : null;
  }

  /** A bag stack of template `tid` with at least `need` units, or the refusal. */
  async material(characterId: number, id: number, tid: number, need: number): Promise<CharacterItem> {
    const row = await this.forgeItems.stack(characterId, id, tid, need);
    if (!row) throw RpcException.forbidden(WING_TEXT.NO_MATERIAL);
    return row;
  }

  /** Charges silver by the selected money type; refused when short. */
  async charge(characterId: number, amount: number): Promise<Charge> {
    const c = await this.money.spend(characterId, amount, 'selected');
    if (!c) throw RpcException.forbidden(WING_TEXT.NO_SILVER);
    return c;
  }

  /** Writes fields of the wing row; throws when the row vanished. */
  async write(characterId: number, id: number, set: Record<string, unknown>): Promise<void> {
    const r = await this.items.updateOne({ _id: id, characterId }, { $set: set });
    if (r.matchedCount !== 1) throw RpcException.forbidden(WING_TEXT.NOT_WING);
  }

  /** Slot push of the wing (+ the stat refresh when worn). */
  slotPushes(characterId: number, id: number): Promise<Push[]> {
    return this.forgeItems.slotPushes(characterId, id, true);
  }

  /** After a committed change of a wing: look push (when the art may have changed) and the pet refresh (even-hole feathers). */
  async after(characterId: number, worn: boolean, opts: { look?: boolean; pets?: boolean } = {}): Promise<void> {
    if (!worn) return;
    if (opts.look) await this.appearance.pushWing(characterId);
    if (opts.pets) await this.pets.refresh(characterId);
  }
}
