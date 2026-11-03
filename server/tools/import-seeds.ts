// Imports the old Postgres seed dumps (supabase/seeds/*.sql, pg_dump INSERT format) into MongoDB.
// Each SQL file becomes one collection named after the table; rows keep their snake_case columns and
// use the `id` column as `_id` when present. Usage: pnpm import:seeds [--only data_tbl_map,...]

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MongoClient, type Document } from 'mongodb';

type Value = string | number | boolean | null;

interface ParsedInsert {
  table: string;
  columns: string[];
  rows: Value[][];
}

// Column order for seeds written as `INSERT INTO t VALUES (...)` without a column list
// (from D:/mcgame/supabase/migrations/20260328184527_baseline_mcgame_schema.sql).
const KNOWN_COLUMNS: Record<string, string[]> = {
  data_tbl_quest_pre: ['id', 'item_id', 'kind', 'num', 'qid', 'type'],
  // Legacy baseline schema order (migrations/20260328184527_baseline_mcgame_schema.sql), then the two columns appended by
  // migrations/20260505185430_add_quest_start_grant_columns.sql (accept-time item grant, e.g. quest 160 -> item 335).
  data_tbl_quest: [
    'id', 'a_script_text', 'at', 'award_exp_re', 'color', 'complete_text', 'finish_npc', 'gender', 'info', 'is_rebirth',
    'lm', 'max_level', 'min_level', 'money_num', 'money_type', 'name', 'pre_quest_type', 'qtest', 'req_class', 'rn',
    'rt', 'script_give_up', 'start_npc', 'start_text', 'sub_type', 'type', 'start_grant_item', 'start_grant_qty',
  ],
};

function parseFile(sql: string): ParsedInsert[] {
  const out: ParsedInsert[] = [];
  const re = /INSERT INTO\s+"?(\w+)"?\."?(\w+)"?\s*(?:\(([^)]*)\)\s*)?VALUES\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const table = m[2];
    let columns: string[];
    if (m[3] !== undefined) {
      columns = m[3].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    } else if (KNOWN_COLUMNS[table]) {
      columns = KNOWN_COLUMNS[table];
    } else {
      console.error(`ERROR ${table}: INSERT without a column list and no KNOWN_COLUMNS entry; rows skipped`);
      re.lastIndex = parseTuples(sql, re.lastIndex).end;
      continue;
    }
    const { rows, end } = parseTuples(sql, re.lastIndex);
    out.push({ table, columns, rows });
    re.lastIndex = end;
  }
  return out;
}

function parseTuples(sql: string, start: number): { rows: Value[][]; end: number } {
  const rows: Value[][] = [];
  let i = start;
  const n = sql.length;
  for (;;) {
    while (i < n && /\s/.test(sql[i])) i++;
    if (sql[i] !== '(') break;
    i++;
    const row: Value[] = [];
    for (;;) {
      while (i < n && /\s/.test(sql[i])) i++;
      const [val, next] = parseValue(sql, i);
      row.push(val);
      i = next;
      while (i < n && /\s/.test(sql[i])) i++;
      if (sql[i] === ',') {
        i++;
        continue;
      }
      if (sql[i] === ')') {
        i++;
        break;
      }
      throw new Error(`unexpected char '${sql[i]}' at ${i}`);
    }
    rows.push(row);
    while (i < n && /\s/.test(sql[i])) i++;
    if (sql[i] === ',') {
      i++;
      continue;
    }
    if (sql[i] === ';') {
      i++;
      break;
    }
    break;
  }
  return { rows, end: i };
}

function parseValue(sql: string, i: number): [Value, number] {
  const c = sql[i];
  if (c === "'" || ((c === 'E' || c === 'e') && sql[i + 1] === "'")) {
    const escaped = c !== "'";
    if (escaped) i++;
    i++;
    let s = '';
    for (;;) {
      const ch = sql[i];
      if (ch === undefined) throw new Error('unterminated string');
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          s += "'";
          i += 2;
          continue;
        }
        i++;
        break;
      }
      if (escaped && ch === '\\') {
        const nx = sql[i + 1];
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'" };
        s += map[nx] ?? nx;
        i += 2;
        continue;
      }
      s += ch;
      i++;
    }
    return [s, skipCast(sql, i)];
  }
  // `now()` (newer game_tuning_* seeds' updated_at) becomes the import time.
  if (/^now\(\)/i.test(sql.slice(i, i + 5))) return [new Date().toISOString(), skipCast(sql, i + 5)];
  const m = /^(NULL|TRUE|FALSE|true|false|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/.exec(sql.slice(i, i + 64));
  if (!m) throw new Error(`cannot parse value at ${i}: ${sql.slice(i, i + 40)}`);
  const tok = m[1];
  i = skipCast(sql, i + tok.length);
  if (tok === 'NULL') return [null, i];
  if (tok.toLowerCase() === 'true') return [true, i];
  if (tok.toLowerCase() === 'false') return [false, i];
  const num = Number(tok);
  return [Number.isSafeInteger(num) || tok.includes('.') ? num : tok, i];
}

function skipCast(sql: string, i: number): number {
  while (sql[i] === ':' && sql[i + 1] === ':') {
    i += 2;
    while (/[\w\[\]]/.test(sql[i] ?? '')) i++;
  }
  return i;
}

function toDocs(ins: ParsedInsert): Document[] {
  // A KNOWN_COLUMNS list behind the seed (columns added by a later migration) would silently drop trailing values.
  const widest = Math.max(0, ...ins.rows.map((r) => r.length));
  if (widest > ins.columns.length) {
    console.error(`ERROR ${ins.table}: rows have ${widest} values but only ${ins.columns.length} columns; extra values dropped`);
  }
  return ins.rows.map((row) => {
    const doc: Document = {};
    ins.columns.forEach((col, idx) => {
      doc[col] = row[idx];
    });
    if (doc.id !== undefined && doc.id !== null) doc._id = doc.id;
    return doc;
  });
}

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
