// Player quest state: CharacterQuest = one active quest (row exists while taken), QuestHistory = finished
// non-repeatable quests (source of the login `questLog`).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export class QuestObjective {
  kind: number; // 1 item · 2 creature · 3 pet (data_tbl_quest_require.kind)
  itemId: number;
  current: number;
  required: number;
}

@Schema({ collection: 'character_quests' })
export class CharacterQuest {
  @Prop({ required: true, index: true })
  characterId: number;

  @Prop({ required: true })
  questId: number;

  @Prop({ type: Date, default: () => new Date() })
  takeDate: Date;

  @Prop({
    type: [{ _id: false, kind: Number, itemId: Number, current: Number, required: Number }],
    default: [],
  })
  objectives: QuestObjective[];
}

export type CharacterQuestDocument = HydratedDocument<CharacterQuest>;
export const CharacterQuestSchema = SchemaFactory.createForClass(CharacterQuest);
CharacterQuestSchema.index({ characterId: 1, questId: 1 }, { unique: true });

@Schema({ collection: 'quest_history' })
export class QuestHistory {
  @Prop({ required: true, index: true })
  characterId: number;

  @Prop({ required: true })
  questId: number;

  @Prop({ type: Date, default: () => new Date() })
  completedAt: Date;
}

export const QuestHistorySchema = SchemaFactory.createForClass(QuestHistory);
QuestHistorySchema.index({ characterId: 1, questId: 1 }, { unique: true });
