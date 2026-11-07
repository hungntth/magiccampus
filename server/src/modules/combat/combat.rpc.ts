// Combat RPCs: cbom(x, y), battleUpdateCmd([cmd]), battlePlayEnd(), hitNpc(npcId) / clickBoss(npcId) (M9, the same NPC line-up fight;
// M10 hit hooks claim feature NPCs first; M13: no random encounters while flying, and ground NPCs (layer != 3) refuse the fight
// with onRedMsg). Pushes (self): onSetCharState, onBattleStart,
// onBattlePlayList, onUPP, and at the end onAddMoney / onPlayerLevelUp. All replies are null; results travel as pushes.

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { FLIGHT_TEXT } from '@mc/shared';
import { AppearanceService } from '../appearance/appearance.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceNpcService } from '../npcscript/instance-npcs.service';
import { NpcHookRegistry, type NpcRef } from '../npcscript/npc-hooks.registry';
import { CombatService } from './combat.service';
import { EncounterService } from './encounter.service';
import { NpcBattleService } from './npc-battle.service';

@Injectable()
export class CombatRpc {
  constructor(
    private readonly combat: CombatService,
    private readonly encounters: EncounterService,
    private readonly npcBattles: NpcBattleService,
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly gameData: GameDataService,
    private readonly appearance: AppearanceService,
  ) {}

  /** Random encounter check, sent by the client every >= 100 px of walking (throttled to 1 s). Fire-and-forget. */
  @Rpc('cbom', { requireCharacter: true })
  async cbom(session: Session, args: unknown[]): Promise<null> {
    if (!Number.isFinite(Number(args[0])) || !Number.isFinite(Number(args[1]))) throw RpcException.invalidArgs('x/y');
    if (await this.appearance.isFlying(session)) return null; // flying encounter pools (with_cloud) are not ported: none in the air
    await this.encounters.tryRandomEncounter(session);
    return null;
  }

  @Rpc('hitNpc', { requireCharacter: true, forbidInBattle: true })
  async hitNpc(session: Session, args: unknown[]): Promise<null> {
    return this.npcFight(session, args);
  }

  /** Go registers clickBoss on the hitNpc handler (the later registration wins). */
  @Rpc('clickBoss', { requireCharacter: true, forbidInBattle: true })
  async clickBoss(session: Session, args: unknown[]): Promise<null> {
    return this.npcFight(session, args);
  }

  private async npcFight(session: Session, args: unknown[]): Promise<null> {
    const npcId = Number(args[0]);
    if (!Number.isInteger(npcId) || npcId <= 0) throw RpcException.invalidArgs('npcId');
    const ref = await this.refOf(session, npcId);
    if (await this.appearance.isFlying(session) && Number(this.gameData.getNpc(ref?.nid ?? npcId)?.layer) !== 3) {
      session.callback('onRedMsg', FLIGHT_TEXT.GROUND_FIGHT); // Go flight_fight.go: only layer-3 (sky) NPCs can be fought in the air
      return null;
    }
    if (ref && (await this.hooks.runHit(session, ref))) return null; // M10 feature fights (dungeon floors, towers)
    await this.npcBattles.hit(session, npcId);
    return null;
  }

  /** The static NPC on the caller's map, or a per-viewer instance NPC, as a hit-hook target. */
  private async refOf(session: Session, npcId: number): Promise<NpcRef | null> {
    const row = this.gameData.getNpc(npcId);
    if (row && Number(row.pos_map_id) === session.mapId) {
      return { id: npcId, nid: npcId, mapId: session.mapId, x: Number(row.pos_x ?? 0), y: Number(row.pos_y ?? 0), type: Number(row.type ?? 0) };
    }
    const n = await this.instances.find(session, npcId); // dungeon spawns reuse template ids that live on another map
    return n ? { id: n.id, nid: n.nid, mapId: n.map, x: n.posX, y: n.posY, type: n.type, instance: n } : null;
  }

  @Rpc('battleUpdateCmd', { requireCharacter: true })
  async battleUpdateCmd(session: Session, args: unknown[]): Promise<null> {
    await this.combat.command(session, args[0]);
    return null;
  }

  @Rpc('battlePlayEnd', { requireCharacter: true })
  /** Reply null, or the battle's feature reply (M10 BattleHooks.onReply, e.g. the star instance report). */
  async battlePlayEnd(session: Session): Promise<unknown> {
    return this.combat.endBattle(session);
  }
}
