// One-off generator for packages/shared/src/fairyData.ts (client static tables of the Tiểu Tinh Linh window, M13 phase G).
// Source: Mongo data_tbl_fairy_tempalte (17), data_tbl_skill (the code_name families of the 22 skill books), data_tbl_buff (effect text),
// data_tbl_item_template (book names / req_level). Re-run after `pnpm import:seeds` changed them.
// Usage: pnpm --filter @mc/server exec tsx tools/gen-fairy.ts
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { FAIRY_SKILL_BOOKS, type FairyBookRow, type FairySkillRow } from '@mc/shared';
import { toFairyTemplateRow } from '../src/modules/gamedata/fairy-data';

const OUT = resolve(__dirname, '../../packages/shared/src/fairyData.ts');
const clean = (v: unknown): string => String(v ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();

async function main(): Promise<void> {
  const client = await MongoClient.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/mcgame');
  try {
    const db = client.db();
    const templates = (await db.collection('data_tbl_fairy_tempalte').find({}).sort({ id: 1 }).toArray()).map(toFairyTemplateRow);
    const bookIds = Object.keys(FAIRY_SKILL_BOOKS).map(Number);
    const books: FairyBookRow[] = (await db.collection('data_tbl_item_template').find({ id: { $in: bookIds } }).sort({ id: 1 }).toArray()).map((r) => ({
      id: Number(r.id), name: clean(r.name), reqLevel: Number(r.req_level ?? 0), skillId: FAIRY_SKILL_BOOKS[Number(r.id)], iconCode: String(r.icon_code ?? 0),
    }));
    const level1 = await db.collection('data_tbl_skill').find({ id: { $in: Object.values(FAIRY_SKILL_BOOKS) } }).toArray();
    const codes = level1.map((r) => String(r.code_name ?? '')).filter((c) => c !== '');
    const skillRows = await db.collection('data_tbl_skill').find({ code_name: { $in: codes }, type: { $in: [6, 11] } }).sort({ id: 1 }).toArray();
    const skills: FairySkillRow[] = [];
    for (const r of skillRows) {
      const buffId = Number(r.buff_id ?? 0);
      const buff = buffId > 0 ? await db.collection('data_tbl_buff').findOne({ id: buffId }, { projection: { description: 1 } }) : null;
      skills.push({
        id: Number(r.id), name: clean(r.name), type: Number(r.type), level: Number(r.level ?? 1), codeName: String(r.code_name), iconCode: String(r.icon_code ?? 0),
        buffId, desc: clean(r.description), buffDesc: clean(buff?.description),
      });
    }
    const lines = (list: readonly object[]): string[] => list.map((r) => `  ${JSON.stringify(r)},`);
    const out = [
      '// GENERATED FILE - do not edit. Regenerate with: pnpm --filter @mc/server exec tsx tools/gen-fairy.ts',
      '// Source: Mongo data_tbl_fairy_tempalte / data_tbl_skill (fairy book families) / data_tbl_buff / data_tbl_item_template. Row types: fairy.ts.',
      '',
      "import type { FairyBookRow, FairySkillRow, FairyTemplateRow } from './fairy.js';",
      '',
      'export const FAIRY_TEMPLATE_ROWS: readonly FairyTemplateRow[] = [',
      ...lines(templates),
      '];',
      '',
      'export const FAIRY_SKILL_ROWS: readonly FairySkillRow[] = [',
      ...lines(skills),
      '];',
      '',
      'export const FAIRY_BOOK_ROWS: readonly FairyBookRow[] = [',
      ...lines(books),
      '];',
      '',
    ].join('\n');
    writeFileSync(OUT, out);
    console.log(`wrote ${OUT} (${templates.length} templates, ${skills.length} skills, ${books.length} books)`);
  } finally {
    await client.close();
  }
}

void main();
