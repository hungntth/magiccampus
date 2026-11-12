// One-off generator for packages/shared/src/equipSublimeData.ts (client table of the character gear Thang hoa levels).
// Source: Mongo data_tbl_sublimation. Re-run after `pnpm import:seeds`. Usage: pnpm --filter @mc/server exec tsx tools/gen-equip-sublime.ts
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';

const OUT = resolve(__dirname, '../../packages/shared/src/equipSublimeData.ts');
type Raw = Record<string, unknown>;
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function main(): Promise<void> {
  const client = await MongoClient.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame');
  try {
    const rows = (await client.db().collection('data_tbl_sublimation').find({}).sort({ id: 1 }).toArray()) as Raw[];
    const lines = rows.map((r) => `  [${[num(r.id), num(r.rate), num(r.item_num1), num(r.item_num2), num(r.element_num),
      num(r.prop1), num(r.prop_num1), num(r.prop2), num(r.prop_num2), num(r.prop3), num(r.prop_num3), num(r.prop4), num(r.prop_num4)].join(', ')}],`);
    writeFileSync(OUT, [
      '// GENERATED FILE - do not edit. Regenerate with: pnpm --filter @mc/server exec tsx tools/gen-equip-sublime.ts',
      '// Source: Mongo data_tbl_sublimation (seed import). Row layout: petSublime.ts (PetSublimeRow), same columns as the pet table.',
      '',
      "import type { PetSublimeRow } from './petSublime.js';",
      '',
      'export const EQUIP_SUBLIME_ROWS: readonly PetSublimeRow[] = [',
      ...lines,
      '];',
      '',
    ].join('\n'));
    console.log(`wrote ${rows.length} rows to ${OUT}`);
  } finally {
    await client.close();
  }
}

void main();
