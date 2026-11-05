// One-off, idempotent backfill of Character.cl (M9 phase B): the highest class rank earned by the finished promotion quests in
// quest_history. Only raises (never lowers) and only writes characters whose rank changes, so a second run changes nothing.
// Usage: pnpm --filter @mc/server exec tsx tools/backfill-class-rank.ts

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { loadConfig } from '../src/config/config';
import { CLASS_RANK_PROMOTION, rankFromHistory } from '../src/modules/quest/class-rank';

async function main(): Promise<void> {
  const client = new MongoClient(loadConfig().mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db();
    const ids = Object.keys(CLASS_RANK_PROMOTION).map(Number);
    const done = new Map<number, number[]>();
    for (const h of await db.collection('quest_history').find({ questId: { $in: ids } }).toArray()) {
      const cid = Number(h.characterId);
      done.set(cid, [...(done.get(cid) ?? []), Number(h.questId)]);
    }
    let changed = 0;
    for (const [cid, quests] of done) {
      const rank = rankFromHistory(quests);
      const res = await db.collection<{ _id: number; cl?: number }>('characters').updateOne({ _id: cid, $or: [{ cl: { $lt: rank } }, { cl: { $exists: false } }] }, { $set: { cl: rank } });
      changed += res.modifiedCount;
    }
    console.log(`class rank backfill: ${done.size} characters with promotion quests, ${changed} updated`);
  } finally {
    await client.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
