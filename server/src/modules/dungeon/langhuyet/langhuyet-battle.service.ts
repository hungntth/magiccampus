// Lang Huyệt Động fights (Go handlers/npc dungeon_langhuyet_battle.go): line-up fights of the per-viewer nodes (ctx {source
// 'langhuyet', bossNid = instance id}), the Sói Yêu Quái forms (second 683 in the pet-row centre; front form magic-immune,
// back form physical-immune — plan E2.6), the win results (guards / totems marked in the holder's run, totem objective once
// TotemsNeeded(party) are down, real / fake Sói Phù Thủy, real wolf / illusions) and the kill relay to party members not in a
// won fight on 510-514. The Ấn Chương Lang Huyệt medal (30 %) is not granted (H5 has no medals, M10 decision 12).

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BattleResult } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { BattleHooks } from '../../combat/battle-hooks';
import type { Battle, Fighter } from '../../combat/battle.types';
import { NpcBattleService } from '../../combat/npc-battle.service';
import { npcMsg } from '../../npcscript/menu';
import { QuestService } from '../../quest/quest.service';
import { FIGHT_TEXT } from '../dungeon-fight.service';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { LangHuyetContext } from './langhuyet-context.service';
import {
  isLangHuyetMap, LH, LH_NODES, LH_TOTEMS, LhKind, lhId, lhKindOf, lhNodeById, lhRelayTargets, lhWitchNode, totemsNeeded, type LhNode,
} from './langhuyet-layout';

const TEXT = {
  GUARD_DONE: (n: string) => `Đã đánh bại ${n}.`,
  TOTEM: (n: number, need: number) => `Đã phá hủy Totem (${n}/${need}).`,
  SEAL_OPEN: 'Phong ấn đã được giải trừ, xuất hiện 2 Điểm Dịch Chuyển ở (225,57) và (60,233).',
  WITCH_REAL: 'Đã tiêu diệt Sói Phù Thủy thật, cổng về tầng 2 đã mở.',
  WITCH_FAKE: 'Đây chỉ là Sói Phù Thủy giả dạng! Lại xuất hiện thêm nhiều giả dạng.',
  WITCH_LAST: 'Đây chỉ là Sói Phù Thủy giả dạng!',
  WOLF_REAL: 'Đã đánh bại Sói Yêu Quái, Sơn Thần đã được giải cứu.',
  WOLF_FAKE: 'Đây chỉ là ảo ảnh của Sói Yêu Quái.',
} as const;

/** Pet-row centre slot (Go PosEnemyPetCenter) and the pet row (front) slots. */
const PET_CENTRE = 5;
const isFrontSlot = (slot: number): boolean => slot >= 5 && slot <= 9;

/** Go lhPlaceWolfForms + lhApplyWolfImmunity: the non-boss 683 stands in the pet-row centre; front = magic, back = physical. */
export function placeWolfForms(enemies: Fighter[]): void {
  const second = enemies.find((f) => f.refId === LH.WOLF_CREATURE && f.bossFlag !== 1);
  if (second && !enemies.some((f) => f.slot === PET_CENTRE)) second.slot = PET_CENTRE;
  for (const f of enemies) {
    if (f.refId !== LH.WOLF_CREATURE) continue;
    if (isFrontSlot(f.slot)) f.immuneMagic = 1;
    else f.immunePhys = 1;
  }
}

@Injectable()
export class LangHuyetBattleService implements OnModuleInit {
  private readonly logger = new Logger(LangHuyetBattleService.name);

  constructor(
    private readonly ctx: LangHuyetContext,
    private readonly battleHooks: BattleHooks,
    private readonly npcBattle: NpcBattleService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly quests: QuestService,
  ) {}

  onModuleInit(): void {
    this.battleHooks.onEnd(LH.SOURCE, (e) => this.onEnd(e.battle, e.result, e.members.filter((m) => !m.left).map((m) => m.cid)));
    this.battleHooks.onAnyEnd(async (e) => {
      if (e.result !== BattleResult.WIN || e.battle.pvp || !isLangHuyetMap(e.battle.mapId)) return;
      await this.relayKills(e.battle, e.members.filter((m) => !m.left).map((m) => m.cid));
    });
  }

  /** Go startFight: the template's line-up (row levels, else the dungeon level) with the group joining. */
  async start(session: Session, node: LhNode, lineupNid: number, bossNid: number): Promise<void> {
    const battle = await this.npcBattle.startNpcFight(session, lineupNid, {
      level: LH.LEVEL,
      ctx: { source: LH.SOURCE, bossNid, key: LH.KEY },
      tune: lineupNid === LH.WOLF_REAL ? placeWolfForms : undefined,
    });
    if (!battle && (await this.npcBattle.npcLineup(lineupNid, LH.LEVEL)).length === 0) {
      npcMsg(session, node.id, FIGHT_TEXT.NO_LINEUP(this.support.npcName(lineupNid, 'quái')));
    }
  }

