// Loot of a won battle: rolls every dead creature's rows once for the group (group-loot.ts, per-recipient quest context) and puts the drops into the bags.
// Runs at settle so a disconnect before battlePlayEnd cannot lose them; Ma Tâm / direct loot goes to the temp bag, a full bag overflows into the Túi tạm thời.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ItemKind, resolveCurrency, type BagItem, type BattleReport, type TemporaryEntry } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { Character } from '../character/character.schema';
import { eligibleBossLoot, type BossLootRow } from '../gamedata/boss-loot';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceDataService } from '../gamedata/instance-data';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push } from '../inventory/pushes';
import { lootEffect, TempBagLootService, type RoutedLoot } from '../tempbag/tempbag-loot.service';
import { CurrencyService } from '../progression/currency.service';
import { QuestProgressService } from '../quest/quest-progress.service';
import type { BattleContext, BattleLoot, Fighter, Rng } from './battle.types';
import { rollBossLoot, type BossDrop } from './boss-loot';
import { rollGroupLoot } from './group-loot';
import type { LootDrop } from './loot';

/** Where one drop went: the Túi Tiện Dụng, the bag, or nowhere (overflow). */
type Outcome = { kind: 'temp'; routed: RoutedLoot } | { kind: 'bag'; changed: BagItem[] } | { kind: 'full' };

/** A loot recipient with the report its items are listed in. */
export interface LootTarget {
  cid: number;
  report: BattleReport;
}

/** Same item + bound flag merge into one grant. */
export function mergeDrops(drops: readonly LootDrop[]): LootDrop[] {
  const out = new Map<string, LootDrop>();
  for (const d of drops) {
    const key = `${d.itemId}:${d.bound}`;
    const cur = out.get(key);
    if (cur) cur.qty += d.qty;
    else out.set(key, { ...d });
  }
  return [...out.values()];
}

