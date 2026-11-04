// Loop quest state per character and loop (Go player.character_quest_loops). The active round itself is a normal
// character_quests row; this document keeps the round counter, the take time (cooldown anchor) and the active round id.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'character_quest_loops', timestamps: true })
export class CharacterQuestLoop {
  @Prop({ required: true, index: true })
  characterId: number;

  @Prop({ required: true })
  loopId: number;

  /** Rounds completed in the current cycle. */
  @Prop({ default: 0 })
  ft: number;

  /** Take time in ms; the cooldown runs from here (cancel and cycle end keep it). */
  @Prop({ default: 0 })
  takeDateMs: number;

  @Prop({ default: false })
  active: boolean;

  @Prop({ default: 0 })
  activeQuestId: number;

  /** Cycles completed in total (informational). */
  @Prop({ default: 0 })
  cycles: number;
}

export type CharacterQuestLoopDocument = HydratedDocument<CharacterQuestLoop>;
export const CharacterQuestLoopSchema = SchemaFactory.createForClass(CharacterQuestLoop);
CharacterQuestLoopSchema.index({ characterId: 1, loopId: 1 }, { unique: true });
