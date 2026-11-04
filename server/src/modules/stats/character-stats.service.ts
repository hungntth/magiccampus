// Stat aggregator: loads the character, class, equipped templates and active buffs, runs the pure assembly and
// builds the stat-refresh onUPP payload. Depends only on models (no feature services) so character, inventory,
// buff and quest modules can all inject it without DI cycles.

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { CharProperty, PlayerUpdate } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { distributedOf, profileOf } from '../character/character-profile';
import { assembleStats, toCharProperty } from '../character/character-stats';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { collectBonuses, STAT_BONUS_PROVIDERS, type StatBonusProvider } from './stat-provider';

export interface CharStats {
  property: CharProperty;
  maxHp: number;
  maxMp: number;
  rates: Record<string, number>;
  att: { str: number; agi: number; sta: number; int: number; eng: number }; // base + gear, without distributed points
  doc: Character;
}

@Injectable()
export class CharacterStatsService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    @Inject(STAT_BONUS_PROVIDERS) private readonly providers: readonly StatBonusProvider[],
  ) {}

  /** Effective stats right now (base + every StatBonusProvider: gear, buffs, guild skills, titles, ...). Nothing is cached or written. */
  async compute(characterId: number): Promise<CharStats> {
    const doc = await this.chars.findById(characterId).lean();
    if (!doc) throw RpcException.notFound('character not found');
    const bonuses = await collectBonuses(this.providers, characterId, doc);
    const final = assembleStats(profileOf(doc, this.gameData.getClass(doc.classId)), bonuses);
    const dist = distributedOf(doc);
    return {
      property: { ...toCharProperty(final, doc.attrPoints, dist), spirituality: doc.currencies?.spirituality ?? 0 },
      maxHp: final.stats.maxHp,
      maxMp: final.stats.maxMp,
      rates: final.rates,
      att: {
        str: final.attrs.str - dist.str, agi: final.attrs.agi - dist.agi, sta: final.attrs.sta - dist.sta,
        int: final.attrs.int - dist.int, eng: final.attrs.eng - dist.eng,
      },
      doc,
    };
  }

  /** Stat-refresh onUPP payload; also rewrites the maxHp/maxMp cache columns when they changed. */
  async refreshPayload(characterId: number): Promise<PlayerUpdate> {
    return this.payloadOf(await this.compute(characterId));
  }

  /** Pushes the stat-refresh onUPP to the caller and returns it. */
  async refreshPush(session: Session): Promise<PlayerUpdate> {
    const payload = await this.refreshPayload(session.characterId!);
    session.callback('onUPP', payload);
    return payload;
  }

  async payloadOf(st: CharStats): Promise<PlayerUpdate> {
    if (st.doc.maxHp !== st.maxHp || st.doc.maxMp !== st.maxMp) {
      await this.chars.updateOne({ _id: st.doc._id }, { $set: { maxHp: st.maxHp, maxMp: st.maxMp } });
    }
    return {
      level: st.doc.level, exp: st.doc.exp, attrPoints: st.doc.attrPoints,
      currentHp: Math.min(st.doc.currentHp, st.maxHp), currentMp: Math.min(st.doc.currentMp, st.maxMp),
      maxHp: st.maxHp, maxMp: st.maxMp,
      attStrength: st.att.str, attAgility: st.att.agi, attStamina: st.att.sta, attIntelligence: st.att.int,
      attEnergy: st.att.eng,
      property: st.property,
    };
  }

  /** Clamps current HP/MP down to the effective max; `clamped` tells whether anything changed. */
  async clampHpMp(characterId: number, st?: CharStats): Promise<{ clamped: boolean; currentHp: number; currentMp: number }> {
    const s = st ?? (await this.compute(characterId));
    const hp = await this.chars.updateOne({ _id: characterId, currentHp: { $gt: s.maxHp } }, { $set: { currentHp: s.maxHp } });
    const mp = await this.chars.updateOne({ _id: characterId, currentMp: { $gt: s.maxMp } }, { $set: { currentMp: s.maxMp } });
    return {
      clamped: hp.modifiedCount + mp.modifiedCount > 0,
      currentHp: Math.min(s.doc.currentHp, s.maxHp),
      currentMp: Math.min(s.doc.currentMp, s.maxMp),
    };
  }

  /** Updates to push after gear changes: clamp {currentHp,currentMp} (only when clamped), then the stat refresh. */
  async gearChangeUpdates(characterId: number): Promise<PlayerUpdate[]> {
    const st = await this.compute(characterId);
    const c = await this.clampHpMp(characterId, st);
    const out: PlayerUpdate[] = [];
    if (c.clamped) out.push({ currentHp: c.currentHp, currentMp: c.currentMp });
    out.push(await this.payloadOf(st));
    return out;
  }

  /** Login: recompute, fix the max cache and clamp current HP/MP to the effective max. */
  async syncOnLogin(characterId: number): Promise<CharStats> {
    const st = await this.compute(characterId);
    const c = await this.clampHpMp(characterId, st);
    await this.payloadOf(st);
    st.doc.currentHp = c.currentHp;
    st.doc.currentMp = c.currentMp;
    st.doc.maxHp = st.maxHp;
    st.doc.maxMp = st.maxMp;
    return st;
  }

  /** Atomic heal capped at the given effective max; returns the new current values. */
  async healCapped(
    characterId: number, hp: number, mp: number, maxHp: number, maxMp: number,
  ): Promise<{ currentHp: number; currentMp: number }> {
    const doc = await this.chars.findOneAndUpdate(
      { _id: characterId },
      [{
        $set: {
          currentHp: { $min: [{ $add: ['$currentHp', hp] }, maxHp] },
          currentMp: { $min: [{ $add: ['$currentMp', mp] }, maxMp] },
        },
      }],
      { new: true, projection: { currentHp: 1, currentMp: 1 } },
    );
    if (!doc) throw RpcException.notFound('character not found');
    return { currentHp: doc.currentHp, currentMp: doc.currentMp };
  }
}
