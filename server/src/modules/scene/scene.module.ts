import { Module } from '@nestjs/common';
import { SceneRpc } from './scene.rpc';
import { SceneTransportService } from './scene-transport.service';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { QuestModule } from '../quest/quest.module';
import { BuffModule } from '../buff/buff.module';
import { PartyModule } from '../party/party.module';
import { TradeModule } from '../trade/trade.module';

@Module({
  imports: [CharacterModule, GameDataModule, QuestModule, BuffModule, PartyModule, TradeModule],
  providers: [SceneRpc, SceneTransportService],
  exports: [SceneTransportService],
})
export class SceneModule {}
