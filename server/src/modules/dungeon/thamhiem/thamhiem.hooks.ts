// Thám Hiểm Di Tích hooks (Go handlers/npc dungeon_thamhiem_hooks.go / _hit.go / _lineup.go; rules in thamhiem-layout.ts, step floors in
// thamhiem-steps.service.ts, the A Tây quiz in thamhiem-quiz.service.ts): per-viewer scene NPCs on maps 582-588 (map-200 templates and
// the runtime Vệ Sĩ TM spots 9225201-206, shown per the viewer's run), fights through the dungeon fight service with the Go-side
// line-ups of the spots and the final bosses, the stone / relic rewards of a win for the group head, the reveal pushes after a win,
// the chest (ThamHiemChestRewards + the first-clear bag; opening it finishes the run) and Sứ Giả Tiếp Đón 2512 -> Đông Huyền Thành.
// Điểm Mạo Hiểm (explorer medal) is not granted (M10 decision 12): the points are only logged.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { DungeonDef, InstanceNpc } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import type { Fighter } from '../../combat/battle.types';
import { creatureFighter } from '../../combat/fighters';
import { LINEUP_SLOTS, orderLineup } from '../../combat/npc-battle';
import { GameDataService } from '../../gamedata/gamedata.service';
import { InstanceNpcService } from '../../npcscript/instance-npcs.service';
import { npcMsg, systemSay } from '../../npcscript/menu';
import { NpcHookRegistry } from '../../npcscript/npc-hooks.registry';
import { DG_TEXT } from '../dungeon-entry.hooks';
import { DungeonChestService } from '../dungeon-chest.service';
import { DungeonEvents } from '../dungeon-events';
import { DungeonFightService, FIGHT_TEXT } from '../dungeon-fight.service';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { thLineup, thChestRewards } from './thamhiem-lineups';
import {
  isThRealObject, parseSteleFunc, TH, TH_ENVOY, TH_FINAL_BOSSES, TH_STONES, thSceneOf, thSteleOf, thVisible, thWinPoints, thSpotName,
} from './thamhiem-layout';
import { QUIZ_PREFIX, ThamHiemQuiz } from './thamhiem-quiz.service';
import { STELE_PREFIX, ThamHiemSteps } from './thamhiem-steps.service';
import { ThamHiemSupport } from './thamhiem-support.service';

const TEXT = {
  ENVOY: 'Sứ Giả Tiếp Đón đưa bạn trở về Đông Huyền Thành.',
  ENVOY_WAIT: 'Hãy mở Bảo Rương Di Tích trước đã.',
} as const;

const FLOOR_MAPS: readonly number[] = [582, 583, 584, 585, 586, 587, 588];

