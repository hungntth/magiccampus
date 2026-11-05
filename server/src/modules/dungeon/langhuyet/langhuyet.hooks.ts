// Lang Huyệt Động hooks (Go handlers/npc dungeon_langhuyet_hooks.go / _steps.go / _events.go): per-viewer floor NPCs on 510-514,
// clicks on them (step quest must be active for the holder: "Đội trưởng cần nhận nhiệm vụ [..] trước."), the Tiểu Tinh Linh 952
// menu (quest, floor 3 west / east = lh_go_512 / lh_go_513, floor 4 = lh_go_514, exit), gates (gate rule, the group follows),
// planting (holder only, each spot once, +1 on 3987), mushrooms (any member digs, Nấm Dại 2015 to the holder), the Sói Yêu Quái
// menu (lh_wolf_<k>: 5 identical choices, one real) and the step pushes when the holder finishes a Lang Huyệt quest.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { dungeonFloorLabel, type InstanceNpc } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import type { QuestTemplate } from '../../gamedata/quest-data';
import { InstanceNpcService } from '../../npcscript/instance-npcs.service';
import { midNote, npcMsg, sendList, systemSay } from '../../npcscript/menu';
import { NpcHookRegistry } from '../../npcscript/npc-hooks.registry';
import { QuestGates } from '../../quest/quest-gates';
import { GrantService } from '../../rewards/grant.service';
import { InventoryService } from '../../inventory/inventory.service';
import { DG_TEXT, DungeonEntryHooks, enterLabel } from '../dungeon-entry.hooks';
import { floorMap, gateVerdict } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { LangHuyetBattleService } from './langhuyet-battle.service';
import { LangHuyetContext, type LhHolder } from './langhuyet-context.service';
import { isLangHuyetMap, LH, LH_NODES, LhKind, lhId, lhKindOf, lhOpenedBy, lhVisible, type LhNode } from './langhuyet-layout';

const GO = /^lh_go_(\d+)$/;
const WOLF = /^lh_wolf_(\d+)$/;
const TEXT = {
  NEED_QUEST: (q: string) => `Đội trưởng cần nhận nhiệm vụ [${q}] trước.`,
  HOLDER_ONLY: 'Chỉ đội trưởng mang theo bao hạt mầm mới có thể gieo hạt.',
  PLANTED: (n: number, need: number) => `Đã gieo hạt giống (${n}/${need}).`,
  MUSHROOM: (n: number, need: number) => `Đã đào được Nấm Dại, đã gửi cho đội trưởng (${n}/${need}).`,
  MUSHROOM_FULL: 'Đội trưởng đã có đủ Nấm Dại.',
  BAG_FULL: 'Túi đồ đã đầy, không thể nhận thêm vật phẩm.',
  WOLF_INTRO: 'Xuất hiện rất nhiều ảo ảnh Sói Yêu Quái, hãy chọn ra con thật.',
  SPIRIT_INTRO: 'Phong ấn đã giải trừ thì có thể chia hai đường vào tầng 3, xong việc hãy tập hợp ở đây để vào tầng 4.',
  EXIT: 'Rời khỏi phụ bản',
} as const;

@Injectable()
export class LangHuyetHooks implements OnModuleInit {
  constructor(
    private readonly ctx: LangHuyetContext,
    private readonly battles: LangHuyetBattleService,
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly gates: QuestGates,
    private readonly entry: DungeonEntryHooks,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
  ) {}

  onModuleInit(): void {
    this.instances.register(LH.KEY, async (s, mapId) => {
      if (!isLangHuyetMap(mapId)) return [];
      const v = await this.ctx.visibleFor(s.characterId!, mapId);
      return (v?.nodes ?? []).map((n) => this.ctx.npcOf(n)).filter((n): n is InstanceNpc => n !== null);
    });
    this.hooks.onClick(LH.KEY, (s, npc) => this.click(s, npc.id), 30);
    this.hooks.onScript(LH.KEY, (s, func) => this.script(s, func), 30);
    this.gates.onFinished(LH.KEY, (s, tpl) => this.onFinished(s, tpl));
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    if (npcId === LH.SPIRIT) {
      await this.spiritMenu(session);
      return true;
    }
    if (!lhKindOf(npcId)) return false;
    const v = await this.ctx.visibleFor(session.characterId!, session.mapId);
    if (!v) return true;
    const node = v.nodes.find((n) => n.id === npcId);
    if (!node) {
      this.instances.npcOff(session, npcId);
      return true;
    }
    if (node.quest > 0 && !v.st.active.has(node.quest)) {
      systemSay(session, TEXT.NEED_QUEST(this.support.questName(node.quest)));
      return true;
    }
    if (node.kind === LhKind.PORTAL) await this.move(session, node.id, node.to ?? 0);
    else if (node.kind === LhKind.SPOT) await this.plant(session, v.h, node);
    else if (node.kind === LhKind.MUSHROOM) await this.dig(session, v.h, node);
    else if (node.kind === LhKind.WOLF) this.wolfMenu(session, v.h, node);
    else await this.battles.start(session, node, node.nid, node.id);
    return true;
  }

  private async spiritMenu(session: Session): Promise<void> {
    const d = this.ctx.d;
    const cid = session.characterId!;
    const reach = await this.state.reachable(cid, d);
    const options = await this.entry.questEntry(cid, LH.SPIRIT);
    if (reach >= 2) d.floors[2].maps.forEach((m, i) => options.push({ label: enterLabel(d, 2, i), func: `lh_go_${m}` }));
    if (reach >= 3) options.push({ label: `Đến ${dungeonFloorLabel(d, 3)}`, func: `lh_go_${floorMap(d, 3)}` });
    options.push({ label: TEXT.EXIT, func: `dg_exit_${LH.SPIRIT}` });
    sendList(session, LH.SPIRIT, this.support.npcName(LH.SPIRIT, 'Tiểu Tinh Linh'), TEXT.SPIRIT_INTRO, options);
  }

