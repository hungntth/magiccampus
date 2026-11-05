// addAuction / addAuctionMoreByPM saga (seller's withCharLock): validate prices -> gate (trade, level) -> active-listing cap ->
// park the goods in escrow `auction:<id>` (ONE conditional move, row id / equipment rolls preserved) -> charge the listing fee in
// silver (preferred silver first, never refunded) -> insert the listing. Any failed step undoes the earlier ones in reverse
// (fee refund, goods restored). Legacy: Go application/auction/listing.go (List / ListBatch).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AUCTION, AUCTION_TEXT, ItemKind, auctionFee, petAuctionType, petGrowColor, type AuctionRow } from '@mc/shared';
import { Character } from '../character/character.schema';
import { Counter } from '../character/counter.schema';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { templateTable } from '../inventory/bag-mapping';
import { CharacterItem } from '../inventory/character-item.schema';
import { EscrowService, type EscrowedItem } from '../inventory/escrow.service';
import { push, type Push } from '../inventory/pushes';
import { UndoStack } from '../mail/mail-saga';
import { PET_GUARDED_TEXT, type PetTransferTexts } from '../pet/pet-transfer';
import type { Pet } from '../pet/pet.schema';
import { PmStateService } from '../vip/pm-state.service';
import { AuctionGateService } from './auction-gate.service';
import { validatePrices, type ListInput } from './auction-rules';
import { AuctionViewService } from './auction-view.service';
import { AuctionListing } from './auction.schema';

export type ListOutcome = { ok: true; row: AuctionRow; pushes: Push[] } | { ok: false; text: string };
export type BatchOutcome = { ok: true; results: Extract<ListOutcome, { ok: true }>[]; errors: string[] } | { ok: false; text: string };

const PET_TEXTS: PetTransferTexts = { bound: AUCTION_TEXT.PET_BOUND, active: AUCTION_TEXT.PET_ACTIVE, equipped: AUCTION_TEXT.PET_EQUIPPED, guarded: PET_GUARDED_TEXT };
const fail = (text: string): ListOutcome => ({ ok: false, text });

@Injectable()
export class AuctionListingService {
  private readonly logger = new Logger(AuctionListingService.name);

  constructor(
    @InjectModel(AuctionListing.name) private readonly listings: Model<AuctionListing>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly escrow: EscrowService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly gate: AuctionGateService,
    private readonly view: AuctionViewService,
    private readonly pm: PmStateService,
  ) {}

  list(sellerId: number, sellerName: string, input: ListInput): Promise<ListOutcome> {
    return withCharLock(sellerId, () => this.run(sellerId, sellerName, input));
  }

  /** PM >= 3 batch: up to 10 goods, each listed on its own; the first refusal text is reported next to the successes. */
  async listBatch(sellerId: number, sellerName: string, inputs: ListInput[]): Promise<BatchOutcome> {
    if (inputs.length === 0) return { ok: false, text: AUCTION_TEXT.NO_GOODS };
    if (inputs.length > AUCTION.PM_BATCH_MAX) return { ok: false, text: AUCTION_TEXT.BATCH_TOO_LARGE };
    const gated = await this.gate.check(sellerId);
    if (gated) return { ok: false, text: gated };
    if ((await this.pm.levelOf(sellerId)) < AUCTION.PM_BATCH_LEVEL) return { ok: false, text: AUCTION_TEXT.PM_LEVEL };
    const results: Extract<ListOutcome, { ok: true }>[] = [];
    const errors: string[] = [];
    for (const input of inputs) {
      const out = await this.list(sellerId, sellerName, input);
      if (out.ok) results.push(out);
      else errors.push(out.text);
    }
    return { ok: true, results, errors };
  }

  private async nextId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('auctions', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }

  private async run(cid: number, sellerName: string, input: ListInput): Promise<ListOutcome> {
    const prices = validatePrices(input);
    if (!prices.ok) return fail(prices.text);
    if ((input.itemId > 0) === (input.petId > 0)) return fail(AUCTION_TEXT.NO_GOODS);
    const gated = await this.gate.check(cid);
    if (gated) return fail(gated);
    if ((await this.listings.countDocuments({ sellerId: cid, status: 'active' })) >= AUCTION.MAX_ACTIVE) return fail(AUCTION_TEXT.TOO_MANY);

    const id = await this.nextId();
    const ref = `auction:${id}`;
    const undo = new UndoStack();
    const rollback = async (): Promise<void> => {
      await undo.rollback((label, e) => this.logger.error(`auction ${id} undo ${label} failed: ${(e as Error).message}`));
    };
    const goods = input.itemId > 0 ? await this.parkItem(cid, input.itemId, ref, undo) : await this.parkPet(cid, input.petId, ref, undo);
    if ('text' in goods) return fail(goods.text);

    const fee = auctionFee(prices.start, prices.buyout, input.auctionType, input.duration);
    const feeKey = await this.chargeFee(cid, fee);
    if (!feeKey) {
      await rollback();
      return fail(AUCTION_TEXT.NO_FEE);
    }
    undo.push('refund fee', async () => void (await this.characters.addMoney(cid, feeKey, fee)));

    let doc: AuctionListing;
    try {
      doc = (await this.listings.create({
        _id: id, sellerId: cid, sellerName, goodsKind: input.itemId > 0 ? 'item' : 'pet', goodsId: goods.goodsId, ...goods.display,
        auctionType: input.auctionType, startPrice: prices.start, buyoutPrice: prices.buyout, currentPrice: prices.start, fee,
        durationHours: input.duration, endsAt: Date.now() + input.duration * 3_600_000, status: 'active',
      })).toObject();
    } catch (e) {
      this.logger.error(`auction ${id} insert failed: ${(e as Error).message}`);
      await rollback();
      return fail(AUCTION_TEXT.BUSY);
    }
    this.logger.log(`auction ${id} listed by ${cid}: ${goods.display.name} x${goods.display.stackNum} ${prices.start}/${prices.buyout} type ${input.auctionType} fee ${fee}`);
    const pushes: Push[] = [goods.removal];
    const wallet = await this.chars.findById(cid, { money: 1, moneyBind: 1 }).lean();
    pushes.push(push('onUPP', { money: wallet?.money ?? 0, moneyBind: wallet?.moneyBind ?? 0 }));
    const row = await this.view.row(doc);
    pushes.push(push('onAddAuction', row));
    return { ok: true, row, pushes };
  }