@Injectable()
export class ThamHiemHooks implements OnModuleInit {
  private readonly logger = new Logger('ThamHiem');

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly gameData: GameDataService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly events: DungeonEvents,
    private readonly fights: DungeonFightService,
    private readonly chest: DungeonChestService,
    private readonly th: ThamHiemSupport,
    private readonly steps: ThamHiemSteps,
    private readonly quiz: ThamHiemQuiz,
  ) {}

  private get d(): DungeonDef {
    return this.th.d;
  }

  onModuleInit(): void {
    this.instances.register('thamhiem', (s, mapId) => this.spawnsFor(s.characterId!, mapId));
    this.hooks.onClick('thamhiem', (s, npc) => this.click(s, npc.id), 30);
    this.hooks.onHit('thamhiem', (s, npc) => (thSceneOf(npc.id)?.kind === 'fight' ? this.click(s, npc.id) : false), 30);
    this.hooks.onScript('thamhiem', async (s, func) => {
      if (func.startsWith(STELE_PREFIX)) {
        if (parseSteleFunc(func)) await this.steps.setStone(s, func);
        return true;
      }
      if (!func.startsWith(QUIZ_PREFIX)) return false;
      await this.quiz.script(s, func);
      return true;
    }, 30);
    this.events.onVictory((e) => (e.d === this.d ? this.onVictory(e.npcId, e.credited) : undefined));
    // ThamHiemChestRewards on top of the shared pool; the first clear (nothing stamped yet) adds the explorer bag 6117.
    this.chest.addExtraRewards(TH.KEY, async (cid, intn) => thChestRewards(intn, !(await this.state.load(cid)).cleared[TH.KEY]));
  }

  /** Go ExtraSceneNPCs: the viewer's scene NPCs of a floor map, plus the envoy once the viewer opened the chest. */
  private async spawnsFor(cid: number, mapId: number): Promise<InstanceNpc[]> {
    if (!FLOOR_MAPS.includes(mapId)) return [];
    const run = await this.th.run(cid);
    if (!run) return [];
    const scene = thVisible(mapId, this.state.today(), run.beaten);
    if (mapId === TH.FINAL_MAP && run.chest) scene.push(TH_ENVOY);
    return scene.map((n) => this.th.npcOf(n)).filter((n): n is InstanceNpc => n !== null);
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    const st = thSteleOf(npcId);
    if (st) {
      await this.steps.steleClick(session, st);
      return true;
    }
    if (isThRealObject(npcId)) {
      await this.steps.openObject(session, npcId);
      return true;
    }
    if (npcId === TH.ATAY && session.mapId === TH.QUIZ_MAP) {
      await this.quiz.click(session);
      return true;
    }
    if (npcId === TH.BRIGET && session.mapId === TH.BRIGET_MAP) {
      await this.steps.brigetClick(session);
      return true;
    }
    if (npcId === TH.ENVOY && session.mapId === TH.FINAL_MAP) {
      await this.envoyClick(session);
      return true;
    }
    if (npcId === TH.CHEST) {
      if (session.mapId === TH.FINAL_MAP) await this.openChest(session);
      return true;
    }
    const n = thSceneOf(npcId);
    if (!n || n.kind !== 'fight') return false;
    if (session.mapId === n.map) await this.fightClick(session, npcId, n.appearAll);
    return true;
  }

  private async fightClick(session: Session, npcId: number, appearAll: readonly number[]): Promise<void> {
    const run = await this.th.run(session.characterId!);
    if (!run) return npcMsg(session, npcId, DG_TEXT.NO_RUN(this.d));
    if (run.beaten.includes(npcId)) {
      this.instances.npcOff(session, npcId);
      return npcMsg(session, npcId, FIGHT_TEXT.BEATEN(this.fightName(npcId)));
    }
    if (appearAll.some((id) => !run.beaten.includes(id))) return;
    await this.fights.fight(session, npcId, (enemies) => this.applyLineup(npcId, enemies));
  }

  private fightName(npcId: number): string {
    return thSceneOf(npcId)?.nid === TH.GUARD_NID ? thSpotName(npcId) : this.support.npcName(npcId, 'boss');
  }

  /** Go thamHiemTemplates: the Go-side line-up (creature level stats, exp, boss_flag, HP override) replaces the seeded rows. */
  private applyLineup(npcId: number, enemies: Fighter[]): void {
    const units = thLineup(npcId);
    if (!units) return;
    const built: Fighter[] = [];
    for (const u of orderLineup(units)) {
      const tpl = this.gameData.creature(u.creature);
      const slot = LINEUP_SLOTS[built.length];
      if (!tpl || slot === undefined) continue;
      const f = creatureFighter(slot, tpl, u.level, u.bossFlag, u.exp);
      if (u.hp > 0) {
        f.hpMax = u.hp;
        f.hp = u.hp;
      }
      built.push(f);
    }
    if (built.length > 0) enemies.splice(0, enemies.length, ...built);
  }

  /** Win rewards (Go BattleEnd): the stone / relic to the group head, the reveal pushes and the (logged) explorer points. */
  private async onVictory(npcId: number, credited: readonly number[]): Promise<void> {
    const n = thSceneOf(npcId);
    if (!n || n.kind !== 'fight') return;
    let headPaid = false;
    for (const cid of credited) {
      const s = this.support.session(cid);
      if (!s || s.mapId !== n.map) continue;
      if (!headPaid && this.th.isGroupHead(cid)) {
        headPaid = true;
        const item = this.winReward(npcId);
        if (item > 0 && !(await this.th.give(s, item))) this.logger.warn(`win item ${item} not granted to ${cid} (full bag)`);
      }
      this.th.skipPoints(cid, thWinPoints(npcId));
      this.instances.npcOff(s, npcId);
      this.steps.reveal(s, npcId, await this.th.beaten(cid));
      if (n.map === TH.FINAL_MAP && TH_FINAL_BOSSES.includes(npcId)) await this.chest.pushIfVisible(cid, this.d);
    }
  }

  /** Go winReward: a Quái Nguyên Tố gives its element stone, Hộ Vệ Hành Lang a random relic at 30 %. */
  private winReward(npcId: number): number {
    const stone = TH_STONES[npcId];
    if (stone) return stone;
    if (npcId !== TH.GUARDIAN || Math.random() >= TH.RELIC_RATE) return 0;
    return TH.RELIC_FIRST + Math.floor(Math.random() * (TH.RELIC_LAST - TH.RELIC_FIRST + 1));
  }

  private async openChest(session: Session): Promise<void> {
    const cid = session.characterId!;
    const before = await this.th.run(cid);
    await this.chest.claim(session, this.d);
    const after = await this.th.run(cid);
    if (before && !before.chest && after?.chest) {
      const envoy = this.th.npcOf(TH_ENVOY);
      if (envoy) this.instances.npcOn(session, envoy);
    }
  }

  private async envoyClick(session: Session): Promise<void> {
    const run = await this.th.run(session.characterId!);
    if (!run?.chest) return npcMsg(session, TH.ENVOY, TEXT.ENVOY_WAIT);
    systemSay(session, TEXT.ENVOY);
    await this.support.teleport(session, TH.HOME_MAP);
  }
}
