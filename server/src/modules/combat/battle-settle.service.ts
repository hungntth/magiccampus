// Battle settlement: the one place a decided battle is credited. Flags the battle ended first (idempotent guard), then for every
// member still connected persists HP/MP; on a win the SURVIVORS also get exp / level-up / moneyBind (leader-level total split by
// floor division), kill credit and their share of the loot (rolled once per enemy, round-robin). Persisted at settle so a
// disconnect before battlePlayEnd cannot lose it; the pushes are kept on each member's result and sent at its own battlePlayEnd.
// Pets: on a win each surviving owner's pet gets half the per-survivor exp (even when the pet died); every pet that fought loses
// life, whatever the outcome (also when its owner left). Creatures a member caught (-70) become that member's pets here.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BattleResult } from '@mc/shared';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { BuffService } from '../buff/buff.service';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { PetBattleService } from '../pet/pet-battle.service';
import { PetCatchService } from '../pet/pet-catch.service';
import { petBattleExp } from '../pet/pet-rules';
import { applyExp } from '../quest/quest.rules';
import { QuestService } from '../quest/quest.service';
import { BattleLootService } from './battle-loot.service';
import { BattleHooks } from './battle-hooks';
import type { Battle, BattleMember, Fighter } from './battle.types';
import { charExp, expRateOfBuffs, petExp, type ExpRate } from './exp-rate';
import { expReward, moneyReward } from './rewards';
import { applyPvpVitals } from './pvp-rules';
import { aboveBossGap } from './boss-loot';
import { isSurvivor, petSettlements, splitReward } from './roster';

