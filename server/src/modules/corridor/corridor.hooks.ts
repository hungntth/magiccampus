// Hành Lang Vô Tận NPC menus (Go handlers/corridor handler.go): gate 2309 (hlvt_start, hlvt_prev_progress, hlvt_max_possible,
// hlvt_max_cleared, hlvt_daily_reward), floor bosses 2301-2308 (hlvt_kick_out_<npc>, hlvt_boss_current_<npc>, hlvt_continue_<npc>),
// portals 2293-2300 (hlvt_next_floor_<npc>, hlvt_explore_more_<npc>) and exits 2310-2317 (hlvt_goto_dong_huyen, hlvt_goto_quyen_co,
// hlvt_one_floor_left). Registered as NpcHookRegistry click / script hooks. Pushes: onList, onNpcMsg, onSystemSay, onSceneEnter.
// The Go `a` alert pushes (progress, boss info) go out as onNpcMsg: the H5 client has no `a` handler.

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CORRIDOR, CORRIDOR_FUNC as FN, corridorReachable, isCorridorBossNpc, isCorridorExitNpc, isCorridorPortalNpc, type NpcMenuOption,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { npcMsg, sendList, systemSay } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { SceneTransportService } from '../scene/scene-transport.service';
import { bossStats, floorLevel, floorLineup } from './corridor-config';
import { CORRIDOR_TEXT as T } from './corridor-text';
import { CorridorFightService } from './corridor-fight.service';
import { CorridorService, type FloorMove } from './corridor.service';

const PER_NPC = /^hlvt_(kick_out|boss_current|continue|next_floor|explore_more)_(\d+)$/;
const ORDER = 50;

