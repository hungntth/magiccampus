// Typed quest templates built from data_tbl_quest / _require / _pre rows, plus the in-memory indexes
// GameDataService caches at startup (by id, by start/finish NPC, require/pre rows by qid).

import type { Row } from './gamedata.service';

export interface QuestTemplate {
  id: number;
  name: string;
  info: string;
  startText: string;
  completeText: string;
  type: number;
  startNpc: number;
  finishNpc: number;
  minLevel: number;
  maxLevel: number; // 0 = unbounded
  gender: number; // 2 = any
  reqClass: string; // raw: "all" | "|1|" | "|1|3|"
  preQuestType: number; // 1 all kind-2 pre quests, 2 any of them
  awardExp: number;
  moneyNum: number;
  moneyType: number;
  color: number;
  startGrantItem: number; // 0 = none
  startGrantQty: number;
}

/** data_tbl_quest_require: kind 1 collect item (type 29 item / 19 equipment), 2 kill creature, 3 pet. */
export interface QuestRequireRow {
  qid: number;
  kind: number;
  type: number;
  itemId: number;
  num: number;
  q: number;
}

/** data_tbl_quest_pre: kind 1 carry `num` of item `itemId`; kind 2 quest `itemId` finished. */
export interface QuestPreRow {
  qid: number;
  kind: number;
  itemId: number;
  num: number;
  type: number;
}

export interface QuestTables {
  byId: Map<number, QuestTemplate>;
  byStartNpc: Map<number, QuestTemplate[]>;
  byFinishNpc: Map<number, QuestTemplate[]>;
  require: Map<number, QuestRequireRow[]>;
  pre: Map<number, QuestPreRow[]>;
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function toQuestTemplate(row: Row): QuestTemplate {
  return {
    id: n(row.id),
    name: s(row.name),
    info: s(row.info),
    startText: s(row.start_text),
    completeText: s(row.complete_text),
    type: n(row.type),
    startNpc: n(row.start_npc),
    finishNpc: n(row.finish_npc),
    minLevel: n(row.min_level),
    maxLevel: n(row.max_level),
    gender: row.gender === null || row.gender === undefined ? 2 : n(row.gender),
    reqClass: s(row.req_class),
    preQuestType: n(row.pre_quest_type),
    awardExp: n(row.award_exp_re),
    moneyNum: n(row.money_num),
    moneyType: n(row.money_type),
    color: n(row.color),
    startGrantItem: n(row.start_grant_item),
    startGrantQty: n(row.start_grant_qty),
  };
}

export function buildQuestTables(quests: Row[], requires: Row[], pres: Row[]): QuestTables {
  const t: QuestTables = { byId: new Map(), byStartNpc: new Map(), byFinishNpc: new Map(), require: new Map(), pre: new Map() };
  for (const row of quests) {
    const q = toQuestTemplate(row);
    t.byId.set(q.id, q);
    if (q.startNpc > 0) push(t.byStartNpc, q.startNpc, q);
    if (q.finishNpc > 0) push(t.byFinishNpc, q.finishNpc, q);
  }
  for (const r of requires) {
    push(t.require, n(r.qid), { qid: n(r.qid), kind: n(r.kind), type: n(r.type), itemId: n(r.item_id), num: n(r.num), q: n(r.q) });
  }
  for (const r of pres) {
    push(t.pre, n(r.qid), { qid: n(r.qid), kind: n(r.kind), itemId: n(r.item_id), num: n(r.num), type: n(r.type) });
  }
  return t;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}