  private async onEnd(battle: Battle, result: number, players: number[]): Promise<void> {
    if (result !== BattleResult.WIN || players.length === 0) return;
    const bossNid = battle.ctx?.bossNid ?? 0;
    const k = lhKindOf(bossNid);
    if (!k) return;
    const h = await this.ctx.holderOf(players[0]);
    if (!h.open) return;
    if (k.kind === LhKind.GUARD || k.kind === LhKind.TOTEM) {
      const node = lhNodeById(bossNid);
      if (node) await this.markBeaten(h.holder, h.members, node);
    } else if (k.kind === LhKind.WITCH) await this.witchDown(h.holder, h.members, k.idx);
    else if (k.kind === LhKind.WOLF) await this.wolfDown(h.holder, h.members, k.idx);
  }

  private async markBeaten(holder: number, members: number[], node: LhNode): Promise<void> {
    if (!(await this.state.markStep(holder, this.ctx.d, node.nid))) return;
    this.ctx.pushOff(members, node.map, [node.id]);
    if (node.kind === LhKind.GUARD) return this.ctx.say(members, TEXT.GUARD_DONE(this.support.npcName(node.nid, 'Cận Vệ')));
    const marks = (await this.state.run(holder, this.ctx.d))?.beaten ?? [];
    const down = LH_TOTEMS.filter((t) => marks.includes(t)).length;
    const need = totemsNeeded(members.length);
    this.ctx.say(members, TEXT.TOTEM(Math.min(down, need), need));
    if (down < need) return;
    await this.ctx.credit(members, LH.TOTEM_TARGET, LH.TOTEM_COUNT);
    this.ctx.pushOff(members, LH.F2, LH_NODES.filter((n) => n.kind === LhKind.TOTEM).map((n) => n.id));
    this.ctx.say(members, TEXT.SEAL_OPEN);
  }

  private async witchDown(holder: number, members: number[], slot: number): Promise<void> {
    const p = this.ctx.party(holder);
    if (slot === p.realSlot) {
      const all = [p.realSlot, ...p.fakes];
      p.fakes = [];
      if (!(await this.state.markStep(holder, this.ctx.d, LH.WITCH_REAL))) return;
      await this.ctx.credit(members, LH.WITCH_REAL, 1);
      this.ctx.pushOff(members, LH.EAST, all.map((s) => lhId(LhKind.WITCH, s)));
      return this.ctx.say(members, TEXT.WITCH_REAL);
    }
    const spawned = p.killFake(slot);
    this.ctx.pushOff(members, LH.EAST, [lhId(LhKind.WITCH, slot)]);
    if (spawned.length === 0) return this.ctx.say(members, TEXT.WITCH_LAST);
    this.ctx.pushOn(members, LH.EAST, spawned.map((s) => lhWitchNode(s, false)));
    this.ctx.say(members, TEXT.WITCH_FAKE);
  }

  /** idx 0 = the real wolf; 1 + choice = an illusion (Go bossNid = wolf id + lhIllusionMark + choice). */
  private async wolfDown(holder: number, members: number[], idx: number): Promise<void> {
    if (idx > 0) {
      this.ctx.party(holder).wolfTried.add(idx - 1);
      return this.ctx.say(members, TEXT.WOLF_FAKE);
    }
    if (!(await this.state.markStep(holder, this.ctx.d, LH.WOLF_REAL))) return;
    await this.ctx.credit(members, LH.WOLF_REAL, 1);
    this.ctx.pushOff(members, LH.F4, [lhId(LhKind.WOLF, 0)]);
    this.ctx.say(members, TEXT.WOLF_REAL);
    this.logger.log(`langhuyet: medal 78 roll skipped for ${members.join(',')} (no medals in H5)`);
  }

  /** Go relayKills: the killed creatures count for the online party members that were not in the fight. */
  private async relayKills(battle: Battle, players: number[]): Promise<void> {
    if (players.length === 0) return;
    const kills = [...battle.fighters.values(), ...(battle.fallen ?? [])]
      .filter((f) => f.side === 'enemy' && f.kind === 'creature' && !f.alive && f.refId > 0).map((f) => f.refId);
    if (kills.length === 0) return;
    const h = await this.ctx.holderOf(players[0]);
    for (const m of lhRelayTargets(h.members, players)) {
      const s = this.support.session(m);
      if (!s) continue;
      const credit = await this.quests.onCreatureKilled(m, kills);
      for (const q of credit.quests) s.callback('onAddChaQuest', q);
    }
  }
}
