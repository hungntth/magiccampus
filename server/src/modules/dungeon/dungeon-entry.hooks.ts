// Phụ bản entrances (Go handlers/npc dungeon_mehuyen_entry.go + dungeon_portals.go enterDungeon): the entrance NPC menu
// ("Vào <tên> - <độ khó>" = dg_mh_<npc>_<level> without today's run; "Vào / Đến Tầng N" = dg_enter_<npc>_<floor>_<map> with it),
// the ruled opening (leader, group size, per-member level / ticket / run / lock checks, every member spends a ticket, start
// notice, the leader lands on floor 1 and its followers come along) and re-entry to reached floors.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { dungeonFloorLabel, formatWait, type DungeonDef, type NpcMenuOption } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { npcMsg, sendList, systemSay } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { PartyManager } from '../party/party.manager';
import { QuestService } from '../quest/quest.service';
import { difficultyOf, dungeonByEntrance, floorMap, lockedUntil, runOf } from './dungeon-rules';
import { DungeonStateService } from './dungeon-state.service';
import { DungeonSupport } from './dungeon-support.service';

export const DG_TEXT = {
  ENTRANCE_INTRO: (d: DungeonDef) => `Ngươi muốn vào ${d.name}? Mỗi ngày cần dùng 1 ${d.ticketName} (nhận từ Sứ Giả Mở Phụ Bản ở Tiên Lạp Thành) để mở phụ bản.`,
  LEVEL: (lv: number, name: string) => `Cần đạt cấp ${lv} mới có thể vào ${name}.`,
  NO_RUN: (d: DungeonDef) => `Hôm nay ngươi chưa mở ${d.name}, hãy vào từ lối vào của phụ bản.`,
  LOCKED: (d: DungeonDef) => `Ngươi chưa vượt qua các tầng trước của ${d.name}.`,
  TOP: (d: DungeonDef) => `Đây đã là tầng cuối cùng của ${d.name}.`,
  WRONG_FLOOR: 'Ngươi không ở tầng này của phụ bản.',
  PENDING: (p: string) => `Hãy hoàn thành tầng này trước: ${p}.`,
  INTRO: (d: DungeonDef) => `${d.name}: nhóm ít nhất ${d.rules.minGroup} người cấp ${d.level} trở lên, mỗi người mang 1 ${d.ticketName}. Thời gian thám hiểm ${d.rules.durationMin} phút. Chọn độ khó, độ khó càng cao phần thưởng càng lớn.`,
  SOLO_INTRO: (d: DungeonDef) => `${d.name}: cấp ${d.level} trở lên, có thể đi một mình hoặc lập nhóm, mỗi người mang 1 ${d.ticketName}. Thời gian thám hiểm ${d.rules.durationMin} phút. Đội trưởng sẽ nhận và trả nhiệm vụ.`,
  CLOSED: (d: DungeonDef) => `Hôm nay ngươi đã rời ${d.name}, không thể vào lại cho đến lần nhận ${d.ticketName} kế tiếp.`,
  AUTO: (d: DungeonDef) => `Hôm nay ngươi đã tự động hoàn thành ${d.name}, không thể vào nữa.`,
  COOLDOWN: (d: DungeonDef, wait: string) => `Hôm nay bạn đã hoàn thành ${d.name}, mỗi ngày chỉ được hoàn thành một lần. Hãy quay lại sau 0:00 (còn ${wait}).`,
  GROUP: (d: DungeonDef) => `Cần lập nhóm ít nhất ${d.rules.minGroup} người (cấp ${d.level} trở lên, mang theo ${d.ticketName}) mới có thể vào ${d.name}.`,
  NOT_LEADER: (d: DungeonDef) => `Chỉ đội trưởng mới có thể mở ${d.name}.`,
  MEMBERS: (d: DungeonDef, list: string) => `Chưa thể vào ${d.name}: ${list}.`,
  START: (d: DungeonDef, diff: string, leader: string) => `Bắt đầu thám hiểm ${d.name} (độ khó ${diff}), thời gian ${d.rules.durationMin} phút. Đội trưởng ${leader} sẽ nhận và trả nhiệm vụ, các thành viên hãy theo nhắc nhở của hệ thống.`,
  M_LEVEL: (n: string, lv: number) => `${n} chưa đạt cấp ${lv}`,
  M_TICKET: (n: string, t: string) => `${n} chưa mang ${t}`,
  M_DONE: (n: string) => `${n} đã thám hiểm hôm nay`,
  M_COOLING: (n: string) => `${n} đã hoàn thành hôm nay`,
} as const;

