// AuctionModule (M11 phase B): Đấu giá RPCs, the listing / bid / settle sagas, the expiry sweeper and the read side used by the
// auction NPC (AuctionViewService.mine). Goods are parked in InventoryModule's EscrowService, deliveries go through MailModule's
// MailSystemService (public API). Exported: AuctionViewService for NpcRpc.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { MailModule } from '../mail/mail.module';
import { Pet, PetSchema } from '../pet/pet.schema';
import { TradeModule } from '../trade/trade.module';
import { VipCoreModule } from '../vip/vip-core.module';
import { AuctionBidService } from './auction-bid.service';
import { AuctionGateService } from './auction-gate.service';
import { AuctionListingService } from './auction-listing.service';
import { AuctionSettleService } from './auction-settle.service';
import { AuctionSweepService } from './auction-sweep.service';
import { AuctionViewService } from './auction-view.service';
import { AuctionRpc } from './auction.rpc';
import { AuctionListing, AuctionListingSchema } from './auction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuctionListing.name, schema: AuctionListingSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: Pet.name, schema: PetSchema },
    ]),
    CharacterModule, GameDataModule, InventoryModule, MailModule, TradeModule, VipCoreModule,
  ],
  providers: [
    AuctionGateService, AuctionViewService, AuctionListingService, AuctionSettleService, AuctionBidService, AuctionSweepService, AuctionRpc,
  ],
  exports: [AuctionViewService],
})
export class AuctionModule {}
