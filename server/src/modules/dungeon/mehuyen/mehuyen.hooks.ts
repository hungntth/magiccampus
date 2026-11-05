// Mê Huyễn Động hooks (Go handlers/npc dungeon_mehuyen_floor.go / _quests.go / _curse.go BattleEnd): per-viewer boss and flower
// spawns on 2003 / 2004, the tuned boss fights (1624 only after the cure), Hoa Vong Hồn picks (1 bound Hoa Linh Hồn to the run
// leader when it stands on 2004, else to the picker; each node once per character and run), the 4 s post-win pushes (curse after
// 1619, flowers once both guards fall), the leader's step hints and the 5242 cure (party cured, flowers off, 1624 on).

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DungeonDef, InstanceNpc } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { EncounterService } from '../../combat/encounter.service';
import { InventoryService } from '../../inventory/inventory.service';
import { InstanceNpcService } from '../../npcscript/instance-npcs.service';
import { midNote, npcMsg, systemSay } from '../../npcscript/menu';
import { NpcHookRegistry } from '../../npcscript/npc-hooks.registry';
import { GrantService } from '../../rewards/grant.service';
import { DG_TEXT } from '../dungeon-entry.hooks';
import { DungeonEvents } from '../dungeon-events';
import { DungeonFightService } from '../dungeon-fight.service';
import { dungeonByKey } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { MeHuyenCurseService } from './mehuyen-curse.service';
import {
  MH, MH_BOSSES, MH_FLOWERS, mhBossVisible, mhFlowerVisible, mhGuarded, tuneMeHuyenLineup, tuneMeHuyenMobs, type MhSpawn, type MhView,
} from './mehuyen-layout';

const TEXT = {
  GUARDED: 'Hoa Vong Hồn đang bị hai Cự Ma Chiến Tướng trông giữ, hãy đánh bại cả hai trước.',
  CURED: 'Bùa chú đã được giải trừ, không cần thêm Hoa Linh Hồn.',
  ENOUGH: (n: string) => `${n} đã có đủ ${MH.FLOWER_NEED} Hoa Linh Hồn, hãy giao cho Mê Huyễn Thủ Hộ Viên.`,
  PICKED: (n: string) => `Đã thu thập 1 Hoa Linh Hồn cho ${n}.`,
  BOSS_LOCKED: 'Hãy giao đủ Hoa Linh Hồn để giải trừ bùa chú trước khi khiêu chiến Cự Ma Mê Huyễn.',
  GUARDS_DOWN: 'Hai Cự Ma Chiến Tướng đã bị đánh bại, cả đội hãy thu thập Hoa Vong Hồn giao cho đội trưởng.',
  BAG_FULL: 'Túi đồ đã đầy, không thể nhận thêm vật phẩm.',
} as const;

const NEXT_STEP: Readonly<Record<number, string>> = {
  5240: 'Bước tiếp theo: đánh bại Vong Hồn Lởn Vởn ở tầng 3 (cẩn thận, cả đội sẽ bị nguyền rủa biến thành Nhím Xanh), rồi trở lại gặp Mê Huyễn Thủ Hộ Viên.',
  5241: 'Bước tiếp theo: theo Mê Huyễn Thủ Hộ Viên đến tầng 4, đánh bại hai Cự Ma Chiến Tướng ở (49,42) và (230,179) rồi thu thập 20 Hoa Vong Hồn để giải trừ nguyền rủa.',
  5242: 'Bùa chú đã được giải trừ! Cự Ma Mê Huyễn đã nổi giận ở cuối đường tầng 4, cả đội hãy đánh bại nó.',
  5243: 'Mê Huyễn Động đã yên bình trở lại. Hãy mở Bảo Rương Mê Huyễn để nhận thưởng, rồi rời phụ bản qua Mê Huyễn Thủ Hộ Viên.',
};

