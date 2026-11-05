// Thế Giới Số hooks (Go handlers/npc dungeon_thegioiso_hooks.go): per-viewer spawns on 578 / 580 (eight Tiểu Q until 50333 is done,
// Su Su Sắt / Bạo Long Thú until beaten, the floor-1 portal 2420 once floor 1 is cleared; fifteen gear nodes until 50335 is done,
// Ác Ma Thú Sơ Cấp 2418 and, after it, Siêu Cấp 2419), Tiểu Q fights (re-fightable, 4 Mảnh Vỡ Thần Lực 5976 per win to every
// player-side holder of 50333, cap 30), the credited boss fights through the framework, gear picks (2 x 5977, cap 30), reveal
// pushes after a win, the portal / hide pushes on the leader's quest turn-ins and diary task 41 on 50336. The maze portals are
// in thegioiso-maze.service.ts. Line-ups keep the stock creature stats (Go: owner "giữ nguyên bản gốc").

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BattleResult, type DungeonDef, type InstanceNpc } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { DiaryEvents } from '../../activity/diary-events.service';
import { BattleHooks } from '../../combat/battle-hooks';
import { NpcBattleService } from '../../combat/npc-battle.service';
import { InventoryService } from '../../inventory/inventory.service';
import { InstanceNpcService } from '../../npcscript/instance-npcs.service';
import { midNote, npcMsg, systemSay } from '../../npcscript/menu';
import { NpcHookRegistry } from '../../npcscript/npc-hooks.registry';
import { GrantService } from '../../rewards/grant.service';
import { DG_TEXT } from '../dungeon-entry.hooks';
import { DungeonEvents } from '../dungeon-events';
import { DungeonFightService, FIGHT_TEXT } from '../dungeon-fight.service';
import { dungeonByKey, reachable } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { TGS, TGS_SPAWNS, tgsGrantAmount, tgsRevealedBy, tgsSpawnOf, tgsVisible, type TgsSpawn, type TgsView } from './thegioiso-layout';
import { TheGioiSoMaze } from './thegioiso-maze.service';

const TEXT = {
  NEED_QUEST: (q: string) => `Hãy nhận nhiệm vụ [${q}] ở Huyền Nội Lão Nhân trước.`,
  ENOUGH: (item: string) => `Ngươi đã có đủ ${TGS.NEED} ${item}.`,
  GOT: (n: number, item: string) => `Nhận được ${n} ${item}.`,
  BAG_FULL: 'Túi đồ đã đầy, không thể nhận thêm vật phẩm.',
} as const;
const ITEM_NAME: Readonly<Record<number, string>> = { [TGS.SHARD_ITEM]: 'Mảnh Vỡ Thần Lực', [TGS.GEAR_ITEM]: 'Bánh Răng Hắc Ám' };

