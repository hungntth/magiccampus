// One-off generator for packages/shared/src/prsData.ts (client static tables of the Chân Hồn Thần Thú window, M13 phase G).
// Source: Mongo data_tbl_prs_tree (50) / data_tbl_prs_show (22) / data_tbl_prs_chip (10). Re-run after `pnpm import:seeds` changed them.
// Usage: pnpm --filter @mc/server exec tsx tools/gen-prs.ts
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { toPrsChipRow, toPrsShowRow, toPrsTreeRow } from '../src/modules/gamedata/prs-data';

const OUT = resolve(__dirname, '../../packages/shared/src/prsData.ts');

async function main(): Promise<void> {
  const client = await MongoClient.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame');
  try {
    const db = client.db();
    const rows = async (c: string): Promise<Record<string, unknown>[]> => db.collection(c).find({}).sort({ id: 1 }).toArray();
    const tree = (await rows('data_tbl_prs_tree')).map(toPrsTreeRow);
    const show = (await rows('data_tbl_prs_show')).map(toPrsShowRow);
    for (const r of show.filter((x) => x.tab === 1)) {
      const item = await db.collection('data_tbl_item_template').findOne({ id: r.needChipId }, { projection: { name: 1 } });
      if (item) r.itemName = String(item.name ?? '').trim();
    }
    const chip = (await rows('data_tbl_prs_chip')).map(toPrsChipRow);
    const lines = (list: readonly object[]): string[] => list.map((r) => `  ${JSON.stringify(r)},`);
    const out = [
      '// GENERATED FILE - do not edit. Regenerate with: pnpm --filter @mc/server exec tsx tools/gen-prs.ts',
      '// Source: Mongo data_tbl_prs_tree / data_tbl_prs_show / data_tbl_prs_chip (seed import). Row types: prs.ts.',
      '',
      "import type { PrsChipRow, PrsShowRow, PrsTreeRow } from './prs.js';",
      '',
      'export const PRS_TREE_ROWS: readonly PrsTreeRow[] = [',
      ...lines(tree),
      '];',
      '',
      'export const PRS_SHOW_ROWS: readonly PrsShowRow[] = [',
      ...lines(show),
      '];',
      '',
      'export const PRS_CHIP_ROWS: readonly PrsChipRow[] = [',
      ...lines(chip),
      '];',
      '',
    ].join('\n');
    writeFileSync(OUT, out);
    console.log(`wrote ${OUT} (${tree.length} tree, ${show.length} show, ${chip.length} chip rows)`);
  } finally {
    await client.close();
  }
}

void main();
