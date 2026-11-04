// Scene items (data_tbl_sceneitem_instance joined with data_tbl_sceneitem_template) and the in-memory
// indexes GameDataService caches at startup: by id, by map, and the transport gates (template type 3).

import type { Row } from './gamedata.service';

export const SCENE_ITEM_TRANSPORT = 3;

export interface SceneItemRow {
  id: number;
  tid: number;
  /** Template type; 3 = transport gate (SceneItemView.TYPE_TRANSPORT). */
  type: number;
  /** For gates: the destination map name. */
  name: string;
  mapId: number;
  posX: number;
  posY: number;
  posDir: number;
  layer: number;
  /** Paired gate instance id (instance column `from`); 0 = unpaired. */
  from: number;
  resCode: string;
}

export interface SceneItemTables {
  byId: Map<number, SceneItemRow>;
  byMap: Map<number, SceneItemRow[]>;
  gates: SceneItemRow[];
}

/**
 * Seed rows whose pos_map_id points at a map that does not exist. 731 "Vân Đài" sits on "map 200" in the seeds; it is the
 * Xuất Vân Thôn (map 1) gate to Vân Đài (1723,604 is walkable there). Without it, Vân Đài's gate 757 "Xuất Vân Thôn"
 * dropped players at the map 1 safe point and map 1 had no way back.
 */
export const GATE_MAP_FIXES: Readonly<Record<number, number>> = { 731: 1 };

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function buildSceneItemTables(instances: Row[], templates: Row[]): SceneItemTables {
  const tpl = new Map<number, Row>();
  for (const t of templates) tpl.set(n(t.id), t);
  const t: SceneItemTables = { byId: new Map(), byMap: new Map(), gates: [] };
  for (const row of instances) {
    const template = tpl.get(n(row.tid));
    const item: SceneItemRow = {
      id: n(row.id),
      tid: n(row.tid),
      type: n(template?.type),
      name: row.name === null || row.name === undefined ? '' : String(row.name),
      mapId: GATE_MAP_FIXES[n(row.id)] ?? n(row.pos_map_id),
      posX: n(row.pos_x),
      posY: n(row.pos_y),
      posDir: n(row.pos_dir),
      layer: n(row.layer),
      from: n(row.from),
      resCode: String(template?.res_code ?? 0),
    };
    t.byId.set(item.id, item);
    const list = t.byMap.get(item.mapId);
    if (list) list.push(item);
    else t.byMap.set(item.mapId, [item]);
    if (item.type === SCENE_ITEM_TRANSPORT) t.gates.push(item);
  }
  t.gates.sort((a, b) => a.id - b.id);
  for (const list of t.byMap.values()) list.sort((a, b) => a.id - b.id);
  return t;
}