  /** Preferred silver first (moneyBind unless the player chose money), then the other; null when neither covers the fee. */
  private async chargeFee(cid: number, fee: number): Promise<'money' | 'moneyBind' | null> {
    const prefs = await this.characters.paymentPrefs(cid);
    const order: ('money' | 'moneyBind')[] = prefs.money === 'money' ? ['money', 'moneyBind'] : ['moneyBind', 'money'];
    for (const key of order) if ((await this.characters.spendMoney(cid, key, fee)) !== null) return key;
    return null;
  }

  private async parkItem(cid: number, itemId: number, ref: string, undo: UndoStack): Promise<Parked | { text: string }> {
    const r = await this.escrow.escrowItem(cid, itemId, ref);
    if (!r.ok) {
      if (r.reason === 'bound') return { text: AUCTION_TEXT.ITEM_BOUND };
      if (r.reason === 'busy') return { text: AUCTION_TEXT.BUSY };
      return { text: (await this.items.exists({ _id: itemId, characterId: cid })) ? AUCTION_TEXT.ITEM_NOT_IN_BAG : AUCTION_TEXT.NO_GOODS };
    }
    const item = r.item;
    undo.push('escrow item', async () => void (await this.escrow.restoreItem(item, ref, cid)));
    return { goodsId: item.id, display: await this.itemDisplay(item), removal: push('onDelCharactorSlot', item.id, item.from.sid) };
  }

  private async parkPet(cid: number, petId: number, ref: string, undo: UndoStack): Promise<Parked | { text: string }> {
    const r = await this.escrow.escrowPet(cid, petId, ref);
    if (!r.ok) {
      if (r.reason === 'busy') return { text: AUCTION_TEXT.BUSY };
      return { text: r.reason === 'missing' ? AUCTION_TEXT.NO_GOODS : PET_TEXTS[r.reason] };
    }
    undo.push('escrow pet', async () => void (await this.escrow.restorePet(petId, ref, cid)));
    return { goodsId: petId, display: this.petDisplay(r.pet), removal: push('onDelPet', petId) };
  }

  private async itemDisplay(item: EscrowedItem): Promise<Display> {
    const equip = item.itemType === ItemKind.EQUIP;
    const tpl = await this.gameData.template(templateTable(item.itemType), item.templateId);
    return {
      clientType: equip ? 18 : 28, templateId: item.templateId, name: String(tpl?.name ?? '') || `Vật phẩm ${item.templateId}`,
      color: item.colorCode > 0 ? item.colorCode : Number(tpl?.color_code ?? 0) || 0, iconCode: String(tpl?.icon_code ?? 0),
      itemKind: Number(tpl?.kind ?? 0) || 0, itemType: Number(tpl?.type ?? 0) || 0, reqLevel: Number(tpl?.req_level ?? 0) || 0,
      stackNum: item.stackCount,
    };
  }

  /** Go describePet: kind 7, type 700 + class_id - 1, level as the required level, colour by growth, template name. */
  private petDisplay(pet: Pet): Display {
    const tpl = this.gameData.petTemplate(pet.tid);
    return {
      clientType: 39, templateId: pet.tid, name: tpl?.name || pet.petName || `Pet ${pet.tid}`, color: petGrowColor(pet.growRate),
      iconCode: tpl?.iconCode ?? '0', itemKind: AUCTION.PET_KIND, itemType: petAuctionType(this.gameData.creatureClassId(pet.tid)),
      reqLevel: pet.level, stackNum: 1,
    };
  }
}

interface Display {
  clientType: 28 | 18 | 39;
  templateId: number;
  name: string;
  color: number;
  iconCode: string;
  itemKind: number;
  itemType: number;
  reqLevel: number;
  stackNum: number;
}

interface Parked {
  goodsId: number;
  display: Display;
  removal: Push;
}
