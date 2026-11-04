// Party module: in-memory state (PartyManager), orchestration + pushes (PartyService) and the group RPCs. Imported by the scene
// module (movement relay, transport follow) and the chat module (team channel); it does not import either.
import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { PartyManager } from './party.manager';
import { PartyRpc } from './party.rpc';
import { PartyService } from './party.service';

@Module({
  imports: [CharacterModule],
  providers: [PartyManager, PartyService, PartyRpc],
  exports: [PartyManager, PartyService],
})
export class PartyModule {}