  private async script(session: Session, func: string): Promise<boolean> {
    let m = GO.exec(func);
    if (m) {
      const to = Number(m[1]);
      if (to !== LH.WEST && to !== LH.EAST && to !== LH.F4) return true;
      if (session.mapId !== LH.F2) npcMsg(session, LH.SPIRIT, DG_TEXT.WRONG_FLOOR);
      else await this.move(session, LH.SPIRIT, to);
      return true;
    }
    m = WOLF.exec(func);
    if (!m) return false;
    await this.chooseWolf(session, Number(m[1]));
    return true;
  }

  /** Go move: the shared gate rule, then the clicker and its followers on the map (teleportToMap). */
  private async move(session: Session, npcId: number, to: number): Promise<void> {
    const v = await this.state.view(session.characterId!, this.ctx.d);
    const verdict = gateVerdict(session.mapId, to, () => v);
    if (verdict === 'norun') return npcMsg(session, npcId, DG_TEXT.NO_RUN(this.ctx.d));
    if (verdict === 'locked') return npcMsg(session, npcId, DG_TEXT.LOCKED(this.ctx.d));
    await this.support.teleport(session, to);
  }

  private async plant(session: Session, h: LhHolder, node: LhNode): Promise<void> {
    if (session.characterId !== h.holder) return systemSay(session, TEXT.HOLDER_ONLY);
    if (!(await this.state.markStep(h.holder, this.ctx.d, node.id))) return;
    await this.ctx.credit([h.holder], LH.PLANT_TARGET, 1);
    const marks = (await this.state.run(h.holder, this.ctx.d))?.beaten ?? [];
    const planted = LH_NODES.filter((n) => n.kind === LhKind.SPOT && marks.includes(n.id)).length;
    this.ctx.pushOff(h.members, node.map, [node.id]);
    systemSay(session, TEXT.PLANTED(planted, LH.PLANT_NEED));
  }

  private async dig(session: Session, h: LhHolder, node: LhNode): Promise<void> {
    const item = LH.MUSHROOM_ITEM;
    const held = (await this.inventory.countByTemplate(h.holder, [item])).get(item) ?? 0;
    if (held >= LH.MUSHROOM_NEED) return systemSay(session, TEXT.MUSHROOM_FULL);
    const holder = this.support.session(h.holder);
    const g = [{ kind: 'item' as const, table: 29, templateId: item, qty: 1, bound: true }];
    if (!holder || !(await this.grants.fits(h.holder, g))) return midNote(session, TEXT.BAG_FULL);
    const p = this.ctx.party(h.holder);
    p.mushroom.set(node.idx, (p.mushroom.get(node.idx) ?? 0) + 1);
    if (!(await this.grants.grant(holder, g))) return;
    await this.support.pushQuest(holder, LH.Q_MUSHROOM);
    if (p.mushroomLeft(node.idx) <= 0) this.ctx.pushOff(h.members, node.map, [node.id]);
    systemSay(session, TEXT.MUSHROOM(held + 1, LH.MUSHROOM_NEED));
  }

  private wolfMenu(session: Session, h: LhHolder, node: LhNode): void {
    const name = this.support.npcName(node.nid, 'Sói Yêu Quái');
    const options = this.ctx.party(h.holder).wolfChoices().map((k) => ({ label: name, func: `lh_wolf_${k}` }));
    sendList(session, node.id, name, TEXT.WOLF_INTRO, options);
  }

  private async chooseWolf(session: Session, choice: number): Promise<void> {
    const v = await this.ctx.visibleFor(session.characterId!, session.mapId);
    if (!v || !v.st.active.has(LH.Q_BOSS) || !Number.isInteger(choice) || choice < 0 || choice >= LH.WOLF_CHOICES) return;
    const wolf = v.nodes.find((n) => n.kind === LhKind.WOLF);
    const p = this.ctx.party(v.h.holder);
    if (!wolf || p.wolfTried.has(choice)) return;
    if (choice === p.wolfReal) await this.battles.start(session, wolf, LH.WOLF_REAL, wolf.id);
    else await this.battles.start(session, wolf, LH.WOLF_ILLUSION, wolf.id + 1 + choice);
  }

  /** Go OnQuestFinished: the finished step's NPCs leave the members' scenes; the next step and the gates it opens appear. */
  private async onFinished(session: Session, tpl: QuestTemplate): Promise<void> {
    const q = tpl.id;
    if (q < LH.Q_GUARDS || q > LH.Q_BOSS) return;
    const h = await this.ctx.holderOf(session.characterId!);
    if (!h.open || h.holder !== session.characterId) return;
    const st = await this.ctx.status(h);
    for (const m of h.members) {
      const s = this.support.session(m);
      if (!s || !isLangHuyetMap(s.mapId)) continue;
      for (const n of LH_NODES) if (n.map === s.mapId && n.quest === q) this.instances.npcOff(s, n.id);
      if (q === LH.Q_SPLIT && s.mapId === LH.EAST) for (let i = 0; i < 31; i++) this.instances.npcOff(s, lhId(LhKind.WITCH, i));
      const next = lhVisible(s.mapId, st, this.ctx.party(h.holder)).filter((n) => n.quest === q + 1 || lhOpenedBy(n) === q);
      this.ctx.pushOn([m], s.mapId, next);
    }
  }
}
