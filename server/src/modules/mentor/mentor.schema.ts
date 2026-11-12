// Persisted Sư đồ link (collection `mentor_links`): one row per student (unique `studentId`), the teacher it points to and the
// report ledger of the pair (last reported level, reported exp, honor). The teacher's rank / points live in the feature row `mentor`.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'mentor_links' })
export class MentorLink {
  @Prop({ required: true })
  studentId: number;

  @Prop({ required: true, index: true })
  teacherId: number;

  /** Student level at the last report (the link time at first). */
  @Prop({ type: Number, default: 0 })
  lastLevel: number;

  /** Reported exp: sum of the teacher points the pair produced. */
  @Prop({ type: Number, default: 0 })
  exp: number;

  /** Điểm cống hiến: levels the student reported. */
  @Prop({ type: Number, default: 0 })
  honor: number;

  /** Made through NPC 49: cannot be dissolved until the student is Lv 30. */
  @Prop({ type: Boolean, default: false })
  npc: boolean;

  /** The pair held a friend row before: dissolving turns the rows back into friend rows, otherwise they are deleted. */
  @Prop({ type: Boolean, default: false })
  fb: boolean;

  @Prop({ type: Date, default: () => new Date() })
  since: Date;
}

export type MentorLinkDocument = HydratedDocument<MentorLink>;
export const MentorLinkSchema = SchemaFactory.createForClass(MentorLink);
MentorLinkSchema.index({ studentId: 1 }, { unique: true });
