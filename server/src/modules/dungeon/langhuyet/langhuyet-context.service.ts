// Lang Huyệt Động shared context (Go LangHuyetHooks holder / members / status / pushes): the quest holder is the run leader (Go
// RunRules leader; the viewer when it has no run), the party is the leader's run party; the holder status (active / done-today
// quests 3986-3992, run marks), the in-memory party store per holder and day, per-viewer NPC payloads, onNpcOn / onNpcOff /
// onSystemSay to the party members on a map, and kind-6 objective credit (onAddChaQuest for every changed quest).

import { Injectable } from '@nestjs/common';
import type { DungeonDef, InstanceNpc } from '@mc/shared';
import { InstanceNpcService } from '../../npcscript/instance-npcs.service';
import { systemSay } from '../../npcscript/menu';
import { QuestCreditService } from '../../quest/quest-credit.service';
import { QuestService } from '../../quest/quest.service';
import { dungeonByKey } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { LH, LhParty, lhIsFight, lhVisible, type LhNode, type LhStatus } from './langhuyet-layout';

export interface LhHolder {
  holder: number;
  members: number[]; // holder first, then the run party
  open: boolean; // the holder has today's run
}

@Injectable()
export class LangHuyetContext {
  readonly d: DungeonDef = dungeonByKey(LH.KEY)!;
  private readonly parties = new Map<number, LhParty>();
  /** Swappable RNG (tests). */
  intn: (n: number) => number = (n) => Math.floor(Math.random() * n);

  constructor(
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly instances: InstanceNpcService,
    private readonly quests: QuestService,
    private readonly credits: QuestCreditService,
  ) {}

  async holderOf(characterId: number): Promise<LhHolder> {
    const run = await this.state.run(characterId, this.d);
    const holder = run && run.leader > 0 ? run.leader : characterId;
    const lr = holder === characterId ? run : await this.state.run(holder, this.d);
    if (!lr) return { holder, members: [holder], open: false };
    return { holder, members: [...new Set([holder, ...lr.party])], open: true };
  }

  async status(h: LhHolder): Promise<LhStatus> {
    const active = new Set<number>();
    const done = new Set<number>();
    for (let q = LH.Q_GUARDS; q <= LH.Q_BOSS; q++) {
      if (await this.support.questActive(h.holder, q)) active.add(q);
      if (await this.quests.completedToday(h.holder, q)) done.add(q);
    }
    const run = await this.state.run(h.holder, this.d);
    return { active, done, marks: run?.beaten ?? [], groupSize: Math.max(h.members.length, 1) };
  }

  /** The party store of a holder for today (fresh witches / wolves / mushrooms each day). */
  party(holder: number): LhParty {
    const day = this.state.today();
    let p = this.parties.get(holder);
    if (!p || p.day !== day) {
      p = new LhParty(day, this.intn);
      this.parties.set(holder, p);
    }
    return p;
  }

  async visibleFor(characterId: number, mapId: number): Promise<{ nodes: LhNode[]; h: LhHolder; st: LhStatus } | null> {
    const h = await this.holderOf(characterId);
    if (!h.open) return null;
    const st = await this.status(h);
    return { nodes: lhVisible(mapId, st, this.party(h.holder)), h, st };
  }

  /** Per-viewer payload: template art / name, "Điểm Gieo Hạt" for the seed spots, type 10 for fights (Go entry). */
  npcOf(n: LhNode): InstanceNpc | null {
    const npc = this.support.spawnNpc(n.id, n.nid, n.map, n.x, n.y);
    if (!npc) return null;
    if (n.name) npc.name = n.name;
    npc.type = lhIsFight(n.kind) ? 10 : 1;
    return npc;
  }

  pushOff(members: readonly number[], mapId: number, ids: readonly number[]): void {
    for (const m of members) {
      const s = this.support.session(m);
      if (s && s.mapId === mapId) for (const id of ids) this.instances.npcOff(s, id);
    }
  }

  pushOn(members: readonly number[], mapId: number, nodes: readonly LhNode[]): void {
    for (const m of members) {
      const s = this.support.session(m);
      if (!s || s.mapId !== mapId) continue;
      for (const n of nodes) {
        const npc = this.npcOf(n);
        if (npc) this.instances.npcOn(s, npc);
      }
    }
  }

  say(members: readonly number[], text: string): void {
    for (const m of members) {
      const s = this.support.session(m);
      if (s) systemSay(s, text);
    }
  }

  /** Go credit: kind-6 objective + amount for every member holding the quest; changed quests re-pushed (onAddChaQuest). */
  async credit(members: readonly number[], target: number, amount: number): Promise<void> {
    for (const m of members) {
      const changed = await this.credits.credit(m, target, amount);
      const s = this.support.session(m);
      if (s) for (const c of changed) s.callback('onAddChaQuest', c.quest);
    }
  }
}
