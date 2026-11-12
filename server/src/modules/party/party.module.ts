// Party module: in-memory state (PartyManager), orchestration + pushes (PartyService) and the group RPCs. Imported by the scene
// module (movement relay, transport follow) and the chat module (team channel); it does not import either.
import { Module } from '@nestjs/common';
import { ActivityEventsModule } from '../activity/activity-events.module';
import { CharacterModule } from '../character/character.module';
import { PartyManager, RoomManager } from './party.manager';
import { GroupExtrasService } from './group-extras.service';
import { RoomRpc } from './room.rpc';
import { RoomService } from './room.service';
import { PartyRpc } from './party.rpc';
import { PartyService } from './party.service';
import { PermissionModule } from '../settings/permission.module';

@Module({
  imports: [ActivityEventsModule, CharacterModule, PermissionModule],
  providers: [PartyManager, RoomManager, PartyService, PartyRpc, RoomService, RoomRpc, GroupExtrasService],
  exports: [PartyManager, PartyService, RoomManager],
})
export class PartyModule {}
