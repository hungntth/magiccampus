// Typed view over data_tbl_stars_template (12 star types x 12 levels): rows by id and by (type, level). Pure: GameDataService feeds
// the raw rows.

type Raw = Record<string, unknown>;

export interface StarTemplate {
  id: number;
  type: number;
  level: number;
  name: string;
  description: string;
  addProp: string;
  addValue: number;
  reqLevel: number;
  reqMoney: number;
  reqSeconds: number;
  reqStarLevel: number;
}

export interface StarTables {
  byId: Map<number, StarTemplate>;
  byTypeLevel: Map<string, StarTemplate>;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const starKey = (type: number, level: number): string => `${type}:${level}`;

export function buildStarTables(rows: Raw[]): StarTables {
  const t: StarTables = { byId: new Map(), byTypeLevel: new Map() };
  for (const r of rows) {
    const tpl: StarTemplate = {
      id: num(r.id), type: num(r.type), level: num(r.level), name: String(r.name ?? ''), description: String(r.description ?? ''),
      addProp: String(r.add_prop ?? ''), addValue: num(r.add_value), reqLevel: num(r.req_level), reqMoney: num(r.req_money),
      reqSeconds: num(r.req_seconds), reqStarLevel: num(r.req_star_level),
    };
    t.byId.set(tpl.id, tpl);
    t.byTypeLevel.set(starKey(tpl.type, tpl.level), tpl);
  }
  return t;
}
