// AutoTaskModule (M10 phase D): quick complete through the auto-task panel (character_autotask state, the six Flash RPCs, the
// phụ bản gate / quick run / completion reward through DungeonModule's exported services).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { DungeonModule } from '../dungeon/dungeon.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RewardsModule } from '../rewards/rewards.module';
import { AutoTaskDungeonService } from './autotask-dungeon.service';
import { AutoTaskStateService } from './autotask-state.service';
import { AutoTaskRpc } from './autotask.rpc';
import { CharacterAutoTask, CharacterAutoTaskSchema } from './autotask.schema';
import { AutoTaskService } from './autotask.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterAutoTask.name, schema: CharacterAutoTaskSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    DungeonModule, InventoryModule, RewardsModule,
  ],
  providers: [AutoTaskStateService, AutoTaskDungeonService, AutoTaskService, AutoTaskRpc],
})
export class AutoTaskModule {}
