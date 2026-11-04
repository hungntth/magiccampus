// Battle settlement: the one place a decided battle is credited. Flags the battle ended first (idempotent guard), then
// persists HP/MP and, on a win, exp / level-up / moneyBind in a single write, plus loot (bag) and kill-quest credit so a
// disconnect before battlePlayEnd cannot lose them. Their pushes are kept on the battle and sent at battlePlayEnd.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BattleResult, BATTLE_PLAYER_SLOT, type BattleReport } from '@mc/shared';
import { Character } from '../character/character.schema';
import { applyExp } from '../quest/quest.rules';
import { QuestService } from '../quest/quest.service';
import { BattleLootService } from './battle-loot.service';
import type { Battle, Fighter } from './battle.types';
import { expReward, moneyReward } from './rewards';

@Injectable()
export class BattleSettleService {
  private readonly logger = new Logger(BattleSettleService.name);

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly quests: QuestService,
    private readonly lootService: BattleLootService,
  ) {}

  /** Decides the battle's result and credits it once; later calls return the stored report. */
  async settle(battle: Battle, result: number): Promise<BattleReport> {
    if (battle.ended && battle.report) return battle.report;
    battle.ended = true;
    battle.result = result;
    const fighters = [...battle.fighters.values()];
    const player = battle.fighters.get(BATTLE_PLAYER_SLOT);
    const report: BattleReport = { exp: 0, money: 0, items: [] };
    battle.report = report;
    if (!player) return report;

    const $set: Record<string, number> = { currentHp: Math.max(0, player.hp), currentMp: Math.max(0, player.mp) };
    const $inc: Record<string, number> = {};
    if (result === BattleResult.WIN) {
      const dead = fighters.filter((f) => f.side === 'enemy' && !f.alive);
      report.exp = expReward(player.level, dead);
      report.money = moneyReward(dead);
      await this.creditQuestsAndLoot(battle, dead, report);
      const doc = await this.chars.findById(battle.characterId, { level: 1, exp: 1, attrPoints: 1 }).lean();
      if (doc) {
        const exp = applyExp(doc, report.exp);
        Object.assign($set, { level: exp.level, exp: exp.exp, attrPoints: exp.attrPoints });
        if (exp.statGain > 0) {
          for (const k of ['strength', 'agility', 'stamina', 'intelligence', 'energy']) $inc[k] = exp.statGain;
        }
        battle.levelUp = exp.leveled;
      }
      if (report.money > 0) $inc.moneyBind = report.money;
    }
    const update = Object.keys($inc).length > 0 ? { $set, $inc } : { $set };
    const saved = await this.chars.findByIdAndUpdate(battle.characterId, update, { new: true, projection: { moneyBind: 1 } });
    battle.moneyTotal = saved?.moneyBind ?? 0;
    return report;
  }

  /** Kill credit and loot from the same dead list. A failure is logged, never allowed to block exp / HP persistence. */
  private async creditQuestsAndLoot(battle: Battle, dead: readonly Fighter[], report: BattleReport): Promise<void> {
    const creatureIds = dead.filter((f) => f.kind === 'creature').map((f) => f.refId);
    try {
      battle.quest = await this.quests.onCreatureKilled(battle.characterId, creatureIds);
    } catch (e) {
      this.logger.error(`kill credit failed for character ${battle.characterId}: ${(e as Error).message}`);
    }
    try {
      battle.loot = await this.lootService.grant(battle.characterId, dead, report);
    } catch (e) {
      this.logger.error(`loot failed for character ${battle.characterId}: ${(e as Error).message}`);
    }
  }
}
