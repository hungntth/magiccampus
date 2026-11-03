import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ type: String })
  _id: string;

  @Prop({ default: 0 })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