@Injectable()
export class BattleLootService {
  private readonly logger = new Logger(BattleLootService.name);
  /** Swappable for tests / tools. */
  rng: Rng = Math.random;

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly instanceData: InstanceDataService,
    private readonly inventory: InventoryService,
    private readonly progress: QuestProgressService,
    private readonly currencies: CurrencyService,
    private readonly tempLoot: TempBagLootService,
    private readonly scenes: SceneManager,
  ) {}

  /** Boss loot rows of a schedule / daily boss battle (daily ids resolve to the canonical nid), filtered by tier and source. */
  private bossRows(ctx: BattleContext | undefined): BossLootRow[] {
    if (!ctx || ctx.bossNid === undefined || (ctx.source !== 'schedule' && ctx.source !== 'daily')) return [];
    const nid = ctx.source === 'daily' ? this.instanceData.bossNidOfDaily(ctx.bossNid) : ctx.bossNid;
    const boss = nid === undefined ? undefined : this.instanceData.scheduleBoss(nid);
    return nid === undefined || !boss ? [] : eligibleBossLoot(this.instanceData.bossLoot(nid), ctx.source, boss.tier);
  }

  /**
   * Rolls the dead creatures' loot once for the whole group (round-robin among the eligible recipients, group-loot.ts) and
   * credits each recipient's drops to their bag. A solo battle is a group of one. Returns the loot by character id.
   */
  async grant(recipients: readonly LootTarget[], dead: readonly Fighter[], battleCtx?: BattleContext): Promise<Map<number, BattleLoot>> {
    const ctxs = await Promise.all(recipients.map((r) => this.progress.lootContext(r.cid)));
    const rows = dead.filter((f) => f.kind === 'creature').map((f) => this.gameData.creatureLoot(f.refId));
    const drops = rollGroupLoot(rows, recipients.map((r, i) => ({ cid: r.cid, ctx: ctxs[i] })), this.rng);
    const bossRows = this.bossRows(battleCtx);
    const out = new Map<number, BattleLoot>();
    for (const [i, r] of recipients.entries()) {
      const mine = drops.filter((d) => d.cid === r.cid).map((d) => d.drop);
      for (const b of rollBossLoot(bossRows, ctxs[i], this.rng)) {
        if (b.kind === 'item') {
          if (b.type === 19) this.logger.log(`boss loot: equipment ${b.itemId} has no battle-loot path, skipped`);
          else mine.push({ itemId: b.itemId, qty: b.qty, bound: b.bound });
        } else {
          await this.creditBoss(r, b);
        }
      }
      out.set(r.cid, await this.credit(r.cid, mergeDrops(mine), r.report));
    }
    return out;
  }

  /** Exp / bound silver ride the member's report (persisted by the settle); the other currencies are credited here (no push). */
  private async creditBoss(r: LootTarget, d: Exclude<BossDrop, { kind: 'item' }>): Promise<void> {
    try {
      if (d.kind === 'exp') r.report.exp += d.qty;
      else if (d.kind === 'basic' && d.id === 0 && d.bound) r.report.money += d.qty;
      else if (d.kind === 'basic' && d.id === 0) await this.chars.updateOne({ _id: r.cid }, { $inc: { money: d.qty } });
      else if (d.kind === 'basic' && d.id === 1) await this.chars.updateOne({ _id: r.cid }, { $inc: { gold: d.qty } });
      else {
        const raw = d.kind === 'basic' ? (d.id === 2 ? 'honor' : '') : d.id; // basic id 2 = honor (Chiến tích)
        const key = resolveCurrency(raw);
        if (key) await this.currencies.credit(r.cid, key, d.qty);
        else this.logger.log(`boss loot: currency ${raw || d.kind} has no H5 key, skipped`);
      }
    } catch (e) {
      this.logger.warn(`boss loot credit for character ${r.cid} failed: ${(e as Error).message}`);
    }
  }

  /**
   * Credits the drops: Ma Tâm / "Trực tiếp" materials go to the Túi Tiện Dụng (onAddTempDirect), the rest to the bag; a drop that fits
   * nowhere becomes a Túi tạm thời entry (warnTemporaryBag + onAddTemporaryItem) instead of being lost; only when that list is full is it lost.
   */
  private async credit(characterId: number, drops: readonly LootDrop[], report: BattleReport): Promise<BattleLoot> {
    const loot: BattleLoot = { changed: [], notices: [], bagFull: false, pushes: [] };
    const overflow: TemporaryEntry[] = [];
    for (const drop of drops) {
      const tpl = await this.gameData.template(29, drop.itemId);
      if (!tpl) continue;
      const spec = { templateId: drop.itemId, itemType: ItemKind.ITEM, bound: drop.bound, color: 0, amount: drop.qty, maxStack: maxStack(tpl) };
      const name = String(tpl.name ?? `#${drop.itemId}`);
      const outcome = await withCharLock(characterId, async (): Promise<Outcome> => {
        const routed = await this.tempLoot.route(characterId, drop.itemId, tpl, drop.qty, drop.bound);
        if (routed) return { kind: 'temp', routed };
        if (!(await this.inventory.canFit(characterId, spec))) return { kind: 'full' };
        return { kind: 'bag', changed: await this.inventory.add(characterId, spec) };
      });
      report.items.push({ name, count: drop.qty });
      if (outcome.kind === 'full') {
        overflow.push({
          itemType: 29, itemId: drop.itemId, binded: drop.bound ? 1 : 0, stackNum: drop.qty, quality: 0, name, iconCode: String(tpl.icon_code ?? 0),
        });
      } else if (outcome.kind === 'temp') {
        const { routed } = outcome;
        const effect = lootEffect(drop.itemId, drop.qty, name, Number(tpl.kind ?? 0));
        loot.pushes!.push(push(routed.mx ? 'onAddMXTempDirect' : 'onAddTempDirect', effect, routed.pos, routed.slot, routed.curNum));
      } else {
        loot.changed.push(...outcome.changed);
        loot.notices.push({ i: drop.itemId, q: drop.qty, t: ItemKind.ITEM, n: name });
      }
    }
    loot.pushes!.push(...this.tempLoot.overflow(this.scenes.findByCharacter(characterId) ?? undefined, overflow));
    return loot;
  }
}
