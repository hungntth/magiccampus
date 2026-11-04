import { Module } from '@nestjs/common';
import { SceneRpc } from './scene.rpc';
import { SceneTransportService } from './scene-transport.service';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { QuestModule } from '../quest/quest.module';
import { BuffModule } from '../buff/buff.module';

@Module({
  imports: [CharacterModule, GameDataModule, QuestModule, BuffModule],
  providers: [SceneRpc, SceneTransportService],
  exports: [SceneTransportService],
})
export class SceneModule {}