@Injectable()
export class CorridorHooks implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly corridor: CorridorService,
    private readonly fights: CorridorFightService,
    private readonly gameData: GameDataService,
    private readonly transport: SceneTransportService,
    private readonly characters: CharacterService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('corridor', (s, npc) => this.click(s, npc.id), ORDER);
    this.hooks.onScript('corridor', (s, func) => this.script(s, func), ORDER);
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    const per = (label: string, fn: string): NpcMenuOption => ({ label, func: fn + npcId });
    if (npcId === CORRIDOR.GATE_NPC) {
      const reachable = corridorReachable((await this.corridor.state(session.characterId!)).maxCleared);
      this.menu(session, npcId, T.GATE, [
        { label: 'Vào HLVT "Khởi Trình"', func: FN.START },
        { label: `Đến: Tiến độ trước (Tầng ${reachable})`, func: FN.PREV_PROGRESS },
        { label: 'Xem tầng cao nhất có thể đến', func: FN.MAX_POSSIBLE },
        { label: 'Xem tầng cao nhất đã vượt', func: FN.MAX_CLEARED },
        { label: 'Nhận thưởng hằng ngày', func: FN.DAILY_REWARD },
      ]);
    } else if (isCorridorBossNpc(npcId)) {
      this.menu(session, npcId, T.BOSS, [
        per('Lại đây! Ta sẽ đá ngươi khỏi đây', FN.KICK_OUT),
        per('Cho ta biết ta đang đối mặt với ai?', FN.BOSS_CURRENT),
        per('Ta muốn tiếp tục', FN.CONTINUE),
      ]);
    } else if (isCorridorPortalNpc(npcId)) {
      const floor = (await this.fights.currentFloor(session)) || npcId - CORRIDOR.PORTAL_NPC_BASE + 1;
      this.menu(session, npcId, T.PORTAL, [
        per(`Đến: HLVT tầng kế (tầng ${floor + 1})`, FN.NEXT_FLOOR),
        per('Ta muốn thám hiểm tầng nữa', FN.EXPLORE_MORE),
      ]);
    } else if (isCorridorExitNpc(npcId)) {
      this.menu(session, npcId, T.EXIT, [
        { label: 'Chuyển đến Đông Huyền Thành', func: FN.GOTO_DONG_HUYEN },
        { label: 'Chuyển Đến Quyến Cố Thành', func: FN.GOTO_QUYEN_CO },
        { label: 'Vẫn còn 1 tầng nữa đấy', func: FN.ONE_FLOOR_LEFT },
      ]);
    } else {
      return false;
    }
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    if (!func.startsWith('hlvt_')) return false;
    const cid = session.characterId!;
    const gate = CORRIDOR.GATE_NPC;
    switch (func) {
      case FN.START:
        await this.enter(session, gate, 1);
        return true;
      case FN.PREV_PROGRESS:
        await this.enter(session, gate, corridorReachable((await this.corridor.state(cid)).maxCleared));
        return true;
      case FN.MAX_POSSIBLE:
        npcMsg(session, gate, T.MAX_POSSIBLE(corridorReachable((await this.corridor.state(cid)).maxCleared)));
        return true;
      case FN.MAX_CLEARED:
        npcMsg(session, gate, T.MAX_CLEARED((await this.corridor.state(cid)).maxCleared));
        return true;
      case FN.DAILY_REWARD:
        npcMsg(session, gate, await this.corridor.claimDaily(session));
        return true;
      case FN.GOTO_DONG_HUYEN:
        await this.goto(session, CORRIDOR.EXIT_MAP);
        return true;
      case FN.GOTO_QUYEN_CO:
        await this.goto(session, CORRIDOR.GATE_MAP);
        return true;
      case FN.ONE_FLOOR_LEFT:
        systemSay(session, T.ONE_FLOOR_LEFT);
        return true;
    }
    const m = PER_NPC.exec(func);
    if (!m) return false;
    await this.perNpc(session, m[1], Number(m[2]));
    return true;
  }

  private async perNpc(session: Session, action: string, npcId: number): Promise<void> {
    switch (action) {
      case 'kick_out':
        return this.fights.fight(session, npcId);
      case 'boss_current':
        return this.bossInfo(session, npcId);
      case 'continue':
        return this.next(session, npcId, T.BEAT_ME_FIRST);
      case 'next_floor':
        return this.next(session, npcId);
      default:
        return npcMsg(session, npcId, T.EXPLORE);
    }
  }

  private menu(session: Session, npcId: number, content: string, options: NpcMenuOption[]): void {
    sendList(session, npcId, String(this.gameData.getNpc(npcId)?.name ?? '') || 'NPC', content, options);
  }

  private bossName(floor: number): string {
    return floorLineup(floor)?.name ?? 'BOSS';
  }

  /** Go enter: saves the current floor, then moves to the floor map safe point. */
  private async enter(session: Session, npcId: number, floor: number): Promise<void> {
    if (session.battleId !== null) return systemSay(session, T.IN_BATTLE);
    await this.arrive(session, npcId, await this.corridor.enter(session.characterId!, floor));
  }

  /** Go next: the portal / "Ta muốn tiếp tục" move to the next floor once the current one is cleared. */
  private async next(session: Session, npcId: number, notClearedText?: string): Promise<void> {
    if (session.battleId !== null) return systemSay(session, T.IN_BATTLE);
    await this.arrive(session, npcId, await this.corridor.advance(session.characterId!, session.mapId, notClearedText));
  }

  private async arrive(session: Session, npcId: number, move: FloorMove): Promise<void> {
    if (!move.ok) return npcMsg(session, npcId, move.text);
    if (!(await this.goto(session, move.map))) return systemSay(session, T.ERROR);
    systemSay(session, T.ENTERED(move.floor, this.bossName(move.floor)));
  }

  private async goto(session: Session, mapId: number): Promise<boolean> {
    const map = this.gameData.getMap(mapId);
    if (!map || session.battleId !== null) return false;
    session.callback('onSceneEnter', await this.transport.moveToMap(session, mapId, Number(map.safe_x ?? 0), Number(map.safe_y ?? 0)));
    return true;
  }

  /** hlvt_boss_current_<npc>: floor, boss name, the level the fight would use and the boss HP. */
  private async bossInfo(session: Session, npcId: number): Promise<void> {
    const floor = await this.fights.currentFloor(session);
    if (floor === 0) return npcMsg(session, npcId, T.NOT_IN_CORRIDOR);
    const team = await this.fights.eligible(session, floor);
    const levels = team ? team.sts.map((s) => s.doc.level) : [(await this.characters.getById(session.characterId!)).level];
    npcMsg(session, npcId, T.BOSS_INFO(floor, this.bossName(floor), floorLevel(floor, Math.max(1, ...levels)), bossStats(floor)?.hp ?? 0));
  }
}
