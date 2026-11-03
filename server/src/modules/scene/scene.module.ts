import { Module } from '@nestjs/common';
import { SceneRpc } from './scene.rpc';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { QuestModule } from '../quest/quest.module';

@Module({
  imports: [CharacterModule, GameDataModule, QuestModule],
  providers: [SceneRpc],
})
export class SceneModule {}
