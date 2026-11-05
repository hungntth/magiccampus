// Phụ bản end chest (Go application/dungeon chest.go, handlers/npc dungeon_chest.go, dungeon_completion_reward.go,
// dungeon_mehuyen_chest.go): a per-viewer NPC on the chest map once today's run cleared the last floor and the chest is closed;
// a click rolls the shared completion reward + the Bí Kíp row of the difficulty's plan (items bound, a full bag before the
// first item keeps it closed), then pays level × expPerLevel exp, closes it (onNpcOff) and, for finishOnChest dungeons, the run.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { DungeonDef, InstanceNpc } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceDataService } from '../gamedata/instance-data';
import { InstanceNpcService } from '../npcscript/instance-npcs.service';
import { npcMsg, systemSay } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { GrantService, type Grant } from '../rewards/grant.service';
import { gradeColor, rollPlan } from '../rewards/plan-roller';
import { KEPT_PLAN_ITEMS, rollCompletion, type CompletionEntry } from './completion-reward';
import { DungeonEvents } from './dungeon-events';
import { difficultyOf, dungeonByChestNpc, enabledDungeons, floorCleared, runOf } from './dungeon-rules';
import { DungeonStateService } from './dungeon-state.service';
import { DungeonSupport } from './dungeon-support.service';

const TEXT = {
  OPENED: (n: string) => `Đã mở ${n}.`,
  DONE: (n: string) => `${n} đã được mở trong lượt phụ bản hôm nay.`,
  LOCKED: (d: string, n: string) => `Hãy hoàn thành tầng cuối của ${d} rồi mới mở ${n}.`,
  FULL: (n: string) => `Túi đồ đã đầy, hãy dọn bớt rồi mở lại ${n}.`,
  PARTIAL: 'Túi đồ đã đầy, một phần phần thưởng không nhận được.',
  EXP: (exp: number, diff: string) => `Nhận được ${exp} kinh nghiệm (độ khó ${diff}).`,
} as const;

const intn = (k: number): number => Math.floor(Math.random() * k);

