// Auction listing (`auction_listings`, legacy player.auction_listings). `_id` is the client-visible auction id (counter
// `auctions`). The goods are NOT embedded: the item row / pet is parked in escrow under ref `auction:<_id>` (EscrowService) and
// moves to a delivery mail on settlement. `endsAt` is epoch ms. State changes are conditional findOneAndUpdates (auction-rules).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { RefundDue } from './auction-rules';

@Schema({ collection: 'auction_listings', timestamps: true })
export class AuctionListing {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  sellerId: number;

  @Prop({ default: '' })
  sellerName: string;

  /** 'item' (a character_items row) | 'pet'. */
  @Prop({ type: String, required: true })
  goodsKind: 'item' | 'pet';

  /** Item instance id or pet id of the escrowed goods (never changes while listed). */
  @Prop({ required: true })
  goodsId: number;

  // display (Go listing columns)
  @Prop({ type: Number, required: true })
  clientType: 28 | 18 | 39;

  @Prop({ default: 0 })
  templateId: number;

  @Prop({ default: '' })
  name: string;

  @Prop({ default: 0 })
  color: number;

  @Prop({ type: String, default: '0' })
  iconCode: string;

  @Prop({ default: 0 })
  itemKind: number;

  @Prop({ default: 0 })
  itemType: number;

  @Prop({ default: 0 })
  reqLevel: number;

  @Prop({ default: 1 })
  stackNum: number;

  /** 1 Bạc, 2 Vàng. */
  @Prop({ required: true })
  auctionType: number;

  @Prop({ required: true })
  startPrice: number;

  /** 0 = no buy-out. */
  @Prop({ default: 0 })
  buyoutPrice: number;

  @Prop({ required: true })
  currentPrice: number;

  /** 0 = no bid yet. */
  @Prop({ default: 0 })
  bidderId: number;

  @Prop({ default: '' })
  bidderName: string;

  /** Number of bids so far (the idempotency suffix of outbid refund mails). */
  @Prop({ default: 0 })
  bidSeq: number;

  @Prop({ default: 0 })
  fee: number;

  @Prop({ required: true })
  durationHours: number;

  @Prop({ required: true, index: true })
  endsAt: number;

  @Prop({ type: String, default: 'active' })
  status: 'active' | 'sold' | 'expired' | 'cancelled';

  @Prop({ default: false })
  buyout: boolean;

  @Prop({ default: 0 })
  winnerId: number;

  @Prop({ default: 0 })
  finalPrice: number;

  /** false while a settlement mail (goods / price) is still owed; the sweeper retries (sources are idempotent). */
  @Prop({ default: true })
  mailed: boolean;

  @Prop({ type: Object, default: null })
  refundDue: RefundDue | null;
}

export type AuctionDocument = HydratedDocument<AuctionListing>;
export const AuctionListingSchema = SchemaFactory.createForClass(AuctionListing);
AuctionListingSchema.index({ status: 1, itemKind: 1, endsAt: 1 });
AuctionListingSchema.index({ sellerId: 1, status: 1 });
AuctionListingSchema.index({ status: 1, endsAt: 1 });
AuctionListingSchema.index({ status: 1, mailed: 1 });
