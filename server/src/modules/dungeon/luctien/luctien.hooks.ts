// Lục Tiên Cảnh hooks (Go handlers/npc dungeon_luctien.go / _doors.go / _scene.go; rules in luctien-layout.ts, quiz in
// luctien-quiz.service.ts): the key + Đóa Hoa Hồng granted when quest 3814 is turned in, the guide 971 re-key menu (lt_rekey),
// the five floor-2 doors (lt_door_<npc>, lt_exit_<npc>), the boss menu of 984 / 967 (lt_fight_<npc>, 984 only while 3821 is
// active), the fake leaders of floor 5 and the wandering merchant 975 (a per-viewer copy at one of 8 maze points per 10 min).
// The chest medal rows (ti 98) are skipped by GrantService (M10 decision 12). Ticket-like expiry of the keys is not ported.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { dungeonFloorLabel, type DungeonDef, type NpcMenuOption } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { GameDataService } from '../../gamedata/gamedata.service';
import { InstanceNpcService } from '../../npcscript/instance-npcs.service';
import { npcMsg, sendList, systemSay } from '../../npcscript/menu';
import { NpcHookRegistry } from '../../npcscript/npc-hooks.registry';
import { QuestGates } from '../../quest/quest-gates';
import { QuestService } from '../../quest/quest.service';
import { DungeonEntryHooks } from '../dungeon-entry.hooks';
import { DungeonFightService } from '../dungeon-fight.service';
import { dungeonByFighter, dungeonByKey, dungeonByMap, reachable } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { LucTienItems } from './luctien-items.service';
import { doorKey, doorVerdict, fakeLeaderTarget, isLtDoor, isLtFakeLeader, LT, merchantSpot, randomKey } from './luctien-layout';

const DOOR = 'lt_door_';
const EXIT = 'lt_exit_';
const FIGHT = 'lt_fight_';
const REKEY = 'lt_rekey';

export const LT_TEXT = {
  DOOR_INTRO: 'Cánh cổng phát ra ánh sáng mờ ảo, không nhìn rõ màu sắc. Chỉ có chìa khóa cùng màu mới mở được nó.',
  DOOR_TITLE: 'Cổng Đến Tầng 3',
  DOOR_USE: 'Dùng chìa khóa mở cổng',
  EXIT: 'Rời khỏi phụ bản',
  NO_KEY_QUEST: 'Hãy đến chỗ Người Dẫn Đường Gian Xảo nhận chìa khóa trước.',
  NO_KEY: 'Ngươi không có chìa khóa nào. Hãy xin Người Dẫn Đường Gian Xảo hoặc mua Chìa Khóa Vạn Năng ở Thợ Làm Chìa Khóa Tham Lam.',
  WRONG_DOOR: 'Chìa khóa không khớp với cánh cổng này! Ngươi bị đưa trở lại lối vào tầng 2.',
  RIGHT_DOOR: 'Cánh cổng đã mở, mau đến tầng 3!',
  REKEY: 'Xin chìa khóa khác',
  GUIDE_TITLE: 'Người Dẫn Đường Gian Xảo',
  GUIDE_INTRO: 'Nếu ngươi dùng đúng chìa khóa cùng màu với cánh cổng thì sẽ có thể đến được tầng 3.',
  FIGHT: 'Khiêu chiến',
  FAKE: (label: string) => `Đây không phải Thủ Lĩnh Phù Thủy thật! Một luồng ma lực đưa ngươi đến ${label}.`,
  NEED_FLOWER: 'Hãy mang Hoa Ngũ Sắc từ Phù Thủy Phương Nam đến tìm ta, nhận nhiệm vụ Thử Thách Cuối Cùng rồi hãy khiêu chiến.',
  BOSS_INTRO: 'Cuối cùng ngươi cũng tìm được ta!',
  BOSS_TITLE: 'Thủ Lĩnh Phù Thủy',
} as const;

