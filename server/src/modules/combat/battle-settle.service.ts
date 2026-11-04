// Battle settlement: the one place a decided battle is credited. Flags the battle ended first (idempotent guard), then for every
// member still connected persists HP/MP; on a win the SURVIVORS also get exp / level-up / moneyBind (leader-level total split by
// floor division), kill credit and their share of the loot (rolled once per enemy, round-robin). Persisted at settle so a
// disconnect before battlePlayEnd cannot lose it; the pushes are kept on each member's result and sent at its own battlePlayEnd.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BattleResult } from '@mc/shared';
import { Character } from '../character/character.schema';
import { applyExp } from '../quest/quest.rules';
import { QuestService } from '../quest/quest.service';
import { BattleLootService } from './battle-loot.service';
import type { Battle, BattleMember, Fighter } from './battle.types';
import { expReward, moneyReward } from './rewards';
import { isSurvivor, splitReward } from './roster';

@Injectable()
export class BattleSettleService {
  private readonly logger = new Logger(BattleSettleService.name);

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly quests: QuestService,
    private readonly lootService: BattleLootService,
  ) {}

  /** Decides the battle's result and credits it once; later calls do nothing. */
  async settle(battle: Battle, result: number): Promise<void> {
    if (battle.ended) return;
    battle.ended = true;
    battle.result = result;
    const fighterOf = (m: BattleMember): Fighter | undefined => battle.fighters.get(m.slot);
    const present = [...battle.members.values()].filter((m) => !m.left && fighterOf(m));
    const win = result === BattleResult.WIN;
    const survivors = win ? present.filter((m) => isSurvivor(fighterOf(m)!)) : [];
    const dead = [...battle.fighters.values()].filter((f) => f.side === 'enemy' && !f.alive);
    // Rewards use the leader's level even when the leader left or died (its fighter stays on the board).
    const leader = battle.fighters.get(battle.members.get(battle.characterId)?.slot ?? -1);
    const exp = splitReward(leader ? expReward(leader.level, dead) : 0, survivors.length);
    const money = splitReward(moneyReward(dead), survivors.length);
    for (const m of survivors) {
      m.result.report.exp = exp;
      m.result.report.money = money;
    }
    if (win) await this.creditQuestsAndLoot(survivors, dead);
    for (const m of present) await this.persist(m, fighterOf(m)!, survivors.includes(m));
  }

  /** A leaver's HP/MP as they were when it dropped (the board keeps counting it as dead). */
  async saveVitals(cid: number, f: Fighter): Promise<void> {
    await this.chars.updateOne({ _id: cid }, { $set: { currentHp: Math.max(0, f.hp), currentMp: Math.max(0, f.mp) } });
  }

  /** HP/MP for everyone; exp / level / stat gain / moneyBind for a surviving winner, in one write. */
  private async persist(m: BattleMember, f: Fighter, rewarded: boolean): Promise<void> {
    const $set: Record<string, number> = { currentHp: Math.max(0, f.hp), currentMp: Math.max(0, f.mp) };
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
    const saved = await this.chars.findByIdAndUpdate(m.cid, update, { new: true, projection: { moneyBind: 1 } });
    m.result.moneyTotal = saved?.moneyBind ?? 0;
  }

  /** Kill credit per survivor and the group loot. A failure is logged, never allowed to block exp / HP persistence. */
  private async creditQuestsAndLoot(survivors: readonly BattleMember[], dead: readonly Fighter[]): Promise<void> {
    const creatureIds = dead.filter((f) => f.kind === 'creature').map((f) => f.refId);
    for (const m of survivors) {
      try {
        m.result.quest = await this.quests.onCreatureKilled(m.cid, creatureIds);
      } catch (e) {
        this.logger.error(`kill credit failed for character ${m.cid}: ${(e as Error).message}`);
      }
    }
    try {
      const loot = await this.lootService.grant(survivors.map((m) => ({ cid: m.cid, report: m.result.report })), dead);
      for (const m of survivors) m.result.loot = loot.get(m.cid) ?? null;
    } catch (e) {
      this.logger.error(`loot failed for battle: ${(e as Error).message}`);
    }
  }
}
