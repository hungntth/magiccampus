// One-off, idempotent migration for the character-core stat model. Existing characters were created with all five
// attributes = 10 and the placeholder HP/MP formula. This rewrites, per character:
//   base attributes   = class att_* + (level - 1)
//   attrPoints        = max(attrPoints, (level - 1) * 5 - distributed points)
//   apt* (distributed) = existing value or 0 (field added by this change)
//   maxHp / maxMp     = base formula (no gear exists yet), current HP/MP clamped down to them
// Only fields that differ are written, so a second run changes nothing. Usage: pnpm --filter @mc/server exec tsx tools/fix-char-attributes.ts

import 'dotenv/config';
import { MongoClient, type Document } from 'mongodb';
import { loadConfig } from '../src/config/config';
import { classStartAttrs, distributedOf, profileOf } from '../src/modules/character/character-profile';
import { buildBaseStats } from '../src/modules/character/character-stats';

const APT_FIELDS = ['aptStrength', 'aptAgility', 'aptStamina', 'aptIntelligence', 'aptEnergy'] as const;

async function main(): Promise<void> {
  const client = new MongoClient(loadConfig().mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db();
    const classes = new Map<number, Document>();
    for (const c of await db.collection('data_tbl_class').find().toArray()) classes.set(Number(c.id), c);
    const chars = db.collection('characters');
    let changed = 0;
    let total = 0;
    for (const doc of await chars.find().toArray()) {
      total++;
      const cls = classes.get(Number(doc.classId));
      if (!cls) {
        console.warn(`skip character ${doc._id} (${doc.name}): unknown class ${doc.classId}`);
        continue;
      }
      const level = Number(doc.level ?? 1);
      const start = classStartAttrs(cls);
      const base = {
        strength: start.str + level - 1, agility: start.agi + level - 1, stamina: start.sta + level - 1,
        intelligence: start.int + level - 1, energy: start.eng + level - 1,
      };
      const apt = Object.fromEntries(APT_FIELDS.map((f) => [f, Number(doc[f] ?? 0)])) as Record<(typeof APT_FIELDS)[number], number>;
      const distributed = distributedOf({ ...base, ...apt });
      const spent = distributed.str + distributed.agi + distributed.sta + distributed.int + distributed.eng;
      const attrPoints = Math.max(Number(doc.attrPoints ?? 0), (level - 1) * 5 - spent);
      const { maxHp, maxMp } = buildBaseStats(profileOf({ ...base, ...apt }, cls));
      const want: Record<string, number> = {
        ...base, ...apt, attrPoints, maxHp, maxMp,
        currentHp: Math.min(Number(doc.currentHp ?? maxHp), maxHp),
        currentMp: Math.min(Number(doc.currentMp ?? maxMp), maxMp),
      };
      const set = Object.fromEntries(Object.entries(want).filter(([k, v]) => doc[k] !== v));
      if (Object.keys(set).length === 0) continue;
      await chars.updateOne({ _id: doc._id }, { $set: set });
      changed++;
      console.log(`character ${doc._id} (${doc.name}) lv${level}: ${JSON.stringify(set)}`);
    }
    console.log(`done: ${changed} of ${total} characters changed`);
  } finally {
    await client.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
