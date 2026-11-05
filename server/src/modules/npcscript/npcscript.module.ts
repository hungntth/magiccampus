// NpcScriptModule (M10 phase A): the NPC hook registry (click / script / hit hooks), the per-viewer instance NPC providers and
// the npcScript RPC. Imports only GameDataModule, so every feature module (npc, scene, combat, dungeon…) can import it without cycles.

import { Module } from '@nestjs/common';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InstanceNpcService } from './instance-npcs.service';
import { NpcHookRegistry } from './npc-hooks.registry';
import { NpcScriptRpc } from './npc-script.rpc';

@Module({
  imports: [GameDataModule],
  providers: [NpcHookRegistry, InstanceNpcService, NpcScriptRpc],
  exports: [NpcHookRegistry, InstanceNpcService],
})
export class NpcScriptModule {}
