// One-off, idempotent: grants the local Ninja Bóng Đêm costume item to the live character named Zed.
// Usage: pnpm --filter @mc/server exec tsx tools/grant-ninja-shadow.ts

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { ItemKind, SlotType, bagCapacity } from '@mc/shared';
import { loadConfig } from '../src/config/config';
import { NINJA_SHADOW_EQUIP_ID } from '../src/modules/gamedata/custom-templates';

interface CharacterRow {
  _id: number;
  name: string;
  deleted?: boolean;
  bagSlotNum?: number;
}

interface CounterRow {
  _id: string;
  seq: number;
}

interface ItemRow {
  _id: number;
  characterId: number;
  templateId: number;
  itemType: number;
  slotType: number;
  slotIndex: number;
  stackCount: number;
  isBound: boolean;
  colorCode: number;
  durability: number;
  maxDurability: number;
  properties: Record<string, never>;
  star: number;
  createdAt: Date;
  updatedAt: Date;
}

async function main(): Promise<void> {
  const client = new MongoClient(loadConfig().mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db();
    const matches = await db.collection<CharacterRow>('characters').find({ name: /^zed$/i, deleted: { $ne: true } }).toArray();
    if (matches.length !== 1) throw new Error(`expected one live Zed character, found ${matches.length}`);
    const zed = matches[0];
    const items = db.collection<ItemRow>('character_items');
    const existing = await items.findOne({ characterId: Number(zed._id), templateId: NINJA_SHADOW_EQUIP_ID });
    if (existing) {
      console.log(`Zed already owns Ninja Bóng Đêm (item ${existing._id}).`);
      return;
    }

    const capacity = bagCapacity(Number(zed.bagSlotNum ?? 1));
    const occupied = new Set((await items.find({ characterId: Number(zed._id), slotType: SlotType.BAG }, { projection: { slotIndex: 1 } }).toArray())
      .map((item) => Number(item.slotIndex)));
    const slotIndex = Array.from({ length: capacity }, (_, index) => index).find((index) => !occupied.has(index));
    if (slotIndex === undefined) throw new Error('Zed\'s bag is full');

    const counter = await db.collection<CounterRow>('counters').findOneAndUpdate(
      { _id: 'items' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' },
    );
    const itemId = Number(counter?.seq);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new Error('items counter did not return an id');
    const now = new Date();
    await items.insertOne({
      _id: itemId,
      characterId: Number(zed._id),
      templateId: NINJA_SHADOW_EQUIP_ID,
      itemType: ItemKind.EQUIP,
      slotType: SlotType.BAG,
      slotIndex,
      stackCount: 1,
      isBound: true,
      colorCode: 6,
      durability: 0,
      maxDurability: 0,
      properties: {},
      star: 0,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Granted Ninja Bóng Đêm item ${itemId} to Zed in bag slot ${slotIndex + 1}.`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
