import { Module } from '@nestjs/common';
import { SceneRpc } from './scene.rpc';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';

@Module({
  imports: [CharacterModule, GameDataModule],
  providers: [SceneRpc],
})
export class SceneModule {}
