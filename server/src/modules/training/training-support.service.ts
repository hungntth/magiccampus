// Shared helpers of the training services: conditional real-gold spend / refund (onAddMoney + onUPP like the Go gold spends) and
// the character's level / name / icon.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';

@Injectable()
export class TrainingSupport {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly characters: CharacterService,
  ) {}

  async level(characterId: number): Promise<number> {
    return (await this.chars.findById(characterId, { level: 1 }).lean())?.level ?? 1;
  }

  async profile(characterId: number): Promise<{ name: string; iconCode: string; level: number } | null> {
    try {
      const doc = await this.characters.getById(characterId);
      return { name: doc.name, iconCode: this.characters.iconCode(doc.classId, doc.gender), level: doc.level };
    } catch {
      return null;
    }
  }

  /** Conditional $inc (never negative): the new balance, null when short. Pushes the spend like Go (onAddMoney, onUPP). */
  async spendGold(session: Session, cost: number): Promise<number | null> {
    const cid = session.characterId!;
    const doc = await this.chars
      .findOneAndUpdate({ _id: cid, gold: { $gte: cost } }, { $inc: { gold: -cost } }, { new: true, projection: { gold: 1 } })
      .lean();
    if (!doc) return null;
    session.callback('onAddMoney', cid, 'gold', -cost, doc.gold);
    session.callback('onUPP', { gold: doc.gold });
    return doc.gold;
  }

  async refundGold(session: Session, amount: number): Promise<void> {
    const doc = await this.chars.findByIdAndUpdate(session.characterId!, { $inc: { gold: amount } }, { new: true, projection: { gold: 1 } }).lean();
    if (doc) session.callback('onUPP', { gold: doc.gold });
  }
}
