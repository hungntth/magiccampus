// Thám Hiểm Di Tích step floors (Go dungeon_thamhiem_steles.go / _floors.go): floor 1 Bát Quái steles (th_stele_<stele>_<stone>: the
// player sets an element stone; the right one lights the stele for the group, a wrong one resets the five steles and the five Quái
// Nguyên Tố for the group), floor 2 relic objects (a real one gives a random relic and is marked for the group) and floor 6 Briget
// (takes three different relics, one per click, then shows Di Chỉ 7). Steps are marked in each member's run `beaten`.

import { Injectable } from '@nestjs/common';
import type { NpcMenuOption } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { InstanceNpcService } from '../../npcscript/instance-npcs.service';
import { npcMsg, sendList, systemSay } from '../../npcscript/menu';
import { DG_TEXT } from '../dungeon-entry.hooks';
import {
  parseSteleFunc, TH, TH_FLOOR_ONE_RESET, TH_REAL_OBJECTS, TH_STELES, thBrigetRelics, thLitCount, thRevealedBy, thSceneOf,
  thSetIsRight, thSteleOf, type ThStele,
} from './thamhiem-layout';
import { TH_TEXT, ThamHiemSupport } from './thamhiem-support.service';

const TEXT = {
  STELE_DONE: (n: string) => `Bia đá ${n} đã được kích hoạt.`,
  STELE_LIT: (n: string, lit: number, total: number) => `Bia đá ${n} đã sáng lên (${lit}/${total}).`,
  STELE_ALL: 'Năm bia đá Bát Quái đã sáng, Di Chỉ đã xuất hiện. Tầng này đã hoàn thành.',
  WRONG_FLOOR: 'Hãy đến Vùng Đất Cạm Bẫy để kích hoạt bia đá.',
  NO_STONE: 'Bia đá này hình như thiếu mất vài thứ. Hãy đánh bại Quái Nguyên Tố để lấy bảo thạch ngũ hành rồi khảm vào bia đá.',
  ASK: 'Bia đá này hình như thiếu mất vài thứ. Chọn bảo thạch muốn khảm vào (khảm sai sẽ mất bảo thạch và phải làm lại từ đầu):',
  WRONG_SET: 'Khảm sai! Bảo thạch đã vỡ, các bia đá đã tắt và Quái Nguyên Tố xuất hiện trở lại. Hãy làm lại từ đầu.',
  OBJECT_FOUND: (n: string, c: number, t: number) => `Đã tìm thấy ${n} (${c}/${t}).`,
  OBJECT_ALL: 'Đã tìm thấy hết cổ vật thật, Di Chỉ đã mở. Tầng này đã hoàn thành.',
  BRIGET_NEED: (need: number, c: number) => `Ta đang sưu tầm cổ vật. Hãy mang cho ta ${need} cổ vật khác loại (${c}/${need}).`,
  BRIGET_TAKE: (n: string, c: number, t: number) => `Briget nhận ${n} (${c}/${t}).`,
  BRIGET_DONE: 'Briget đã nhận đủ cổ vật, Di Chỉ 7 đã xuất hiện. Tầng này đã hoàn thành.',
  BRIGET_THANKS: 'Cảm ơn ngươi, Di Chỉ 7 đã mở cho ngươi rồi.',
} as const;

export const STELE_PREFIX = 'th_stele_';

@Injectable()
export class ThamHiemSteps {
  constructor(
    private readonly th: ThamHiemSupport,
    private readonly instances: InstanceNpcService,
  ) {}

  // -- floor 1 ---------------------------------------------------------------------------------------------------------

  /** Go lightStele: the menu of the element stones the clicker carries. */
  async steleClick(session: Session, st: ThStele): Promise<void> {
    const name = this.th.npcName(st.npc, 'Bia đá');
    if (!this.th.onMap(session, TH.F1)) return npcMsg(session, st.npc, TEXT.WRONG_FLOOR);
    const cid = session.characterId!;
    const beaten = await this.th.beaten(cid);
    if (!(await this.th.run(cid))) return npcMsg(session, st.npc, DG_TEXT.NO_RUN(this.th.d));
    if (beaten.includes(st.npc)) return npcMsg(session, st.npc, TEXT.STELE_DONE(name));
    const menu: NpcMenuOption[] = [];
    for (const stone of TH_STELES) {
      const held = await this.th.held(cid, stone.stone);
      if (held > 0) menu.push({ label: `Khảm ${await this.th.itemName(stone.stone)} (${held})`, func: `${STELE_PREFIX}${st.npc}_${stone.stone}` });
    }
    if (menu.length === 0) return npcMsg(session, st.npc, TEXT.NO_STONE);
    sendList(session, st.npc, name, TEXT.ASK, menu);
  }

