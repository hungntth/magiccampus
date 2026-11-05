// Phụ bản floors (Go dungeon_portals.go floor menu / nextDungeonFloor, gate_guard.go, service.go TakeBlocked / RecordAbandon,
// mehuyen_rules_party.go): floor NPC menus ("Nhiệm vụ" + "Đến Tầng N" = dg_next_<npc>), the gate guard on sceneChange, the
// abandon lock and leader-only floor quests (quest take gates), and the leader's floor quest turn-in credited to the run party.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { dungeonFloorLabel, QuestType, type DungeonDef } from '@mc/shared';
import type { Session } from '../../gateway/session';
import type { QuestTemplate } from '../gamedata/quest-data';
import { GameDataService } from '../gamedata/gamedata.service';
import { npcMsg, sendList, systemSay } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { QuestGates } from '../quest/quest-gates';
import { SceneHooks } from '../scene/scene-hooks.service';
import { DG_TEXT, DungeonEntryHooks } from './dungeon-entry.hooks';
import { DungeonEvents } from './dungeon-events';
import { dungeonByFloorNpc, dungeonByMap, enabledDungeons, floorCleared, floorMap, gateVerdict, isOpenerQuest, pendingOf, pendingText, reachable } from './dungeon-rules';
import { DungeonStateService } from './dungeon-state.service';
import { DungeonSupport } from './dungeon-support.service';
import { DungeonViewService } from './dungeon-view.service';

const FLOOR_INTRO = 'Ngươi muốn đi đâu?';
const NEXT = /^dg_next_(\d+)$/;
const EXIT = /^dg_exit_(\d+)$/;
export const LEADER_ONLY = (d: DungeonDef) => `Chỉ đội trưởng mới có thể nhận và trả nhiệm vụ ${d.name}, các thành viên hãy phối hợp theo nhắc nhở của hệ thống.`;
const ABANDONED = 'Hôm nay ngươi đã hủy nhiệm vụ này, hãy quay lại sau 0:00.';
const LEADER_DONE = (q: string) => `Đội trưởng đã hoàn thành nhiệm vụ [${q}].`;

@Injectable()
export class DungeonFloorHooks implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly sceneHooks: SceneHooks,
    private readonly gates: QuestGates,
    private readonly gameData: GameDataService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly entry: DungeonEntryHooks,
    private readonly views: DungeonViewService,
    private readonly events: DungeonEvents,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('dungeon-floor', (s, npc) => this.click(s, npc.id), 60);
    this.hooks.onScript('dungeon-floor', (s, func) => this.script(s, func), 60);
    this.sceneHooks.addGateGuard('dungeon', (s, from, to) => this.gate(s, from, to));
    this.gates.addTakeGate('dungeon', (cid, tpl) => this.takeGate(cid, tpl));
    this.gates.onAbandon('dungeon', async (s, tpl) => {
      if (this.isDungeonQuest(tpl)) await this.state.recordAbandon(s.characterId!, tpl.id);
    });
    this.gates.onFinished('dungeon', (s, tpl) => this.onFinished(s, tpl));
  }

  /** Dungeon of a type-6 quest whose start NPC stands on a floor map (Go dungeonOfQuest). */
  dungeonOfQuest(tpl: QuestTemplate): DungeonDef | undefined {
    if (tpl.type !== QuestType.DAILY) return undefined;
    return dungeonByMap(Number(this.gameData.getNpc(tpl.startNpc)?.pos_map_id ?? 0))?.d;
  }

  private isDungeonQuest(tpl: QuestTemplate): boolean {
    return isOpenerQuest(tpl.id) || this.dungeonOfQuest(tpl) !== undefined;
  }

  private async takeGate(characterId: number, tpl: QuestTemplate): Promise<string | null> {
    if (!this.isDungeonQuest(tpl)) return null;
    const d = this.dungeonOfQuest(tpl);
    if (d?.rules.leaderQuests) {
      const run = await this.state.run(characterId, d);
      if (run && run.leader > 0 && run.leader !== characterId) return LEADER_ONLY(d);
    }
    const doc = await this.state.load(characterId);
    return doc.abandoned[String(tpl.id)] === this.state.today() ? ABANDONED : null;
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    const at = dungeonByFloorNpc(npcId);
    if (!at) return false;
    const { d, floor } = at;
    const cid = session.characterId!;
    const options = await this.entry.questEntry(cid, npcId);
    if (floor + 1 < d.floors.length) options.push({ label: `Đến ${dungeonFloorLabel(d, floor + 1)}`, func: `dg_next_${npcId}` });
    sendList(session, npcId, this.support.npcName(npcId, d.name), FLOOR_INTRO, options);
    const run = await this.state.run(cid, d);
    if (d.rules.leaderQuests && run && run.leader > 0 && run.leader !== cid) systemSay(session, LEADER_ONLY(d));
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    let m = NEXT.exec(func);
    if (m) {
      await this.next(session, Number(m[1]));
      return true;
    }
    m = EXIT.exec(func);
    if (m) {
      const at = dungeonByFloorNpc(Number(m[1]));
      if (at) await this.support.teleport(session, at.d.exitMap);
      return true;
    }
    return false;
  }

  private async next(session: Session, npcId: number): Promise<void> {
    const at = dungeonByFloorNpc(npcId);
    if (!at) return;
    const { d, floor } = at;
    const here = dungeonByMap(session.mapId);
    if (!here || here.d !== d || here.floor !== floor) return npcMsg(session, npcId, DG_TEXT.WRONG_FLOOR);
    if (floor >= d.floors.length - 1) return npcMsg(session, npcId, DG_TEXT.TOP(d));
    const { run, done } = await this.state.view(session.characterId!, d);
    if (!run) return npcMsg(session, npcId, DG_TEXT.NO_RUN(d));
    if (reachable(d, run, done) < floor) return npcMsg(session, npcId, DG_TEXT.LOCKED(d));
    if (!floorCleared(d.floors[floor], run, done)) {
      const p = pendingText(pendingOf(d.floors[floor], run, done), (id) => this.support.npcName(id), (id) => this.support.questName(id));
      return npcMsg(session, npcId, DG_TEXT.PENDING(p));
    }
    await this.support.teleport(session, floorMap(d, floor + 1));
  }

  private async gate(session: Session, fromMap: number, toMap: number): Promise<string | null> {
    const to = dungeonByMap(toMap);
    if (!to) return null;
    const cid = session.characterId!;
    const v = await this.state.view(cid, to.d);
    const verdict = gateVerdict(fromMap, toMap, () => v);
    if (verdict === 'norun') return DG_TEXT.NO_RUN(to.d);
    return verdict === 'locked' ? DG_TEXT.LOCKED(to.d) : null;
  }

  /** The leader's floor quest turn-in credits the run party (Go CreditParty + MeHuyenHooks.OnQuestFinished notices). */
  private async onFinished(session: Session, tpl: QuestTemplate): Promise<void> {
    const d = this.dungeonOfQuest(tpl);
    if (!d || !enabledDungeons().includes(d)) return;
    const leader = session.characterId!;
    const { members, final } = await this.state.creditParty(leader, d, tpl.id);
    const name = this.support.questName(tpl.id);
    for (const m of members) this.support.say(m, LEADER_DONE(name));
    await this.events.emitCredit({ d, questId: tpl.id, leader, members, final });
    for (const id of [leader, ...members]) await this.views.pushTo(id);
  }
}
