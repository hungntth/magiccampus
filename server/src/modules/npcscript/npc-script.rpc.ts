// npcScript(func): a pick in a scripted NPC menu (onList). The registered script hooks handle it (first claimer wins);
// `close_dialog` and unclaimed funcs are ignored (Go logs and drops unknown funcs). Reply null; results travel as pushes.
// gmNpcMenu(npcId) (GM): sends a test onList whose `gm_echo_<n>` entries answer with onNpcMsg + onMidNote (round-trip check)
// and whose `gm_spawn_<npc>` entry toggles a per-viewer copy of that NPC 150 px to its right (onNpcOn / onNpcOff check).

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NPC_SCRIPT_CLOSE, NPC_SCRIPT_FUNC_MAX, type InstanceNpc } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceNpcService } from './instance-npcs.service';
import { midNote, npcMsg, sendList } from './menu';
import { NpcHookRegistry } from './npc-hooks.registry';

const GM_ECHO = /^gm_echo_(\d+)_(\d+)$/;
const GM_SPAWN = /^gm_spawn_(\d+)$/;
const GM_SPAWN_BASE = 990_000_000; // instance id = base + nid (no data_tbl_npc id is this large)

@Injectable()
export class NpcScriptRpc implements OnModuleInit {
  private readonly logger = new Logger(NpcScriptRpc.name);

  private readonly spawned = new Map<number, InstanceNpc>(); // GM test copies by character id

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly gameData: GameDataService,
  ) {}

  onModuleInit(): void {
    this.hooks.onScript('gm-echo', (session, func) => {
      const m = GM_ECHO.exec(func);
      if (!m || session.gmLevel <= 0) return false;
      npcMsg(session, Number(m[1]), `Đã chọn mục ${m[2]}.`);
      midNote(session, `npcScript ${func}`);
      return true;
    }, 1000);
    this.hooks.onScript('gm-spawn', (session, func) => {
      const m = GM_SPAWN.exec(func);
      return m !== null && session.gmLevel > 0 && this.toggleSpawn(session, Number(m[1]));
    }, 1000);
    this.instances.register('gm-spawn', (session, mapId) => {
      const n = this.spawned.get(session.characterId ?? 0);
      return n && n.map === mapId ? [n] : [];
    });
  }

  private toggleSpawn(session: Session, nid: number): boolean {
    const cid = session.characterId!;
    const old = this.spawned.get(cid);
    if (old) {
      this.spawned.delete(cid);
      this.instances.npcOff(session, old.id);
      return true;
    }
    const row = this.gameData.getNpc(nid);
    if (!row) return false;
    const npc: InstanceNpc = { ...this.gameData.toSceneNpc(row), id: GM_SPAWN_BASE + nid, nid, map: session.mapId };
    npc.posX += 150;
    this.spawned.set(cid, npc);
    this.instances.npcOn(session, npc);
    return true;
  }

  @Rpc('npcScript', { requireCharacter: true, forbidInBattle: true })
  async npcScript(session: Session, args: unknown[]): Promise<null> {
    const func = args[0];
    if (typeof func !== 'string' || func.length === 0 || func.length > NPC_SCRIPT_FUNC_MAX) throw RpcException.invalidArgs('func');
    if (func === NPC_SCRIPT_CLOSE) return null;
    if (!(await this.hooks.runScript(session, func))) this.logger.warn(`npcScript ${func}: no handler (character ${session.characterId})`);
    return null;
  }

  @Rpc('gmNpcMenu', { requireCharacter: true, requireGm: true })
  gmNpcMenu(session: Session, args: unknown[]): null {
    const npcId = Number(args[0]);
    if (!Number.isInteger(npcId) || npcId <= 0) throw RpcException.invalidArgs('npcId');
    sendList(session, npcId, 'Thử menu', 'Chọn một mục để thử npcScript.', [
      { label: 'Mục 1', func: `gm_echo_${npcId}_1` },
      { label: 'Mục 2', func: `gm_echo_${npcId}_2` },
      { label: 'Bật / tắt bản sao', func: `gm_spawn_${npcId}` },
      { label: 'Đóng', func: NPC_SCRIPT_CLOSE },
    ]);
    return null;
  }
}
