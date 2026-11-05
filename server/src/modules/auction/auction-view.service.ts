// Read side of the auction: auctionSearch rows, the seller's own list (onInitViewAuctionP) and the AuctionRow mapper that adds the
// H5 tooltip data (the escrowed item row / pet looked up in bulk, so a 500-row search is two queries). Legacy: Go view.go.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AUCTION, SlotType, type AuctionRow, type AuctionSearchArg, type AuctionSearchReply } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { Pet } from '../pet/pet.schema';
import { petWrapper } from '../pet/pet-view';
import { listingRow, searchFilter } from './auction-rules';
import { AuctionListing } from './auction.schema';

@Injectable()
export class AuctionViewService {
  constructor(
    @InjectModel(AuctionListing.name) readonly listings: Model<AuctionListing>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
  ) {}

  /** Rows with `item` / `pet` tooltip data when the goods are still parked under the listing's ref. */
  async rows(docs: readonly AuctionListing[], now = Date.now()): Promise<AuctionRow[]> {
    const itemIds = docs.filter((d) => d.goodsKind === 'item').map((d) => d.goodsId);
    const petIds = docs.filter((d) => d.goodsKind === 'pet').map((d) => d.goodsId);
    const itemDocs = itemIds.length > 0
      ? await this.items.find({ _id: { $in: itemIds }, characterId: 0, slotType: SlotType.ESCROW }).lean()
      : [];
    const petDocs = petIds.length > 0 ? await this.pets.find({ _id: { $in: petIds }, characterId: 0 }).lean() : [];
    const itemViews = new Map((await this.inventory.mapRows(itemDocs)).map((v) => [v.id, v]));
    const petById = new Map(petDocs.map((p) => [p._id, p]));
    return docs.map((d) => {
      const row = listingRow(d, now);
      if (d.goodsKind === 'item') {
        const item = itemViews.get(d.goodsId);
        const doc = itemDocs.find((x) => x._id === d.goodsId);
        if (item && doc?.escrowRef === `auction:${d._id}`) row.item = item;
      } else {
        const pet = petById.get(d.goodsId);
        const tpl = pet ? this.gameData.petTemplate(pet.tid) : undefined;
        if (pet && tpl && pet.escrowRef === `auction:${d._id}`) row.pet = petWrapper(pet, tpl);
      }
      return row;
    });
  }

  async row(doc: AuctionListing, now = Date.now()): Promise<AuctionRow> {
    return (await this.rows([doc], now))[0];
  }

  /** auctionSearch: server-side kind / type / level / name filter, soonest-ending first, newest 500. */
  async search(arg: AuctionSearchArg): Promise<AuctionSearchReply> {
    const now = Date.now();
    const docs = await this.listings.find(searchFilter(arg, now)).sort({ endsAt: 1, _id: 1 }).limit(AUCTION.SEARCH_LIMIT).lean();
    const list: Record<string, AuctionRow> = {};
    for (const r of await this.rows(docs, now)) list[String(r.id)] = r;
    return { arg, version: now, list };
  }

  /** The seller's active listings keyed by id (the "Rao bán" tab of onInitViewAuctionP). */
  async mine(sellerId: number): Promise<Record<string, AuctionRow>> {
    const now = Date.now();
    const docs = await this.listings.find({ sellerId, status: 'active' }).sort({ createdAt: 1, _id: 1 }).lean();
    const out: Record<string, AuctionRow> = {};
    for (const r of await this.rows(docs, now)) out[String(r.id)] = r;
    return out;
  }
}
