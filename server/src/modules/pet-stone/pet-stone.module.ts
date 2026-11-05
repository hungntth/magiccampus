// Wires the M12 Pet Stone persistent bag, inlay / energy services and RPCs (separate collection character_pet_stones).
// Exports PetStoneService.grant for future stone sources (gift bags, drops); none are wired yet.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { ProgressionModule } from '../progression/progression.module';
import { PetStoneInlayService } from './pet-stone-inlay.service';
import { PetStoneStore } from './pet-stone-store';
import { PetStoneRpc } from './pet-stone.rpc';
import { CharacterPetStone, CharacterPetStoneSchema } from './pet-stone.schema';
import { PetStoneService } from './pet-stone.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterPetStone.name, schema: CharacterPetStoneSchema },
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
    ]),
    GameDataModule, InventoryModule, ProgressionModule,
  ],
  providers: [PetStoneStore, PetStoneService, PetStoneInlayService, PetStoneRpc],
  exports: [PetStoneService],
})
export class PetStoneModule {}
