// Item functions of consumables: teleport scrolls (useTransport*, useItemGold, getTransportMaps) and the rename card.
// Imports SceneModule (SceneTransportService), PartyModule, CharacterModule and InventoryModule; nothing imports it.
import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PartyModule } from '../party/party.module';
import { SceneModule } from '../scene/scene.module';
import { ItemSpendService } from './item-spend.service';
import { RenameRpc } from './rename.rpc';
import { RenameService } from './rename.service';
import { TransportRpc } from './transport.rpc';
import { TransportService } from './transport.service';

@Module({
  imports: [CharacterModule, GameDataModule, InventoryModule, PartyModule, SceneModule],
  providers: [ItemSpendService, TransportService, TransportRpc, RenameService, RenameRpc],
})
export class TransportModule {}