@Injectable()
export class MeHuyenHooks implements OnModuleInit {
  private readonly d: DungeonDef = dungeonByKey(MH.KEY)!;

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly fights: DungeonFightService,
    private readonly events: DungeonEvents,
    private readonly curses: MeHuyenCurseService,
    private readonly encounters: EncounterService,
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
  ) {}

  onModuleInit(): void {
    this.encounters.addTuner(tuneMeHuyenMobs);
    this.instances.register('mehuyen', async (s, mapId) => (MH.FLOOR_MAPS.includes(mapId) ? this.spawnsFor(s.characterId!, mapId) : []));
    this.hooks.onClick('mehuyen', (s, npc) => this.click(s, npc.id), 30);
    this.events.onVictory((e) => {
      if (e.d === this.d && MH_BOSSES.some((b) => b.id === e.npcId)) setTimeout(() => void this.afterWin(e.npcId, e.fighters), MH.CURSE_DELAY_MS);
    });
    this.events.onCredit((e) => (e.d === this.d ? this.onCredit(e.questId, e.leader, e.members) : undefined));
    this.events.onClosed((e) => (e.d === this.d ? this.curses.cure(e.characterId, this.d, e.morph) : undefined));
  }

  private async view(characterId: number): Promise<MhView> {
    const run = await this.state.run(characterId, this.d);
    if (!run || run.closed) return { active: false, beaten: [], marks: [], cured: false };
    return { active: true, beaten: run.beaten, marks: run.marks, cured: await this.state.questDone(characterId, run, MH.CURE_QUEST) };
  }

  private npcOf(s: MhSpawn): InstanceNpc | null {
    return this.support.spawnNpc(s.id, s.nid, s.map, s.x, s.y);
  }

  private async spawnsFor(characterId: number, mapId: number): Promise<InstanceNpc[]> {
    const v = await this.view(characterId);
    const list = [...MH_BOSSES.filter((b) => mhBossVisible(v, b.id)), ...MH_FLOWERS.filter((f) => mhFlowerVisible(v, f.id))];
    return list.filter((s) => s.map === mapId).map((s) => this.npcOf(s)).filter((n): n is InstanceNpc => n !== null);
  }

  private async push(characterId: number, ids: readonly number[]): Promise<void> {
    const s = this.support.session(characterId);
    if (!s) return;
    for (const n of await this.spawnsFor(characterId, s.mapId)) if (ids.includes(n.id)) this.instances.npcOn(s, n);
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    const boss = MH_BOSSES.find((b) => b.id === npcId);
    const flower = MH_FLOWERS.find((f) => f.id === npcId);
    if (!boss && !flower) return false;
    const spawn = (boss ?? flower)!;
    if (session.mapId !== spawn.map) return true;
    if (flower) {
      await this.pick(session, flower);
      return true;
    }
    const run = await this.state.run(session.characterId!, this.d);
    if (spawn.id === MH.FINAL_BOSS && !(await this.state.questDone(session.characterId!, run, MH.CURE_QUEST))) {
      npcMsg(session, spawn.nid, TEXT.BOSS_LOCKED);
      return true;
    }
    if (run?.beaten.includes(spawn.id)) this.instances.npcOff(session, spawn.id);
    await this.fights.fight(session, spawn.nid, (enemies) => tuneMeHuyenLineup(spawn.nid, enemies));
    return true;
  }

  private async pick(session: Session, s: MhSpawn): Promise<void> {
    const cid = session.characterId!;
    const v = await this.view(cid);
    if (!v.active) return npcMsg(session, s.nid, DG_TEXT.NO_RUN(this.d));
    if (mhGuarded(v)) return systemSay(session, TEXT.GUARDED);
    if (v.cured || v.marks.includes(s.id)) {
      this.instances.npcOff(session, s.id);
      if (v.cured) systemSay(session, TEXT.CURED);
      return;
    }
    const run = await this.state.run(cid, this.d);
    const leader = run?.leader ?? 0;
    const leaderSession = leader > 0 && leader !== cid ? this.support.session(leader) : undefined;
    const recipient = leaderSession && leaderSession.mapId === s.map ? leaderSession : session;
    const rid = recipient.characterId!;
    const rname = rid === cid ? 'bản thân' : ((await this.support.character(rid))?.name ?? String(rid));
    const held = (await this.inventory.countByTemplate(rid, [MH.FLOWER_ITEM])).get(MH.FLOWER_ITEM) ?? 0;
    if (held >= MH.FLOWER_NEED) return systemSay(session, TEXT.ENOUGH(rname));
    const g = [{ kind: 'item' as const, table: 29, templateId: MH.FLOWER_ITEM, qty: 1, bound: true }];
    if (!(await this.grants.fits(rid, g))) return midNote(session, TEXT.BAG_FULL);
    if (!(await this.state.addMark(cid, this.d, s.id))) {
      this.instances.npcOff(session, s.id);
      return;
    }
    await this.grants.grant(recipient, g);
    await this.support.pushQuest(recipient, MH.CURE_QUEST);
    this.instances.npcOff(session, s.id);
    systemSay(session, TEXT.PICKED(rname));
  }

  /** Go BattleEnd + AfterFunc(4 s): hide the beaten boss, curse after 1619, flowers once both guards are down. */
  private async afterWin(npcId: number, fighters: readonly number[]): Promise<void> {
    for (const cid of fighters) {
      const run = await this.state.run(cid, this.d);
      const s = this.support.session(cid);
      if (s && run?.beaten.includes(npcId)) this.instances.npcOff(s, npcId);
      if (npcId === MH.WRAITH) await this.curses.curse(cid, this.d);
      else if (npcId !== MH.FINAL_BOSS && run && run.beaten.includes(MH.GUARD_A) && run.beaten.includes(MH.GUARD_B)) {
        this.support.say(cid, TEXT.GUARDS_DOWN);
        await this.push(cid, MH_FLOWERS.map((f) => f.id));
      }
    }
  }

  private async onCredit(questId: number, leader: number, members: readonly number[]): Promise<void> {
    const next = NEXT_STEP[questId];
    if (next) for (const id of [...members, leader]) this.support.say(id, next);
    if (questId !== MH.CURE_QUEST) return;
    for (const id of [leader, ...members]) {
      await this.curses.cure(id, this.d);
      const s = this.support.session(id);
      if (s) for (const f of MH_FLOWERS) this.instances.npcOff(s, f.id);
      await this.push(id, [MH.FINAL_BOSS]);
    }
  }
}
