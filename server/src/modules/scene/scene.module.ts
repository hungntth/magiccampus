import { Module } from '@nestjs/common';
import { SceneRpc } from './scene.rpc';
import { SceneTransportService } from './scene-transport.service';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { QuestModule } from '../quest/quest.module';

@Module({
  imports: [CharacterModule, GameDataModule, QuestModule],
  providers: [SceneRpc, SceneTransportService],
  exports: [SceneTransportService],
})
export class SceneModule {}
