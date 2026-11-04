// Sign-in ledger, one document per character and UTC+7 month (collection character_signins), shared by the legacy 5-day panel
// and the monthly calendar: signed-day bitmap (bit day-1), crit meter, lucky claim flag and the spend counted toward the lucky tiers.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'character_signins', timestamps: true })
export class CharacterSignin {
  @Prop({ type: Number, required: true })
  characterId: number;

  @Prop({ type: Number, required: true })
  year: number;

  /** 1..12 */
  @Prop({ type: Number, required: true })
  month: number;

  @Prop({ type: Number, default: 0 })
  claimedDays: number;

  @Prop({ type: Number, default: 0 })
  critPercent: number;

  @Prop({ type: Boolean, default: false })
  luckyClaimed: boolean;

  /** Gold spent on retroactive signs and crit upgrades this month (Go consume_limit_total). */
  @Prop({ type: Number, default: 0 })
  consumeTotal: number;
}

export const CharacterSigninSchema = SchemaFactory.createForClass(CharacterSignin);
CharacterSigninSchema.index({ characterId: 1, year: 1, month: 1 }, { unique: true });
