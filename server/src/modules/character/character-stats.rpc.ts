// Character stat RPCs: getCharAttributes, getCharDetailData, changeProperty (free point allocation), lvUp (manual
// level-up from level 20). Pushes (self): onUPP (stat refresh), onSystemMidMsgOrNote, onPlayerLevelUp.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ATTR_POINTS_PER_LEVEL, type CharDetailData, type PlayerLevelUp, type PlayerUpdate } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { CharacterStatsService } from '../stats/character-stats.service';
import { canManualLevelUp, expForNextLevel, parseChangeProperty } from './character-points';
import { detailData } from './character-stats';
import { Character } from './character.schema';

@Injectable()
export class CharacterStatsRpc {
  constructor(
    private readonly stats: CharacterStatsService,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly achievements: AchievementEvents,
  ) {}

  /** Returns the stat-refresh payload and pushes it as onUPP (legacy getCharAttributes). */
  @Rpc('getCharAttributes', { requireCharacter: true })
  async getCharAttributes(session: Session): Promise<PlayerUpdate> {
    return this.stats.refreshPush(session);
  }

  /** The 26 secondary rates of this character (or of another one by id; legacy has no visibility check). */
  @Rpc('getCharDetailData', { requireCharacter: true })
  async getCharDetailData(session: Session, args: unknown[]): Promise<CharDetailData> {
    const requested = Number(args[0]);
    const id = args[0] !== undefined && args[0] !== null && Number.isInteger(requested) ? requested : session.characterId!;
    return detailData((await this.stats.compute(id)).rates);
  }

  /** Fire-and-forget on the client. All-or-nothing: the sum must fit the free points. Returns null. */
  @Rpc('changeProperty', { requireCharacter: true })
  async changeProperty(session: Session, args: unknown[]): Promise<null> {
    const parsed = parseChangeProperty(args[0]);
    if (!parsed) throw RpcException.invalidArgs('arg');
    if (parsed.total <= 0) return null;
    const { add, total } = parsed;
    // Atomic spend: the filter on attrPoints makes a concurrent double submit fail instead of going negative.
    const r = await this.chars.updateOne(
      { _id: session.characterId!, attrPoints: { $gte: total } },
      {
        $inc: {
          attrPoints: -total, aptStrength: add.str, aptAgility: add.agi, aptStamina: add.sta,
          aptIntelligence: add.int, aptEnergy: add.eng,
        },
      },
    );
    if (r.modifiedCount !== 1) {
      session.callback('onSystemMidMsgOrNote', 'Không đủ điểm thuộc tính!');
      return null;
    }
    await this.finishStatChange(session);
    return null;
  }

  /** lvUp(level, passMd5|null): the password is ignored in H5. Reply true when a level was gained. */
  @Rpc('lvUp', { requireCharacter: true })
  async lvUp(session: Session): Promise<boolean> {
    const id = session.characterId!;
    const doc = await this.chars.findById(id, { level: 1, exp: 1 }).lean();
    if (!doc || !canManualLevelUp(doc.level, doc.exp)) return false;
    const need = expForNextLevel(doc.level)!;
    const r = await this.chars.updateOne(
      { _id: id, level: doc.level, exp: { $gte: need } },
      {
        $inc: {
          level: 1, attrPoints: ATTR_POINTS_PER_LEVEL, strength: 1, agility: 1, stamina: 1, intelligence: 1, energy: 1,
        },
      },
    );
    if (r.modifiedCount !== 1) return false;
    // HP/MP are not restored on level-up; the refresh only clamps them to the new max.
    const payload = await this.finishStatChange(session);
    const up: PlayerLevelUp = { id, level: payload.level ?? doc.level + 1, exp: payload.exp ?? doc.exp, lp: payload.attrPoints ?? 0 };
    session.callback('onPlayerLevelUp', up);
    this.achievements.record(id, 'level', { value: up.level });
    return true;
  }

  private async finishStatChange(session: Session): Promise<PlayerUpdate> {
    await this.stats.clampHpMp(session.characterId!);
    return this.stats.refreshPush(session);
  }
}