@Injectable()
export class LucTienHooks implements OnModuleInit {
  private readonly logger = new Logger('LucTien');
  private readonly d: DungeonDef = dungeonByKey(LT.KEY)!;

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly gates: QuestGates,
    private readonly gameData: GameDataService,
    private readonly quests: QuestService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly entry: DungeonEntryHooks,
    private readonly fights: DungeonFightService,
    private readonly items: LucTienItems,
  ) {}

  onModuleInit(): void {
    this.instances.register('luctien-merchant', (_s, mapId) => {
      if (mapId !== LT.MAZE_MAP) return [];
      const { x, y } = merchantSpot(Date.now());
      const n = this.support.spawnNpc(LT.MERCHANT_NPC, LT.MERCHANT_NPC, LT.MAZE_MAP, x, y);
      return n ? [n] : [];
    });
    this.hooks.onClick('luctien', (s, npc) => this.click(s, npc.id, npc.instance !== undefined), 30);
    this.hooks.onScript('luctien', (s, func) => this.script(s, func), 30);
    this.gates.onFinished('luctien', async (s, tpl) => {
      if (tpl.id === LT.KEY_QUEST) await this.onKeyQuest(s);
    });
  }

  private onMap(session: Session, npcId: number): boolean {
    return Number(this.gameData.getNpc(npcId)?.pos_map_id ?? -1) === session.mapId;
  }

  /** Finishing 3814 hands one random key (if none carried) and the Đóa Hoa Hồng (if none held), both bound. */
  private async onKeyQuest(session: Session): Promise<void> {
    const cid = session.characterId!;
    if ((await this.items.carriedKey(cid)) === 0) await this.items.give(session, randomKey(Math.random));
    if ((await this.items.held(cid, LT.FLOWER_ITEM)) === 0) await this.items.give(session, LT.FLOWER_ITEM);
  }

  private async click(session: Session, npcId: number, instance: boolean): Promise<boolean> {
    if (instance) return false;
    if (isLtDoor(npcId)) {
      if (this.onMap(session, npcId)) this.doorMenu(session, npcId);
      return true;
    }
    if (npcId === LT.GUIDE_NPC) return this.guideClick(session);
    if (npcId === LT.REAL_LEADER || npcId === LT.SIDE_BOSS) {
      if (this.onMap(session, npcId)) await this.bossMenu(session, npcId);
      return true;
    }
    if (isLtFakeLeader(npcId)) {
      if (this.onMap(session, npcId)) await this.fakeLeader(session, npcId);
      return true;
    }
    return false;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    if (func === REKEY) {
      await this.rekey(session);
      return true;
    }
    if (func.startsWith(DOOR)) {
      await this.openDoor(session, Number(func.slice(DOOR.length)));
      return true;
    }
    if (func.startsWith(EXIT)) {
      await this.support.teleport(session, this.d.exitMap);
      return true;
    }
    if (func.startsWith(FIGHT)) {
      await this.fightScript(session, Number(func.slice(FIGHT.length)));
      return true;
    }
    return false;
  }

  // -- floor 2 ---------------------------------------------------------------------------------------------------------

  private async keyQuestDone(cid: number): Promise<boolean> {
    return this.quests.completedToday(cid, LT.KEY_QUEST);
  }

  private async guideClick(session: Session): Promise<boolean> {
    const cid = session.characterId!;
    if (!this.onMap(session, LT.GUIDE_NPC) || !(await this.keyQuestDone(cid)) || (await this.items.carriedKey(cid)) !== 0) return false;
    const options: NpcMenuOption[] = [...(await this.entry.questEntry(cid, LT.GUIDE_NPC)), { label: LT_TEXT.REKEY, func: REKEY }];
    sendList(session, LT.GUIDE_NPC, this.support.npcName(LT.GUIDE_NPC, LT_TEXT.GUIDE_TITLE), LT_TEXT.GUIDE_INTRO, options);
    return true;
  }

  private async rekey(session: Session): Promise<void> {
    const cid = session.characterId!;
    if (!this.onMap(session, LT.GUIDE_NPC) || !(await this.keyQuestDone(cid)) || (await this.items.carriedKey(cid)) !== 0) return;
    await this.items.give(session, randomKey(Math.random));
  }

  private doorMenu(session: Session, npcId: number): void {
    const options: NpcMenuOption[] = [
      { label: LT_TEXT.DOOR_USE, func: DOOR + npcId },
      { label: LT_TEXT.EXIT, func: EXIT + npcId },
    ];
    sendList(session, npcId, this.support.npcName(npcId, LT_TEXT.DOOR_TITLE), LT_TEXT.DOOR_INTRO, options);
  }

  private async openDoor(session: Session, npcId: number): Promise<void> {
    if (!isLtDoor(npcId) || !this.onMap(session, npcId)) return;
    const cid = session.characterId!;
    if (!(await this.keyQuestDone(cid))) return npcMsg(session, npcId, LT_TEXT.NO_KEY_QUEST);
    if ((await this.items.carriedKey(cid)) === 0) return npcMsg(session, npcId, LT_TEXT.NO_KEY);
    const colour = doorKey(cid, this.state.today(), npcId);
    const counts = colour !== 0 ? [await this.items.held(cid, colour), await this.items.held(cid, LT.MASTER_KEY)] : [0, 0];
    const verdict = doorVerdict(colour, (id) => (id === colour ? counts[0] > 0 : id === LT.MASTER_KEY && counts[1] > 0));
    const spend = verdict.result === 'right' ? verdict.spend : 0;
    this.logger.log(`door: character ${cid} npc ${npcId} colour ${colour} spent ${spend}`);
    if (verdict.result === 'wrong' || !(await this.items.spend(session, spend))) {
      systemSay(session, LT_TEXT.WRONG_DOOR);
      return this.support.teleport(session, LT.DOOR_MAP);
    }
    systemSay(session, LT_TEXT.RIGHT_DOOR);
    await this.support.teleport(session, LT.MAZE_MAP);
  }

  // -- floor 5 ---------------------------------------------------------------------------------------------------------

  /** Go lucTienFightOpen: the fight is valid (run, floor reached, not beaten) and, for 984, quest 3821 is active. */
  private async fightOpen(cid: number, npcId: number): Promise<boolean> {
    const ref = dungeonByFighter(npcId);
    if (!ref) return false;
    const { run, done } = await this.state.view(cid, ref.d);
    if (!run || reachable(ref.d, run, done) < ref.floor || run.beaten.includes(npcId)) return false;
    return npcId !== LT.REAL_LEADER || this.support.questActive(cid, LT.FINAL_QUEST);
  }

  private async bossMenu(session: Session, npcId: number): Promise<void> {
    const cid = session.characterId!;
    const quest = await this.entry.questEntry(cid, npcId);
    const fight: NpcMenuOption[] = (await this.fightOpen(cid, npcId)) ? [{ label: LT_TEXT.FIGHT, func: FIGHT + npcId }] : [];
    if (fight.length === 0 && quest.length === 0) {
      if (npcId === LT.REAL_LEADER) return npcMsg(session, npcId, LT_TEXT.NEED_FLOWER);
      await this.fights.fight(session, npcId); // 967: the generic refusals
      return;
    }
    sendList(session, npcId, this.support.npcName(npcId, LT_TEXT.BOSS_TITLE), LT_TEXT.BOSS_INTRO, [...quest, ...fight]);
  }

  private async fightScript(session: Session, npcId: number): Promise<void> {
    if (npcId !== LT.REAL_LEADER && npcId !== LT.SIDE_BOSS) return;
    if (!(await this.fightOpen(session.characterId!, npcId))) return npcMsg(session, npcId, LT_TEXT.NEED_FLOWER);
    if (this.onMap(session, npcId)) await this.fights.fight(session, npcId);
  }

  private async fakeLeader(session: Session, npcId: number): Promise<void> {
    const target = fakeLeaderTarget(Math.random);
    const at = dungeonByMap(target);
    systemSay(session, LT_TEXT.FAKE(at ? dungeonFloorLabel(at.d, at.floor) : this.d.name));
    this.logger.log(`fake leader: character ${session.characterId} npc ${npcId} -> map ${target}`);
    await this.support.teleport(session, target);
  }
}