@Injectable()
export class TheGioiSoHooks implements OnModuleInit {
  private readonly logger = new Logger(TheGioiSoHooks.name);
  private readonly d: DungeonDef = dungeonByKey(TGS.KEY)!;

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly fights: DungeonFightService,
    private readonly events: DungeonEvents,
    private readonly battleHooks: BattleHooks,
    private readonly npcBattle: NpcBattleService,
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
    private readonly diary: DiaryEvents,
    private readonly maze: TheGioiSoMaze,
  ) {}

  onModuleInit(): void {
    this.instances.register('thegioiso', async (s, mapId) => (mapId === TGS.MAP1 || mapId === TGS.MAP3 ? this.spawnsFor(s.characterId!, mapId) : []));
    this.hooks.onClick('thegioiso', (s, npc) => this.click(s, npc.id), 30);
    this.battleHooks.onEnd(TGS.SOURCE, (e) => this.onTieuQEnd(e.battle.ctx?.bossNid ?? 0, e.result, e.members.filter((m) => !m.left).map((m) => m.cid)));
    this.events.onVictory((e) => (e.d === this.d ? this.onVictory(e.npcId, e.credited) : undefined));
    this.events.onCredit((e) => (e.d === this.d ? this.onCredit(e.questId, e.leader, e.members, e.final) : undefined));
  }

  /** Go TheGioiSoView: null without today's open run. */
  private async view(cid: number): Promise<TgsView | null> {
    const { run, done } = await this.state.view(cid, this.d);
    if (!run || run.closed) return null;
    const questsDone = new Set<number>();
    for (const q of [TGS.SHARD_QUEST, TGS.GEAR_QUEST]) if (await this.state.questDone(cid, run, q)) questsDone.add(q);
    return { beaten: run.beaten, floorOne: reachable(this.d, run, done) >= 1, questsDone };
  }

  private npcOf(s: TgsSpawn): InstanceNpc | null {
    return this.support.spawnNpc(s.id, s.npc, s.map, s.x, s.y);
  }

  private async spawnsFor(cid: number, mapId: number): Promise<InstanceNpc[]> {
    const v = await this.view(cid);
    return v ? tgsVisible(v, mapId).map((s) => this.npcOf(s)).filter((n): n is InstanceNpc => n !== null) : [];
  }

  private async click(session: Session, id: number): Promise<boolean> {
    if (await this.maze.click(session, id)) return true;
    const s = tgsSpawnOf(id);
    if (!s) return false;
    if (session.mapId !== s.map) return true;
    const cid = session.characterId!;
    const v = await this.view(cid);
    if (!v) {
      npcMsg(session, id, DG_TEXT.NO_RUN(this.d));
      return true;
    }
    if (s.portal) await this.hooks.runScript(session, `dg_next_${TGS.PORTAL}`); // same as "Đến Tầng 2" at Huyền Nội 2412
    else if (s.gather) await this.gather(session, s);
    else if (s.appear > 0 && !v.beaten.includes(s.appear)) return true;
    else if (s.boss && v.beaten.includes(s.npc)) {
      this.instances.npcOff(session, id);
      npcMsg(session, id, FIGHT_TEXT.BEATEN(this.support.npcName(s.npc, 'boss')));
    } else if (!(await this.support.questActive(cid, s.quest))) npcMsg(session, id, TEXT.NEED_QUEST(this.support.questName(s.quest)));
    else if (s.repeat) await this.fightTieuQ(session, s);
    else await this.fights.fight(session, s.npc);
    return true;
  }

  private held(cid: number, tid: number): Promise<number> {
    return this.inventory.countByTemplate(cid, [tid]).then((m) => m.get(tid) ?? 0);
  }

  private async fightTieuQ(session: Session, s: TgsSpawn): Promise<void> {
    if ((await this.held(session.characterId!, TGS.SHARD_ITEM)) >= TGS.NEED) return npcMsg(session, s.id, TEXT.ENOUGH(ITEM_NAME[TGS.SHARD_ITEM]));
    // ctx source 'thegioiso': the framework credit skips it (Tiểu Q is not in any floor's bosses)
    const battle = await this.npcBattle.startNpcFight(session, s.npc, {
      level: this.d.level, ctx: { source: TGS.SOURCE, bossNid: s.id, floor: 0, key: TGS.KEY },
    });
    if (!battle && (await this.npcBattle.npcLineup(s.npc, this.d.level)).length === 0) {
      npcMsg(session, s.id, FIGHT_TEXT.NO_LINEUP(this.support.npcName(s.npc, 'boss')));
    }
  }

  /** Adds up to `per` bound items (cap 30 carried) and re-pushes the quest; -1 when the bag is full, 0 when already at the cap. */
  private async give(session: Session, tid: number, per: number, quest: number): Promise<number> {
    const cid = session.characterId!;
    const n = tgsGrantAmount(await this.held(cid, tid), per);
    if (n <= 0) return 0;
    const g = [{ kind: 'item' as const, table: 29, templateId: tid, qty: n, bound: true }];
    if (!(await this.grants.fits(cid, g))) {
      midNote(session, TEXT.BAG_FULL);
      return -1;
    }
    if (!(await this.grants.grant(session, g))) this.logger.warn(`character ${cid}: grant of ${n} x ${tid} incomplete`);
    await this.support.pushQuest(session, quest);
    return n;
  }

  private async gather(session: Session, s: TgsSpawn): Promise<void> {
    const cid = session.characterId!;
    const tid = TGS.GEAR_ITEM;
    if (!(await this.support.questActive(cid, s.quest))) return npcMsg(session, s.id, TEXT.NEED_QUEST(this.support.questName(s.quest)));
    if ((await this.held(cid, tid)) >= TGS.NEED) return npcMsg(session, s.id, TEXT.ENOUGH(ITEM_NAME[tid]));
    const n = await this.give(session, tid, TGS.GEAR_PER_PICK, s.quest);
    if (n > 0) {
      this.instances.npcOff(session, s.id); // gone for the picker until the next scene load (Go)
      systemSay(session, TEXT.GOT(n, ITEM_NAME[tid]));
    }
  }

  /** Go BattleEnd (Tiểu Q): every player-side character holding 50333 gets the shards. */
  private async onTieuQEnd(instanceId: number, result: number, cids: number[]): Promise<void> {
    const s = tgsSpawnOf(instanceId);
    if (result !== BattleResult.WIN || !s?.repeat) return;
    for (const cid of cids) {
      const session = this.support.session(cid);
      if (!session || !(await this.support.questActive(cid, TGS.SHARD_QUEST))) continue;
      const n = await this.give(session, TGS.SHARD_ITEM, TGS.SHARD_PER_WIN, TGS.SHARD_QUEST);
      if (n > 0) systemSay(session, TEXT.GOT(n, ITEM_NAME[TGS.SHARD_ITEM]));
    }
  }

  /** Go BattleEnd (bosses, after the shared credit): onNpcOff for the beaten NPC, onNpcOn for what it reveals (2418 -> 2419). */
  private onVictory(npcId: number, credited: number[]): void {
    const s = tgsSpawnOf(npcId);
    if (!s?.boss) return;
    for (const cid of credited) {
      const session = this.support.session(cid);
      if (!session || session.mapId !== s.map) continue;
      this.instances.npcOff(session, s.id);
      for (const r of tgsRevealedBy(s.npc)) {
        const n = this.npcOf(r);
        if (n) this.instances.npcOn(session, n);
      }
    }
  }

  /**
   * Go OnQuestFinished: 50333 / 50335 hide the Tiểu Q / gear nodes, 50334 shows the floor-1 portal, 50336 records diary task 41
   * (leader only: leader-only quests). The credit reaches the run party, so the pushes go to every credited member.
   */
  private async onCredit(questId: number, leader: number, members: readonly number[], final: boolean): Promise<void> {
    if (final) this.diary.record(leader, TGS.DIARY_TASK, 1);
    for (const cid of [leader, ...members]) {
      const session = this.support.session(cid);
      if (!session) continue;
      if (questId === TGS.SHARD_QUEST || questId === TGS.GEAR_QUEST) {
        for (const s of TGS_SPAWNS) if (s.hideDone === questId && s.map === session.mapId) this.instances.npcOff(session, s.id);
      } else if (questId === TGS.BEAST_QUEST && session.mapId === TGS.MAP1) {
        const v = await this.view(cid);
        for (const s of v ? tgsVisible(v, TGS.MAP1) : []) {
          const n = s.portal ? this.npcOf(s) : null;
          if (n) this.instances.npcOn(session, n);
        }
      }
    }
  }
}
