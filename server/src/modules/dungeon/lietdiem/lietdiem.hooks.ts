// Liệt Diễm Thâm Uyên hooks (Go handlers/npc dungeon_lietdiem_hooks.go / _fight.go + application lietdiem_service.go): per-character
// instance NPCs on maps 517-520 (instance ids 9014000 + kind * 100 + slot, templates 1561 ... 1582), Pha Lê Ma Hóa digging (up to 2
// bound Tinh Lạp Ma Hóa per node while quest 5185 is active; the 10th crystal brings out the 10 Lính Hộ Vệ), the quest-gated fights
// with their reveal chain (12 patrols -> Carl, 9 Cuồng Ma -> Mamun, 6 Phù Thủy -> Abate), the portals of cleared floors (they run
// the floor's dg_next_<npc>) and diary task 24 on the final quest. State lives in the run (`beaten` = dug / beaten instance ids,
// `extra.crystals`). The Ấn Chương medal (67, 30 % on Abate) is not granted (M10 decision 12).

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
import { FIGHT_TEXT } from '../dungeon-fight.service';
import { dungeonByKey, floorCleared, reachable, runOf } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import type { DungeonRun } from '../dungeon.schema';
import {
  LD, LdKind, ldAll, ldCount, ldDigYield, ldGuardsBlocking, ldGuardsOut, ldIsFight, ldMapOf, ldParse, ldTemplate,
  ldViewOn, ldVisible, ldWinInfo, ldInstanceId, LD_SPAWNS, type LdSpawn, type LdSpawnDef, type LdView, type LdWin,
} from './lietdiem-layout';

const TEXT = {
  NEED_QUEST: (q: string) => `Cần nhận nhiệm vụ [${q}] từ Linh Hồn Công Chúa Kamera trước.`,
  ENOUGH: (n: number) => `Ngươi đã có đủ ${n} Tinh Lạp Ma Hóa, hãy giao cho Công Chúa Kamera.`,
  GUARDED: (total: number, down: number) => `Lính Hộ Vệ đang ngăn cản, hãy đánh bại cả ${total} Lính Hộ Vệ (đã hạ ${down}) rồi mới đào tiếp.`,
  DUG: (n: number) => `Đào được ${n} Tinh Lạp Ma Hóa.`,
  GONE: 'Pha Lê Ma Hóa này đã bị đào hết.',
  GUARDS_OUT: 'Lính Hộ Vệ đã phát hiện ra các ngươi! 10 Lính Hộ Vệ đang trấn giữ khắp tầng 1, hãy đánh bại chúng rồi mới đào tiếp.',
  GUARDS_CLEARED: 'Đã đánh bại toàn bộ Lính Hộ Vệ, có thể tiếp tục đào Pha Lê Ma Hóa.',
  HIDDEN: (n: string) => `${n} chưa xuất hiện.`,
  NEEDS: (n: string, minion: string) => `${n} đang được bảo hộ, hãy tiêu diệt hết ${minion} trước.`,
  PROGRESS: (n: string, c: number, t: number) => `Đã đánh bại ${n} (${c}/${t}).`,
  REVEAL: (n: string) => `${n} đã xuất hiện!`,
  MAMUN: 'Đã đánh bại Mamun và lấy được chìa khóa xuống tầng 4. Hãy báo cho Công Chúa Kamera.',
  ABATE: 'Ma Đế Abate đã bị đánh bại! Hãy trở lại gặp Linh Hồn Công Chúa Kamera.',
  WITCHES_CLEARED: 'Toàn bộ Phù Thủy Liệt Diễm đã bị tiêu diệt, Ma Đế Abate đã suy yếu!',
  BAG_FULL: 'Túi đồ đã đầy, không thể nhận thêm vật phẩm.',
} as const;

interface Ctx {
  run: DungeonRun;
  reach: number;
  v: LdView;
}