export const QUEST_ENTRY_LABEL = 'Nhiệm vụ';
export const questEntryFunc = (npcId: number): string => `open_npc_interaction_${npcId}`;
const RULED = /^dg_mh_(\d+)_(\d+)$/;
const ENTER = /^dg_enter_(\d+)_(\d+)_(\d+)$/;

@Injectable()
export class DungeonEntryHooks implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly parties: PartyManager,
    private readonly quests: QuestService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('dungeon-entrance', (s, npc) => this.click(s, npc.id), 50);
    this.hooks.onScript('dungeon-entrance', (s, func) => this.script(s, func), 50);
  }

  /** "Nhiệm vụ" entry when the NPC has quests for the character (Go npcHasQuest). */
  async questEntry(characterId: number, npcId: number): Promise<NpcMenuOption[]> {
    const q = await this.quests.listForNpc(characterId, npcId);
    return Object.keys(q.list).length > 0 ? [{ label: QUEST_ENTRY_LABEL, func: questEntryFunc(npcId) }] : [];
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    const d = dungeonByEntrance(npcId);
    if (!d) return false;
    const cid = session.characterId!;
    const run = await this.state.run(cid, d);
    const title = this.support.npcName(npcId, d.name);
    if (run?.closed === 'auto') npcMsg(session, npcId, DG_TEXT.AUTO(d));
    else if (run?.closed) npcMsg(session, npcId, DG_TEXT.CLOSED(d));
    else if (run) {
      const top = Math.max(await this.state.reachable(cid, d), 0);
      const options = await this.questEntry(cid, npcId);
      for (let f = 0; f <= top && f < d.floors.length; f++) {
        d.floors[f].maps.forEach((_, i) => options.push({ label: enterLabel(d, f, i), func: `dg_enter_${npcId}_${f}_${i}` }));
      }
      sendList(session, npcId, title, DG_TEXT.ENTRANCE_INTRO(d), options);
    } else {
      const options = await this.questEntry(cid, npcId);
      for (const diff of d.rules.difficulties) options.push({ label: `Vào ${d.name} - ${diff.name}`, func: `dg_mh_${npcId}_${diff.level}` });
      sendList(session, npcId, title, d.rules.minGroup <= 1 ? DG_TEXT.SOLO_INTRO(d) : DG_TEXT.INTRO(d), options);
    }
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    let m = RULED.exec(func);
    if (m) {
      const d = dungeonByEntrance(Number(m[1]));
      if (d && d.rules.difficulties.some((x) => x.level === Number(m![2]))) await this.openRuled(session, Number(m[1]), d, Number(m[2]));
      return true;
    }
    m = ENTER.exec(func);
    if (m) {
      const d = dungeonByEntrance(Number(m[1]));
      if (d) await this.enter(session, Number(m[1]), d, Number(m[2]), Number(m[3]));
      return true;
    }
    return false;
  }

  /** Go enterDungeon for ruled dungeons: re-entry with an open run to a reached floor. */
  private async enter(session: Session, npcId: number, d: DungeonDef, floor: number, mapIdx: number): Promise<void> {
    const f = d.floors[floor];
    if (!f || mapIdx < 0 || mapIdx >= f.maps.length) return;
    const cid = session.characterId!;
    const me = await this.support.character(cid);
    if (!me || me.level < d.level) return npcMsg(session, npcId, DG_TEXT.LEVEL(d.level, d.name));
    const run = await this.state.run(cid, d);
    if (!run) return npcMsg(session, npcId, DG_TEXT.NO_RUN(d));
    if (run.closed) return npcMsg(session, npcId, run.closed === 'auto' ? DG_TEXT.AUTO(d) : DG_TEXT.CLOSED(d));
    if (floor > (await this.state.reachable(cid, d))) return npcMsg(session, npcId, DG_TEXT.LOCKED(d));
    await this.toFloor(session, d, f.maps[mapIdx]);
  }

  /** Floor 1 lands at the dungeon's landing point when it has one (Go teleportToRuledFloor). */
  private async toFloor(session: Session, d: DungeonDef, mapId: number): Promise<void> {
    const land = mapId === floorMap(d, 0) && d.rules.landX && d.rules.landY;
    await this.support.teleport(session, mapId, land ? d.rules.landX : undefined, land ? d.rules.landY : undefined);
  }

  private async problem(d: DungeonDef, cid: number, name?: string): Promise<string> {
    const ch = await this.support.character(cid);
    const n = name ?? ch?.name ?? String(cid);
    if (!ch || ch.level < d.level) return DG_TEXT.M_LEVEL(n, d.level);
    const st = await this.state.load(cid);
    if (runOf(st.runs, d.key, this.state.today())) return DG_TEXT.M_DONE(n);
    if (lockedUntil(st.done[d.key], this.state.now()) > 0) return DG_TEXT.M_COOLING(n);
    if ((await this.support.tickets(cid, d)) <= 0) return DG_TEXT.M_TICKET(n, d.ticketName);
    return '';
  }

  private async openRuled(session: Session, npcId: number, d: DungeonDef, level: number): Promise<void> {
    const cid = session.characterId!;
    const st = await this.state.load(cid);
    if (runOf(st.runs, d.key, this.state.today())) return this.enter(session, npcId, d, 0, 0);
    const lock = lockedUntil(st.done[d.key], this.state.now());
    if (lock > 0) return npcMsg(session, npcId, DG_TEXT.COOLDOWN(d, formatWait(lock - this.state.now())));
    const party = this.parties.partyOf(cid);
    if (party && party.leaderId !== cid) return npcMsg(session, npcId, DG_TEXT.NOT_LEADER(d));
    const members = (party?.members ?? []).filter((m) => m !== cid && !party!.afk.has(m) && this.support.session(m) !== undefined);
    if (1 + members.length < d.rules.minGroup) return npcMsg(session, npcId, DG_TEXT.GROUP(d));
    const problems: string[] = [];
    for (const id of [cid, ...members]) {
      const p = await this.problem(d, id);
      if (p) problems.push(p);
    }
    if (problems.length > 0) return npcMsg(session, npcId, DG_TEXT.MEMBERS(d, problems.join('; ')));
    if (!(await this.support.spendTicket(cid, d))) return npcMsg(session, npcId, DG_TEXT.M_TICKET(String((await this.support.character(cid))?.name), d.ticketName));
    const entered: number[] = [];
    for (const m of members) if (await this.support.spendTicket(m, d)) entered.push(m);
    await this.state.openRuledRun(d, cid, entered, level);
    const start = DG_TEXT.START(d, difficultyOf(d.rules, level).name, (await this.support.character(cid))?.name ?? '');
    systemSay(session, start);
    for (const m of entered) this.support.say(m, start);
    await this.toFloor(session, d, floorMap(d, 0));
  }
}

export function enterLabel(d: DungeonDef, floor: number, mapIdx: number): string {
  let label = floor > 0 ? `Đến ${dungeonFloorLabel(d, floor)}` : `Vào ${d.name}`;
  const f = d.floors[floor];
  if (f.maps.length > 1 && f.mapNames?.[mapIdx]) label += ` (${f.mapNames[mapIdx]})`;
  return label;
}
