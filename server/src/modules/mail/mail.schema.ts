// Mail document (`mails` collection, legacy player.mails). `_id` is the client-visible mail id from the `mails` counter.
// Attachments: 'template' (system mail, created on take), 'item' / 'pet' (a row parked in escrow under ref `mail:<_id>`).
// `claimed` flips once on take (conditional update); `source` is the unique idempotency key of system mails.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export interface MailAttachmentData {
  kind: 'item' | 'pet' | 'template';
  itemId?: number; // escrowed item row id
  petId?: number; // escrowed pet id
  templateId?: number; // template attachments
  table?: number; // 29 item / 19 equipment
  count?: number;
  bound?: boolean;
  quality?: number; // colour override of the created row (0 = template default)
}

@Schema({ collection: 'mails', timestamps: true })
export class Mail {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  receiverId: number;

  /** 0 = system mail. */
  @Prop({ required: true, default: 0 })
  senderId: number;

  @Prop({ default: '' })
  senderName: string;

  @Prop({ default: '' })
  subject: string;

  @Prop({ default: '' })
  text: string;

  @Prop({ default: 0 })
  money: number;

  @Prop({ default: 0 })
  gold: number;

  @Prop({ default: 0 })
  codMoney: number;

  @Prop({ default: 0 })
  codGold: number;

  @Prop({ type: Object, default: null })
  attachment: MailAttachmentData | null;

  /** Legacy display triple: template table (29 | 19 | 12), template id, stack; -1 when nothing is attached. */
  @Prop({ default: -1 })
  itemType: number;

  @Prop({ default: -1 })
  itemId: number;

  @Prop({ default: -1 })
  stackNum: number;

  @Prop({ default: false })
  claimed: boolean;

  @Prop({ default: false })
  returned: boolean;

  @Prop({ type: Date, default: null })
  readAt: Date | null;

  @Prop({ type: String, required: false })
  source?: string;

  createdAt?: Date;
}

export type MailDocument = HydratedDocument<Mail>;
export const MailSchema = SchemaFactory.createForClass(Mail);
MailSchema.index({ receiverId: 1, createdAt: -1 });
MailSchema.index({ createdAt: 1 });
MailSchema.index({ readAt: 1 });
MailSchema.index({ source: 1 }, { unique: true, sparse: true });
