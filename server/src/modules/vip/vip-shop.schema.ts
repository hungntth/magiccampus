// VIP shop state of a character (collection character_vip_shop): the displayed slot ids of the current rotation, the slots bought
// in it and the personal refresh counter of the day (see vip-shop-rules.ts).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'character_vip_shop', timestamps: true })
export class CharacterVipShop {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: Number, default: -1 })
  epoch: number;

  @Prop({ type: [Number], default: [] })
  slotIds: number[];

  @Prop({ type: [Number], default: [] })
  purchased: number[];

  @Prop({ type: String, default: '' })
  refreshDay: string;

  @Prop({ type: Number, default: 0 })
  refreshCount: number;
}

export const CharacterVipShopSchema = SchemaFactory.createForClass(CharacterVipShop);
