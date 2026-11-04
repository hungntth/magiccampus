// Typed views over the five heiyaoshi tables (data_tbl_heiyaoshi_point / _point_link / _area / _area_attribute / _full_buff):
// per-figure point graph, stage-1 triangles and the completion bonuses. Pure: GameDataService feeds the raw rows.

type Raw = Record<string, unknown>;

export interface HyPoint {
  id: number;
  price: number;
  gold: number;
  around: number[];
  area: number[];
  aroundLine: number[];
}

export interface HyArea {
  id: number;
  lRes: string;
  aRes: string;
  attribute: Record<string, number>;
}

export interface HeiyaoshiTables {
  /** figure (1..20) -> point id -> point. */
  points: Map<number, Map<number, HyPoint>>;
  /** stage-1 figure (1..10) -> area id -> area. Figures 11..20 reuse these (see heiyaoshi-rules). */
  areas: Map<number, Map<number, HyArea>>;
  /** figure (1..20) -> ALL_HEIYAOSHI completion bonus. */
  full: Map<number, Record<string, number>>;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sub = <K, V>(m: Map<K, Map<number, V>>, key: K): Map<number, V> => {
  let inner = m.get(key);
  if (!inner) {
    inner = new Map();
    m.set(key, inner);
  }
  return inner;
};

export function buildHeiyaoshiTables(points: Raw[], links: Raw[], areas: Raw[], attrs: Raw[], full: Raw[]): HeiyaoshiTables {
  const t: HeiyaoshiTables = { points: new Map(), areas: new Map(), full: new Map() };
  for (const r of points) {
    sub(t.points, num(r.figure)).set(num(r.point_id), {
      id: num(r.point_id), price: num(r.price), gold: num(r.gold), around: [], area: [], aroundLine: [],
    });
  }
  // Links carry an `ord`; the Go loader sorts each list by it.
  for (const l of [...links].sort((a, b) => num(a.ord) - num(b.ord))) {
    const p = t.points.get(num(l.figure))?.get(num(l.point_id));
    if (!p) continue;
    const n = num(l.neighbor_id);
    if (l.link_type === 'around') p.around.push(n);
    else if (l.link_type === 'area') p.area.push(n);
    else if (l.link_type === 'around_line') p.aroundLine.push(n);
  }
  for (const r of areas) {
    sub(t.areas, num(r.figure)).set(num(r.area_id), {
      id: num(r.area_id), lRes: String(r.l_res_num ?? '0'), aRes: String(r.a_res_num ?? '0'), attribute: {},
    });
  }
  for (const r of attrs) {
    const a = t.areas.get(num(r.figure))?.get(num(r.area_id));
    if (a) a.attribute[String(num(r.prop_id))] = num(r.value);
  }
  for (const r of full) {
    const fig = num(r.figure);
    const m = t.full.get(fig) ?? {};
    m[String(num(r.prop_id))] = num(r.value);
    t.full.set(fig, m);
  }
  return t;
}