@Injectable()
export class DungeonChestService implements OnModuleInit {
  private readonly logger = new Logger(DungeonChestService.name);
  private readonly claiming = new Set<number>();
  private feathers: number[] | null = null;
  /** Per-dungeon rewards rolled with the shared completion pool (Thám Hiểm ThamHiemChestRewards). */
  private readonly extras = new Map<string, (characterId: number, intn: (k: number) => number) => Promise<CompletionEntry[]> | CompletionEntry[]>();

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly gameData: GameDataService,
    private readonly instanceData: InstanceDataService,
    private readonly grants: GrantService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly events: DungeonEvents,
  ) {}

  onModuleInit(): void {
    this.instances.register('dungeon-chest', async (s, mapId) => {
      const d = enabledDungeons().find((x) => x.chest?.map === mapId);
      const npc = d ? this.npcOf(d) : null;
      return d && npc && (await this.visible(s.characterId!, d)) ? [npc] : [];
    });
    this.hooks.onClick('dungeon-chest', async (s, npc) => {
      const d = dungeonByChestNpc(npc.id);
      if (!d) return false;
      if (s.mapId === d.chest!.map) await this.claim(s, d);
      return true;
    }, 40);
    // Go DungeonChestHooks.OnQuestFinished + partyChestTargets: the final quest shows the chest to the leader and credited members.
    this.events.onCredit(async (e) => {
      if (e.final && e.d.chest) for (const id of [e.leader, ...e.members]) await this.pushIfVisible(id, e.d);
    });
  }

  addExtraRewards(key: string, fn: (characterId: number, intn: (k: number) => number) => Promise<CompletionEntry[]> | CompletionEntry[]): void {
    this.extras.set(key, fn);
  }

  npcOf(d: DungeonDef): InstanceNpc | null {
    const c = d.chest;
    return c ? this.support.spawnNpc(c.npc, c.npc, c.map, c.x, c.y) : null;
  }

  async visible(characterId: number, d: DungeonDef): Promise<boolean> {
    if (!d.chest) return false;
    const { run, done } = await this.state.view(characterId, d);
    return !!run && !run.chest && floorCleared(d.floors[d.floors.length - 1], run, done);
  }

  /** onNpcOn for the chest when the character stands on the chest map and may open it. */
  async pushIfVisible(characterId: number, d: DungeonDef): Promise<boolean> {
    const s = this.support.session(characterId);
    const npc = this.npcOf(d);
    if (!s || !npc || s.mapId !== npc.map || !(await this.visible(characterId, d))) return false;
    this.instances.npcOn(s, npc);
    return true;
  }

  async claim(session: Session, d: DungeonDef): Promise<void> {
    const cid = session.characterId!;
    const chest = d.chest!;
    const name = this.support.npcName(chest.npc, 'Bảo Rương');
    if (this.claiming.has(cid)) return;
    this.claiming.add(cid);
    try {
      const { run, done } = await this.state.view(cid, d);
      if (run?.chest) {
        this.instances.npcOff(session, chest.npc);
        return npcMsg(session, chest.npc, TEXT.DONE(name));
      }
      if (!run || !floorCleared(d.floors[d.floors.length - 1], run, done)) return npcMsg(session, chest.npc, TEXT.LOCKED(d.name, name));
      const diff = difficultyOf(d.rules, run.difficulty);
      const items = await this.rollItems(diff.chestPlan || chest.plan, d.level, cid, d.key);
      const fit = await this.fittingPrefix(cid, items.items);
      if (items.items.length > 0 && fit.length === 0) return npcMsg(session, chest.npc, TEXT.FULL(name));
      const marked = await this.state.mutate(cid, (st) => {
        const r = runOf(st.runs, d.key, this.state.today());
        if (!r || r.chest) return false;
        r.chest = true;
        return true;
      });
      if (!marked) return; // a concurrent claim won
      const level = (await this.support.character(cid))?.level ?? 0;
      const exp = level * diff.expPerLevel;
      await this.grants.grant(session, [...fit, ...items.currencies, ...(exp > 0 ? [{ kind: 'exp' as const, amount: exp }] : [])]);
      this.instances.npcOff(session, chest.npc);
      systemSay(session, TEXT.OPENED(name));
      if (exp > 0) systemSay(session, TEXT.EXP(exp, diff.name));
      if (fit.length < items.items.length) systemSay(session, TEXT.PARTIAL);
      if (d.rules.finishOnChest) await this.state.finishRun(cid, d);
    } finally {
      this.claiming.delete(cid);
    }
  }

  /**
   * Quick complete (auto-task award, Go GrantDungeonQuickCompletion): the chest's items + currencies for a difficulty without
   * the exp. `full` = a full bag before the first item (the award stays claimable); `partial` = only a prefix of the items fits.
   */
  async rollQuickReward(characterId: number, d: DungeonDef, difficulty: number): Promise<{ grants: Grant[]; full: boolean; partial: boolean }> {
    const plan = difficultyOf(d.rules, difficulty).chestPlan || d.chest?.plan || '';
    const rolled = await this.rollItems(plan, d.level, characterId, d.key);
    const fit = await this.fittingPrefix(characterId, rolled.items);
    const full = rolled.items.length > 0 && fit.length === 0;
    return { grants: full ? [] : [...fit, ...rolled.currencies], full, partial: fit.length < rolled.items.length };
  }

  /** Bí Kíp row of the plan (plan rate) + the shared completion roll, split into bag items and currencies. */
  private async rollItems(plan: string, dungeonLevel: number, characterId: number, key: string): Promise<{ items: Grant[]; currencies: Grant[] }> {
    const kept = this.instanceData.planRows(plan).filter((r) => r.ti === 29 && KEPT_PLAN_ITEMS.has(r.ii));
    const items: Grant[] = this.grants.fromPlan(rollPlan(kept, Math.random));
    const currencies: Grant[] = [];
    const extra = (await this.extras.get(key)?.(characterId, intn)) ?? [];
    for (const e of [...extra, ...rollCompletion(dungeonLevel, intn)]) {
      if (e.kind === 'item') {
        const color = gradeColor(e.grade);
        items.push({ kind: 'item', table: 29, templateId: e.id, qty: e.count, bound: true, ...(color >= 0 ? { color: Math.min(color, 5) } : {}) });
      } else if (e.kind === 'currency') currencies.push({ kind: 'currency', key: e.key, amount: e.count });
      else if (e.kind === 'feather') {
        const ids = await this.featherIds();
        if (ids.length > 0) items.push({ kind: 'item', table: 29, templateId: ids[intn(ids.length)], qty: e.count, bound: true });
        else this.logger.warn('dungeon completion: no tier-2 feathers in game data');
      }
    }
    return { items, currencies };
  }

  /** The longest prefix of item grants that fits the bag (Go grants in order and stops at a full bag). */
  private async fittingPrefix(characterId: number, items: readonly Grant[]): Promise<Grant[]> {
    if (await this.grants.fits(characterId, items)) return [...items];
    const out: Grant[] = [];
    for (const g of items) {
      if (!(await this.grants.fits(characterId, [...out, g]))) break;
      out.push(g);
    }
    return out;
  }

  /** Tier-2 wing feathers "Lông Vũ <X> Cấp 2" (kind 14, types 1401-1404), id order (Go featherTierCandidates). */
  private async featherIds(): Promise<number[]> {
    this.feathers ??= (await this.gameData.rows('data_tbl_item_template', { kind: 14 }))
      .filter((r) => Number(r.type) >= 1401 && Number(r.type) <= 1404 && /^Lông Vũ .* Cấp 2$/.test(String(r.name ?? '').trim()))
      .map((r) => Number(r.id))
      .sort((a, b) => a - b);
    return this.feathers;
  }
}