  /** Go setStone: the chosen stone is always spent; right = the next stele of the order with its own stone. */
  async setStone(session: Session, func: string): Promise<void> {
    const p = parseSteleFunc(func);
    if (!p) return;
    const st = thSteleOf(p.stele)!;
    const name = this.th.npcName(st.npc, 'Bia đá');
    if (!this.th.onMap(session, TH.F1)) return npcMsg(session, st.npc, TEXT.WRONG_FLOOR);
    const cid = session.characterId!;
    const run = await this.th.run(cid);
    if (!run) return npcMsg(session, st.npc, DG_TEXT.NO_RUN(this.th.d));
    if (run.beaten.includes(st.npc)) return npcMsg(session, st.npc, TEXT.STELE_DONE(name));
    if ((await this.th.held(cid, p.stone)) <= 0 || !(await this.th.spend(session, p.stone))) return npcMsg(session, st.npc, TEXT.NO_STONE);
    const members = this.th.groupOnMap(session, TH.F1);
    if (!thSetIsRight(run.beaten, st.npc, p.stone)) return this.resetFloorOne(members);
    for (const [i, m] of members.entries()) {
      if (i > 0 && !(await this.th.run(m.characterId!))) continue;
      await this.th.markGroup([m], st.npc);
      await this.announce(m, name, st.npc);
    }
  }

  private async resetFloorOne(members: readonly Session[]): Promise<void> {
    for (const [i, m] of members.entries()) {
      if (i > 0 && !(await this.th.run(m.characterId!))) continue;
      await this.th.forget(m.characterId!);
      systemSay(m, TEXT.WRONG_SET);
      for (const id of TH_FLOOR_ONE_RESET) {
        const n = thSceneOf(id);
        const npc = n && n.kind === 'fight' ? this.th.npcOf(n) : null;
        if (npc) this.instances.npcOn(m, npc);
      }
    }
  }

  private async announce(m: Session, name: string, steleNpc: number): Promise<void> {
    const beaten = await this.th.beaten(m.characterId!);
    const lit = thLitCount(beaten);
    systemSay(m, TEXT.STELE_LIT(name, lit, TH_STELES.length));
    if (lit < TH_STELES.length) return;
    systemSay(m, TEXT.STELE_ALL);
    this.reveal(m, steleNpc, beaten);
    this.th.skipPoints(m.characterId!, TH.FLOOR_POINTS);
  }

  /** onNpcOn for what `npc` reveals in this viewer's run. */
  reveal(m: Session, npc: number, beaten: readonly number[]): void {
    for (const r of thRevealedBy(npc, beaten)) {
      const n = this.th.npcOf(r);
      if (n) this.instances.npcOn(m, n);
    }
  }

  // -- floor 2 ---------------------------------------------------------------------------------------------------------

  /** Go openObject: a real "Cổ" object gives the clicker a random relic (a full bag keeps it) and is marked for the group. */
  async openObject(session: Session, npcId: number): Promise<void> {
    if (!this.th.onMap(session, TH.OBJECT_MAP)) return;
    const cid = session.characterId!;
    const run = await this.th.run(cid);
    if (!run) return npcMsg(session, npcId, TH_TEXT.NO_RUN);
    if ((await this.th.reach(cid)) < 1) return;
    if (run.beaten.includes(npcId)) return this.instances.npcOff(session, npcId);
    const relic = TH.RELIC_FIRST + Math.floor(Math.random() * (TH.RELIC_LAST - TH.RELIC_FIRST + 1));
    if (!(await this.th.give(session, relic))) return;
    const name = this.th.npcName(npcId, 'Cổ vật');
    for (const m of await this.th.markGroup(this.th.groupOnMap(session, TH.OBJECT_MAP), npcId)) {
      this.instances.npcOff(m, npcId);
      const beaten = await this.th.beaten(m.characterId!);
      const found = TH_REAL_OBJECTS.filter((o) => beaten.includes(o)).length;
      systemSay(m, TEXT.OBJECT_FOUND(name, found, TH_REAL_OBJECTS.length));
      if (found === TH_REAL_OBJECTS.length) {
        systemSay(m, TEXT.OBJECT_ALL);
        this.th.skipPoints(m.characterId!, TH.FLOOR_POINTS);
      }
    }
  }

  // -- floor 6 ---------------------------------------------------------------------------------------------------------

  /** Go brigetClick: takes one relic per click that the group has not given her yet; the third marks 2500 and shows Di Chỉ 7. */
  async brigetClick(session: Session): Promise<void> {
    const npc = TH.BRIGET;
    if (!this.th.onMap(session, TH.BRIGET_MAP)) return;
    const cid = session.characterId!;
    const run = await this.th.run(cid);
    if (!run) return npcMsg(session, npc, TH_TEXT.NO_RUN);
    if (run.beaten.includes(npc)) return npcMsg(session, npc, TEXT.BRIGET_THANKS);
    if ((await this.th.reach(cid)) < 5) return;
    const given = thBrigetRelics(run.beaten);
    const relic = (await this.th.heldRelics(cid)).find((id) => !given.includes(id)) ?? 0;
    if (relic === 0 || !(await this.th.spend(session, relic))) return npcMsg(session, npc, TEXT.BRIGET_NEED(TH.BRIGET_NEED, given.length));
    const members = this.th.groupOnMap(session, TH.BRIGET_MAP);
    await this.th.markGroup(members, TH.BRIGET_MARK + relic);
    const count = given.length + 1;
    systemSay(session, TEXT.BRIGET_TAKE(await this.th.itemName(relic), count, TH.BRIGET_NEED));
    if (count < TH.BRIGET_NEED) return;
    for (const m of await this.th.markGroup(members, npc)) {
      systemSay(m, TEXT.BRIGET_DONE);
      this.reveal(m, npc, await this.th.beaten(m.characterId!));
      this.th.skipPoints(m.characterId!, TH.FLOOR_POINTS);
    }
  }
}
