// One-off generator for packages/shared/src/petSoulData.ts (client static table of the M12 Menh Hon window).
// Source: Mongo data_tbl_pet_soul (840 rows). Re-run after `pnpm import:seeds` changed it.
// Usage: pnpm --filter @mc/server exec tsx tools/gen-pet-soul.ts
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';

const OUT = resolve(__dirname, '../../packages/shared/src/petSoulData.ts');
type Raw = Record<string, unknown>;
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string => JSON.stringify(v === null || v === undefined ? '' : String(v));

async function main(): Promise<void> {
  const client = await MongoClient.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame');
  try {
    const rows = (await client.db().collection('data_tbl_pet_soul').find({}).sort({ id: 1 }).toArray()) as Raw[];
    const lines = rows.map((r) => `  [${num(r.id)}, ${str(r.name)}, ${num(r.color)}, ${num(r.level)}, ${num(r.type)}, ${num(r.exp)}, ${num(r.up_exp)}, `
      + `${num(r.chip)}, ${num(r.req_chip)}, ${num(r.prop_type)}, ${num(r.prop_val)}, ${str(r.icon_code)}, ${str(r.desc)}],`);
    const out = [
      '// GENERATED FILE - do not edit. Regenerate with: pnpm --filter @mc/server exec tsx tools/gen-pet-soul.ts',
      '// Source: Mongo data_tbl_pet_soul (seed import). Row layout: petSoulStatic.ts.',
      '',
      "import type { PetSoulRow } from './petSoulStatic.js';",
      '',
      'export const PET_SOUL_ROWS: readonly PetSoulRow[] = [',
      ...lines,
      '];',
      '',
    ].join('\n');
    writeFileSync(OUT, out);
    console.log(`wrote ${OUT} (${lines.length} rows)`);
  } finally {
    await client.close();
  }
}

void main();
