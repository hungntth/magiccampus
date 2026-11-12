// BrotherhoodCoreModule (M14 C): the two brotherhood models and BrotherhoodStore (group lookup, title suffix cache, writes) only, so
// the scene transport can add `broT` to scene payloads without a module cycle. Ceremonies, RPCs and the NPC menu are BrotherhoodModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { Counter, CounterSchema } from '../character/counter.schema';
import { BrotherhoodStore } from './brotherhood.store';
import { Brotherhood, BrotherhoodMember, BrotherhoodMemberSchema, BrotherhoodSchema } from './brotherhood.schema';

@Module({
  imports: [
    CharacterModule,
    MongooseModule.forFeature([
      { name: Brotherhood.name, schema: BrotherhoodSchema },
      { name: BrotherhoodMember.name, schema: BrotherhoodMemberSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  providers: [BrotherhoodStore],
  exports: [BrotherhoodStore],
})
export class BrotherhoodCoreModule {}
