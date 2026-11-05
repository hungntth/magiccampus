// Imports the old Postgres seed dumps (supabase/seeds/*.sql, pg_dump INSERT format) into MongoDB.
// Each SQL file becomes one collection named after the table; rows keep their snake_case columns and
// use the `id` column as `_id` when present. Usage: pnpm import:seeds [--only data_tbl_map,...]

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MongoClient } from 'mongodb';
import { parseFile, toDocs } from './seed-parser';

async function main(): Promise<void> {
  const seedDir = path.resolve(process.env.SEED_DIR ?? '../mcgame/supabase/seeds');
  const mongoUri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame';
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

  const files = fs
    .readdirSync(seedDir)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !only || only.has(f.replace(/\.sql$/, '')));
  if (files.length === 0) throw new Error(`no seed files in ${seedDir}`);

  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  let total = 0;
  for (const file of files) {
    const table = file.replace(/\.sql$/, '');
    if (table === 'accounts' || table === 'runtime_config') {
      console.log(`skip ${file} (runtime table)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(seedDir, file), 'utf8');
    const inserts = parseFile(sql);
    const docs = inserts.flatMap(toDocs);
    await db.collection(table).drop().catch(() => undefined);
    if (docs.length > 0) {
      const seen = new Set<unknown>();
      const unique = docs.filter((d) => {
        if (d._id === undefined) return true;
        if (seen.has(d._id)) return false;
        seen.add(d._id);
        return true;
      });
      await db.collection(table).insertMany(unique, { ordered: false });
      total += unique.length;
      console.log(`${table}: ${unique.length} rows`);
    } else {
      console.log(`${table}: 0 rows`);
    }
  }
  await db.collection('data_tbl_npc').createIndex({ pos_map_id: 1 });
  console.log(`done: ${total} rows into ${files.length} collections`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
