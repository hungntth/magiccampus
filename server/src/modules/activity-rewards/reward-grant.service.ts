// Exp + bound silver grant for the daily systems (M8 decision 2: level-scaled rewards): persisted in one write like a battle
// settle, then onAddMoney / onUPP (+ full stat refresh and onPlayerLevelUp on a level gain) and the achievement hooks.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { PlayerLevelUp, PlayerUpdate } from '@mc/shared';
import type { PushSink } from '../rewards/push-sink';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { Character } from '../character/character.schema';
import { applyExp } from '../quest/quest.rules';
import { CharacterStatsService } from '../stats/character-stats.service';

@Injectable()
export class RewardGrantService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly stats: CharacterStatsService,
    private readonly achievements: AchievementEvents,
  ) {}

  /** Level of the character (reward scaling input); 1 when the row is missing. */
  async levelOf(characterId: number): Promise<number> {
    const doc = await this.chars.findById(characterId, { level: 1 }).lean();
    return doc?.level ?? 1;
  }

  async grantExpSilver(session: PushSink, exp: number, silver: number): Promise<void> {
    const cid = session.characterId!;
    const doc = await this.chars.findById(cid, { level: 1, exp: 1, attrPoints: 1 }).lean();
    if (!doc || (exp <= 0 && silver <= 0)) return;
    const gained = applyExp(doc, Math.max(0, exp));
    const $set = { level: gained.level, exp: gained.exp, attrPoints: gained.attrPoints };
    const $inc: Record<string, number> = {};
    if (gained.statGain > 0) for (const k of ['strength', 'agility', 'stamina', 'intelligence', 'energy']) $inc[k] = gained.statGain;
    if (silver > 0) $inc.moneyBind = silver;
    const saved = await this.chars.findByIdAndUpdate(cid, Object.keys($inc).length > 0 ? { $set, $inc } : { $set }, {
      new: true, projection: { moneyBind: 1, money: 1 },
    });
    if (!saved) return;
    if (silver > 0) session.callback('onAddMoney', cid, 'moneyBind', silver, saved.moneyBind);
    const update: PlayerUpdate = { ...$set };
    if (silver > 0) update.moneyBind = saved.moneyBind;
    session.callback('onUPP', gained.leveled ? { ...update, ...(await this.stats.refreshPayload(cid)) } : update);
    if (gained.leveled) {
      const lv: PlayerLevelUp = { id: cid, level: gained.level, exp: gained.exp, lp: gained.attrPoints };
      session.callback('onPlayerLevelUp', lv);
      this.achievements.record(cid, 'level', { value: gained.level });
    }
    if (silver > 0) this.achievements.record(cid, 'silver', { value: saved.moneyBind + (saved.money ?? 0) });
  }
}