@Injectable()
export class LietDiemHooks implements OnModuleInit {
  private readonly logger = new Logger(LietDiemHooks.name);
  private readonly d: DungeonDef = dungeonByKey(LD.KEY)!;

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly events: DungeonEvents,
    private readonly battleHooks: BattleHooks,
    private readonly npcBattle: NpcBattleService,
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
    private readonly diary: DiaryEvents,
  ) {}

  onModuleInit(): void {
    this.instances.register('lietdiem', async (s, mapId) => (LD.FLOOR_MAPS.includes(mapId) ? this.spawnsFor(s.characterId!, mapId) : []));
    this.hooks.onClick('lietdiem', (s, npc) => this.click(s, npc.id), 30);
    this.battleHooks.onEnd(LD.KEY, (e) => this.onEnd(e.battle.ctx?.bossNid ?? 0, e.result, e.members.filter((m) => !m.left).map((m) => m.cid)));
    this.events.onCredit((e) => (e.d === this.d ? this.onCredit(e.questId, e.leader, e.members, e.final) : undefined));
  }

  /** Today's open run with the floors reached and the viewer state; null without a run (Go ldRun). */
  private async load(cid: number): Promise<Ctx | null> {
    const { run, done } = await this.state.view(cid, this.d);
    if (!run || run.closed) return null;
    return {
      run, reach: reachable(this.d, run, done),
      v: { beaten: run.beaten, crystals: run.extra?.crystals ?? 0, floorsCleared: this.d.floors.map((f) => floorCleared(f, run, done)) },
    };
  }

  private npcOf(s: LdSpawn): InstanceNpc | null {
    return this.support.spawnNpc(s.id, s.nid, s.map, s.x, s.y);
  }

  private async spawnsFor(cid: number, mapId: number): Promise<InstanceNpc[]> {
    const c = await this.load(cid);
    if (!c || c.reach < LD.FLOOR_MAPS.indexOf(mapId)) return [];
    return ldViewOn(c.v, mapId).map((s) => this.npcOf(s)).filter((n): n is InstanceNpc => n !== null);
  }

  private async push(cid: number, want: (id: number) => boolean): Promise<void> {
    const s = this.support.session(cid);
    if (!s) return;
    for (const n of await this.spawnsFor(cid, s.mapId)) if (want(n.id)) this.instances.npcOn(s, n);
  }

  /** Go runRefusal: no run / floor not reached. */
  private refuse(session: Session, npcId: number, c: Ctx | null, floor: number): boolean {
    if (!c) npcMsg(session, npcId, DG_TEXT.NO_RUN(this.d));
    else if (c.reach < floor) npcMsg(session, npcId, DG_TEXT.LOCKED(this.d));
    else return false;
    return true;
  }

  private async click(session: Session, id: number): Promise<boolean> {
    const at = ldParse(id);
    if (!at) return false;
    const { sp, slot } = at;
    if (session.mapId !== ldMapOf(sp, slot)) return true;
    if (sp.kind === LdKind.NODE) await this.dig(session, id, sp);
    else if (sp.kind === LdKind.PORTAL) await this.hooks.runScript(session, `dg_next_${LD.FLOOR_NPCS[slot]}`);
    else await this.fight(session, id, sp, slot);
    return true;
  }

  private async dig(session: Session, id: number, sp: LdSpawnDef): Promise<void> {
    const cid = session.characterId!;
    if (!(await this.support.questActive(cid, sp.quest))) return npcMsg(session, id, TEXT.NEED_QUEST(this.support.questName(sp.quest)));
    const c = await this.load(cid);
    if (this.refuse(session, id, c, sp.floor)) return;
    const v = c!.v;
    const gone = (): void => {
      this.instances.npcOff(session, id);
      npcMsg(session, id, TEXT.GONE);
    };
    if (v.beaten.includes(id)) return gone();
    if (ldGuardsBlocking(v)) return npcMsg(session, id, TEXT.GUARDED(LD_SPAWNS.get(LdKind.GUARD)!.points.length, ldCount(LdKind.GUARD, v.beaten)));
    const held = (await this.inventory.countByTemplate(cid, [LD.CRYSTAL])).get(LD.CRYSTAL) ?? 0;
    const n = ldDigYield(held);
    if (n <= 0) return npcMsg(session, id, TEXT.ENOUGH(LD.CRYSTAL_NEED));
    const g = [{ kind: 'item' as const, table: 29, templateId: LD.CRYSTAL, qty: n, bound: true }];
    if (!(await this.grants.fits(cid, g))) return midNote(session, TEXT.BAG_FULL);
    const box: { out?: boolean } = {};
    const marked = await this.state.mutate(cid, (st) => {
      const r = runOf(st.runs, LD.KEY, this.state.today());
      if (!r || r.closed || r.beaten.includes(id) || ldGuardsBlocking({ beaten: r.beaten, crystals: r.extra?.crystals ?? 0 })) return false;
      const before = r.extra?.crystals ?? 0;
      r.beaten.push(id);
      r.extra = { ...r.extra, crystals: before + n };
      box.out = !ldGuardsOut(before) && ldGuardsOut(before + n);
      return true;
    });
    if (!marked) return gone(); // lost a race with another click (node dug or guards out)
    if (!(await this.grants.grant(session, g))) this.logger.warn(`character ${cid}: crystal grant of node ${id} incomplete`);
    await this.support.pushQuest(session, sp.quest);
    this.instances.npcOff(session, id);
    systemSay(session, TEXT.DUG(n));
    if (box.out) {
      midNote(session, TEXT.GUARDS_OUT);
      await this.push(cid, (nid) => ldParse(nid)?.sp.kind === LdKind.GUARD);
    }
  }

  private async fight(session: Session, id: number, sp: LdSpawnDef, slot: number): Promise<void> {
    const cid = session.characterId!;
    const nid = ldTemplate(sp, slot);
    const name = this.support.npcName(nid, 'boss');
    if (sp.quest > 0 && !(await this.support.questActive(cid, sp.quest))) return npcMsg(session, id, TEXT.NEED_QUEST(this.support.questName(sp.quest)));
    const c = await this.load(cid);
    if (this.refuse(session, id, c, sp.floor)) return;
    const v = c!.v;
    if (v.beaten.includes(id)) {
      this.instances.npcOff(session, id);
      return npcMsg(session, id, FIGHT_TEXT.BEATEN(name));
    }
    if (!ldVisible(v, sp, slot)) return npcMsg(session, id, TEXT.HIDDEN(name));
    if (sp.needs > 0 && !ldAll(sp.needs, v.beaten)) {
      return npcMsg(session, id, TEXT.NEEDS(name, this.support.npcName(LD_SPAWNS.get(sp.needs)!.npc[0], 'thuộc hạ')));
    }
    const battle = await this.npcBattle.startNpcFight(session, nid, {
      level: this.d.level, ctx: { source: LD.KEY, bossNid: id, floor: sp.floor, key: LD.KEY },
    });
    if (!battle && (await this.npcBattle.npcLineup(nid, this.d.level)).length === 0) npcMsg(session, id, FIGHT_TEXT.NO_LINEUP(name));
  }

  /** Go LietDiemRecordWin: the win is credited to every player-side character whose run has the floor reached. */
  private async onEnd(instanceId: number, result: number, cids: number[]): Promise<void> {
    const at = ldParse(instanceId);
    if (result !== BattleResult.WIN || !at || !ldIsFight(at.sp.kind)) return;
    for (const cid of cids) {
      const win = await this.recordWin(cid, instanceId, at.sp.floor);
      if (win) await this.notify(cid, win);
    }
  }

  private async recordWin(cid: number, instanceId: number, floor: number): Promise<LdWin | null> {
    const c = await this.load(cid);
    if (!c || c.reach < floor || c.run.beaten.includes(instanceId)) return null;
    let beaten: number[] = [];
    const ok = await this.state.mutate(cid, (st) => {
      const r = runOf(st.runs, LD.KEY, this.state.today());
      if (!r || r.closed || r.beaten.includes(instanceId)) return false;
      r.beaten.push(instanceId);
      beaten = [...r.beaten];
      return true;
    });
    return ok ? ldWinInfo(instanceId, beaten) : null;
  }

  /** Go NotifyLietDiemWin (the Abate medal roll is skipped, decision 12). */
  private async notify(cid: number, win: LdWin): Promise<void> {
    if (win.kind === LdKind.ABATE) this.logger.debug(`character ${cid}: Ấn Chương Liệt Diễm (medal ${LD.MEDAL}) not granted, no medals in H5`);
    const s = this.support.session(cid);
    if (!s) return;
    const name = this.support.npcName(LD_SPAWNS.get(win.kind)!.npc[0], 'boss');
    this.instances.npcOff(s, win.instance);
    if (win.kind === LdKind.MAMUN) systemSay(s, TEXT.MAMUN);
    else if (win.kind === LdKind.ABATE) systemSay(s, TEXT.ABATE);
    else if (win.total > 1) systemSay(s, TEXT.PROGRESS(name, win.count, win.total));
    else systemSay(s, FIGHT_TEXT.VICTORY(name));
    if (win.guardsCleared) midNote(s, TEXT.GUARDS_CLEARED);
    if (win.kind === LdKind.WITCH && win.count === win.total) midNote(s, TEXT.WITCHES_CLEARED);
    if (win.revealed.length > 0) {
      midNote(s, TEXT.REVEAL(this.support.npcName(win.revealed[0].nid, 'boss')));
      for (const r of win.revealed) {
        const n = this.npcOf(r);
        if (n) this.instances.npcOn(s, n);
      }
    }
  }

  /** The leader's floor quest turn-in: the portal of that floor appears for the whole party; the final quest is diary task 24. */
  private async onCredit(questId: number, leader: number, members: readonly number[], final: boolean): Promise<void> {
    const floor = this.d.floors.findIndex((f) => f.quest === questId);
    for (const cid of [leader, ...members]) {
      if (floor >= 0 && floor < LD.FLOOR_MAPS.length - 1) await this.push(cid, (nid) => nid === ldInstanceId(LdKind.PORTAL, floor));
      if (final) this.diary.record(cid, LD.DIARY_TASK, 1);
    }
  }
}
