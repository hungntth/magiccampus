// One-off, idempotent: gives every existing character the start skills of its class (data_tbl_class.start_skill), as
// CharacterService.create does for new ones. Rows are upserted with $setOnInsert, so a second run changes nothing.
// Usage: pnpm --filter @mc/server learn:start-skills

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { loadConfig } from '../src/config/config';
import { parseStartSkills } from '../src/modules/skill/skill-rules';

async function main(): Promise<void> {
  const client = new MongoClient(loadConfig().mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db();
    const starts = new Map<number, number[]>();
    for (const c of await db.collection('data_tbl_class').find().toArray()) starts.set(Number(c.id), parseStartSkills(c.start_skill));
    const skills = new Map<number, { level: number }>();
    for (const s of await db.collection('data_tbl_skill').find({}, { projection: { id: 1, level: 1 } }).toArray()) {
      skills.set(Number(s.id), { level: Math.max(1, Number(s.level ?? 1)) });
    }
    const rows = db.collection('character_skills');
    await rows.createIndex({ characterId: 1, skillId: 1 }, { unique: true });
    let total = 0;
    let created = 0;
    for (const ch of await db.collection('characters').find({}, { projection: { classId: 1, name: 1 } }).toArray()) {
      total++;
      for (const skillId of starts.get(Number(ch.classId)) ?? []) {
        const tpl = skills.get(skillId);
        if (!tpl) {
          console.warn(`skip skill ${skillId} for character ${ch._id} (${ch.name}): no template`);
          continue;
        }
        const res = await rows.updateOne(
          { characterId: Number(ch._id), skillId },
          { $setOnInsert: { level: tpl.level, position: 0 } },
          { upsert: true },
        );
        if (res.upsertedCount > 0) created++;
      }
    }
    console.log(`characters: ${total}, skill rows created: ${created}`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
