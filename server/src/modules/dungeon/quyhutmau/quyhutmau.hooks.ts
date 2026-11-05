// Quỷ Hút Máu hooks (Go handlers/npc dungeon_quyhutmau_hooks.go / _seals.go): per-viewer mosquito spawns on map 69, fights gated
// by their step quest ("Hãy nhận nhiệm vụ [..] ở Thợ Săn Muỗi trước."), the seals (guard beaten + quest active: the seal item to
// the clicker and its online group members on the map that hold the quest, marked in their run), the Cổng Lạc Viên back to the
// landing point, and the reveal pushes after a win (onNpcOff for the beaten NPC, onNpcOn for what it reveals). The Ấn Chương
// Lạc Viên chest medal is not granted (H5 has no medals, M10 decision 12).

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DungeonDef, InstanceNpc } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { InventoryService } from '../../inventory/inventory.service';
import { InstanceNpcService } from '../../npcscript/instance-npcs.service';
import { midNote, npcMsg, systemSay } from '../../npcscript/menu';
import { NpcHookRegistry } from '../../npcscript/npc-hooks.registry';
import { PartyManager } from '../../party/party.manager';
import { GrantService } from '../../rewards/grant.service';
import { DG_TEXT } from '../dungeon-entry.hooks';
import { DungeonEvents } from '../dungeon-events';
import { DungeonFightService, FIGHT_TEXT } from '../dungeon-fight.service';
import { dungeonByKey } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { QHM, qhmRevealedBy, qhmStep, qhmVisible, type QhmStep } from './quyhutmau-layout';

const TEXT = {
  NEED_QUEST: (q: string) => `Hãy nhận nhiệm vụ [${q}] ở Thợ Săn Muỗi trước.`,
  NEED_GUARD: (n: string) => `Hãy đánh bại ${n} trước khi hóa giải phong ấn.`,
  SEAL_OPENED: 'Phong ấn đã được hóa giải.',
  SEAL_DONE: 'Phong ấn này đã được hóa giải trong lượt phụ bản hôm nay.',
  BAG_FULL: 'Túi đồ đã đầy, không thể nhận thêm vật phẩm.',
} as const;

@Injectable()
export class QuyHutMauHooks implements OnModuleInit {
  private readonly d: DungeonDef = dungeonByKey(QHM.KEY)!;

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly fights: DungeonFightService,
    private readonly events: DungeonEvents,
    private readonly parties: PartyManager,
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
  ) {}

  onModuleInit(): void {
    this.instances.register('quyhutmau', async (s, mapId) => {
      if (mapId !== QHM.MAP) return [];
      const run = await this.state.run(s.characterId!, this.d);
      return run ? qhmVisible(run.beaten).map((st) => this.npcOf(st)).filter((n): n is InstanceNpc => n !== null) : [];
    });
    this.hooks.onClick('quyhutmau', (s, npc) => this.click(s, npc.id), 30);
    this.events.onVictory(async (e) => {
      if (e.d !== this.d || !qhmStep(e.npcId)) return;
      for (const cid of e.credited) {
        const s = this.support.session(cid);
        if (!s || s.mapId !== QHM.MAP) continue;
        this.instances.npcOff(s, e.npcId);
        for (const st of qhmRevealedBy(e.npcId)) {
          const n = this.npcOf(st);
          if (n) this.instances.npcOn(s, n);
        }
      }
    });
  }

  private npcOf(st: QhmStep): InstanceNpc | null {
    return this.support.spawnNpc(st.npc, st.npc, QHM.MAP, st.x, st.y);
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    const st = qhmStep(npcId);
    if (!st) return false;
    if (session.mapId !== QHM.MAP) return true;
    const cid = session.characterId!;
    const run = await this.state.run(cid, this.d);
    if (!run) {
      npcMsg(session, npcId, DG_TEXT.NO_RUN(this.d));
      return true;
    }
    if (st.appear > 0 && !run.beaten.includes(st.appear)) return true;
    if (st.kind === 'portal') {
      await this.support.teleport(session, QHM.MAP, QHM.LAND_X, QHM.LAND_Y, false);
      return true;
    }
    if (st.kind === 'seal') {
      await this.openSeal(session, st, run.beaten);
      return true;
    }
    if (run.beaten.includes(npcId)) npcMsg(session, npcId, FIGHT_TEXT.BEATEN(this.support.npcName(npcId, 'boss')));
    else if (!(await this.support.questActive(cid, st.quest))) npcMsg(session, npcId, TEXT.NEED_QUEST(this.support.questName(st.quest)));
    else await this.fights.fight(session, npcId);
    return true;
  }

  private async openSeal(session: Session, st: QhmStep, beaten: readonly number[]): Promise<void> {
    const cid = session.characterId!;
    if (beaten.includes(st.npc)) {
      this.instances.npcOff(session, st.npc);
      return npcMsg(session, st.npc, TEXT.SEAL_DONE);
    }
    if (!(await this.support.questActive(cid, st.quest))) return npcMsg(session, st.npc, TEXT.NEED_QUEST(this.support.questName(st.quest)));
    if (st.needs > 0 && !beaten.includes(st.needs)) return npcMsg(session, st.npc, TEXT.NEED_GUARD(this.support.npcName(st.needs, 'boss')));
    const party = this.parties.partyOf(cid);
    const others = (party?.members ?? []).filter((m) => m !== cid && !party!.afk.has(m)).map((m) => this.support.session(m))
      .filter((s): s is Session => s !== undefined && s.mapId === QHM.MAP);
    for (const s of [session, ...others]) {
      const id = s.characterId!;
      if (s !== session && (!(await this.support.questActive(id, st.quest)) || !(await this.state.run(id, this.d)))) continue;
      if (!(await this.grantSealItem(s, st.item))) {
        midNote(s, TEXT.BAG_FULL);
        continue;
      }
      await this.support.pushQuest(s, st.quest);
      if (!(await this.state.markStep(id, this.d, st.npc))) continue;
      this.instances.npcOff(s, st.npc);
      systemSay(s, TEXT.SEAL_OPENED);
    }
  }

  /** The seal item (bound), unless already carried. False on a full bag. */
  private async grantSealItem(session: Session, templateId: number): Promise<boolean> {
    const cid = session.characterId!;
    if (((await this.inventory.countByTemplate(cid, [templateId])).get(templateId) ?? 0) > 0) return true;
    const g = [{ kind: 'item' as const, table: 29, templateId, qty: 1, bound: true }];
    if (!(await this.grants.fits(cid, g))) return false;
    return this.grants.grant(session, g);
  }
}