@Injectable()
export class BattleSettleService {
  private readonly logger = new Logger(BattleSettleService.name);

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly quests: QuestService,
    private readonly lootService: BattleLootService,
    private readonly petBattle: PetBattleService,
    private readonly petCatch: PetCatchService,
    private readonly achievements: AchievementEvents,
    private readonly hooks: BattleHooks,
    private readonly buffs: BuffService,
    private readonly gameData: GameDataService,
  ) {}

  /** Exp-rate buffs (books, props 24 / 25) of each surviving winner; a failure to read them leaves the base exp. */
  private async expRates(survivors: readonly BattleMember[]): Promise<Map<number, ExpRate>> {
    const out = new Map<number, ExpRate>();
    for (const m of survivors) {
      try {
        const active = await this.buffs.listActive(m.cid);
        out.set(m.cid, expRateOfBuffs(active.map((b) => this.gameData.getBuff(b.buffId))));
      } catch (e) {
        this.logger.error(`exp rate buffs failed for character ${m.cid}: ${(e as Error).message}`);
      }
    }
    return out;
  }

  /** Decides the battle's result and credits it once; later calls do nothing. */
  async settle(battle: Battle, result: number): Promise<void> {
    if (battle.ended) return;
    battle.ended = true;
    battle.result = result;
    if (battle.pvp) return this.settlePvp(battle);
    const fighterOf = (m: BattleMember): Fighter | undefined => battle.fighters.get(m.slot);
    const present = [...battle.members.values()].filter((m) => !m.left && fighterOf(m));
    const win = result === BattleResult.WIN;
    const survivors = win ? present.filter((m) => isSurvivor(fighterOf(m)!)) : [];
    // M10 decision 14: summoned / split units count like line-up units, including corpses taken off the board (fallen).
    const dead = [...battle.fighters.values(), ...(battle.fallen ?? [])].filter((f) => f.side === 'enemy' && !f.alive);
    // Rewards use the leader's level even when the leader left or died (its fighter stays on the board).
    const leader = battle.fighters.get(battle.members.get(battle.characterId)?.slot ?? -1);
    const free = battle.ctx?.noRewards === true; // M10 I: the world boss pays per battle itself
    const exp = free ? 0 : splitReward(leader ? expReward(leader.level, dead) : 0, survivors.length);
    const money = free ? 0 : splitReward(moneyReward(dead), survivors.length);
    const rates = free || exp <= 0 ? new Map<number, ExpRate>() : await this.expRates(survivors);
    for (const m of survivors) {
      const rate = rates.get(m.cid);
      m.result.report.exp = rate ? charExp(exp, rate) : exp;
      m.result.report.money = money;
    }
    // M10 I schedule boss: more than 10 levels above the boss row -> exp 1, no money, no loot (Go level_gap.go)
    const bossLevel = battle.ctx?.bossLevel;
    const gapped = new Set(bossLevel === undefined ? [] : survivors.filter((m) => aboveBossGap(fighterOf(m)!.level, bossLevel)));
    for (const m of gapped) {
      m.result.report.exp = Math.min(m.result.report.exp, 1);
      m.result.report.money = 0;
    }
    await this.settlePets(battle, survivors, exp, rates);
    await this.contractCaught(battle);
    if (win) await this.creditQuestsAndLoot(survivors.filter((m) => !gapped.has(m)), present, dead, battle, free);
    for (const m of present) await this.persist(m, fighterOf(m)!, survivors.includes(m));
    await this.hooks.runEnd(battle); // M10 feature end hooks (dungeon victory credit, …)
  }

  /**
   * PvP: no exp, money, loot, quests or pet life drain. HP/MP are persisted for every connected character; nobody is left dead
   * (H5 has no death or revive for PK): the loser ends at 1 HP.
   */
  private async settlePvp(battle: Battle): Promise<void> {
    applyPvpVitals(battle.fighters.values(), battle.result);
    for (const m of battle.members.values()) {
      const f = battle.fighters.get(m.slot);
      if (m.left || !f) continue;
      await this.chars.updateOne({ _id: m.cid }, { $set: { currentHp: f.hp, currentMp: Math.max(0, f.mp) } });
    }
  }

  /** Pet exp (survivor owners of a win) and life drain (every pet participant). A failure is logged and never blocks the rest. */
  private async settlePets(
    battle: Battle, survivors: readonly BattleMember[], splitExp: number, rates: ReadonlyMap<number, ExpRate>,
  ): Promise<void> {
    const owners = new Set(survivors.map((m) => m.cid));
    for (const s of petSettlements(battle.fighters.values(), owners, petBattleExp(splitExp))) {
      try {
        const rate = rates.get(s.ownerCid);
        const gain = s.exp !== null && rate ? petExp(s.exp, rate) : s.exp; // the owner's pet exp book (buff prop 25)
        const pushes = await this.petBattle.settle(s.ownerCid, s.petId, gain);
        const owner = battle.members.get(s.ownerCid);
        if (owner && !owner.left) owner.result.petPushes = pushes;
      } catch (e) {
        this.logger.error(`pet settle failed for pet ${s.petId}: ${(e as Error).message}`);
      }
    }
  }

  /** Creates the pets the members caught (any outcome: the creature is gone, Go). A failure is logged and never blocks the rest. */
  private async contractCaught(battle: Battle): Promise<void> {
    const caught = [...battle.fighters.values()].filter((f) => f.side === 'enemy' && f.caughtBy !== undefined);
    for (const m of battle.members.values()) {
      const ids = caught.filter((f) => f.caughtBy === m.slot).map((f) => f.refId);
      if (ids.length === 0) continue;
      try {
        m.result.catchPushes = await this.petCatch.contract(m.cid, ids);
      } catch (e) {
        this.logger.error(`pet contract failed for character ${m.cid}: ${(e as Error).message}`);
      }
    }
  }

  /** A leaver's HP/MP as they were when it dropped (the board keeps counting it as dead). */
  async saveVitals(cid: number, f: Fighter): Promise<void> {
    const deathAt = f.hp <= 0 ? { deathAt: new Date() } : {};
    await this.chars.updateOne({ _id: cid }, { $set: { currentHp: Math.max(0, f.hp), currentMp: Math.max(0, f.mp), ...deathAt } });
  }

  /** HP/MP for everyone; exp / level / stat gain / moneyBind for a surviving winner, in one write. */
  private async persist(m: BattleMember, f: Fighter, rewarded: boolean): Promise<void> {
    const $set: Record<string, number | Date> = { currentHp: Math.max(0, f.hp), currentMp: Math.max(0, f.mp) };
    if (f.hp <= 0) $set.deathAt = new Date(); // mode-3 relive price countdown
    const $inc: Record<string, number> = {};
    const report = m.result.report;
    if (rewarded) {
      const doc = await this.chars.findById(m.cid, { level: 1, exp: 1, attrPoints: 1 }).lean();
      if (doc) {
        const gained = applyExp(doc, report.exp);
        Object.assign($set, { level: gained.level, exp: gained.exp, attrPoints: gained.attrPoints });
        if (gained.statGain > 0) {
          for (const k of ['strength', 'agility', 'stamina', 'intelligence', 'energy']) $inc[k] = gained.statGain;
        }
        m.result.levelUp = gained.leveled;
      }
      if (report.money > 0) $inc.moneyBind = report.money;
    }
    const update = Object.keys($inc).length > 0 ? { $set, $inc } : { $set };
    const saved = await this.chars.findByIdAndUpdate(m.cid, update, { new: true, projection: { moneyBind: 1, money: 1 } });
    m.result.moneyTotal = saved?.moneyBind ?? 0;
    if (rewarded && saved) {
      if (m.result.levelUp) this.achievements.record(m.cid, 'level', { value: Number($set.level) });
      if (report.money > 0) this.achievements.record(m.cid, 'silver', { value: saved.moneyBind + (saved.money ?? 0) });
    }
  }

  /**
   * Kill credit for every connected member of a won battle, dead ones included (Go quest_kill_party.go: a leader-only quest
   * holder who died in the party win still counts), and the group loot for the survivors. Failures are logged, never block.
   */
  private async creditQuestsAndLoot(
    survivors: readonly BattleMember[], present: readonly BattleMember[], dead: readonly Fighter[], battle: Battle, noLoot: boolean,
  ): Promise<void> {
    const creatureIds = dead.filter((f) => f.kind === 'creature').map((f) => f.refId);
    for (const m of present) {
      this.achievements.record(m.cid, 'creatureKill', { creatureIds });
      try {
        m.result.quest = await this.quests.onCreatureKilled(m.cid, creatureIds);
      } catch (e) {
        this.logger.error(`kill credit failed for character ${m.cid}: ${(e as Error).message}`);
      }
    }
    if (noLoot) return;
    try {
      const loot = await this.lootService.grant(survivors.map((m) => ({ cid: m.cid, report: m.result.report })), dead, battle.ctx);
      for (const m of survivors) m.result.loot = loot.get(m.cid) ?? null;
    } catch (e) {
      this.logger.error(`loot failed for battle: ${(e as Error).message}`);
    }
  }
}
