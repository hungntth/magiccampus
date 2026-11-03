// Read-only access to the static game tables imported from the old Postgres `data` schema.
// Collections keep their original names (data_tbl_map, data_tbl_class, ...) and snake_case columns.
// Hot tables (map, class, npc) are cached in memory at startup.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { MapInfo, SceneNpc } from '@mc/shared';

export type Row = Record<string, unknown>;

@Injectable()
export class GameDataService implements OnModuleInit {
  private readonly logger = new Logger(GameDataService.name);
  private maps = new Map<number, Row>();
  private classes = new Map<number, Row>();
  private npcsByMap = new Map<number, Row[]>();

  constructor(@InjectConnection() private readonly conn: Connection) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.maps = await this.indexById('data_tbl_map');
    this.classes = await this.indexById('data_tbl_class');
    const npcs = await this.rows('data_tbl_npc');
    this.npcsByMap = new Map();
    for (const npc of npcs) {
      const mapId = Number(npc.pos_map_id);
      if (!this.npcsByMap.has(mapId)) this.npcsByMap.set(mapId, []);
      this.npcsByMap.get(mapId)!.push(npc);
    }
    this.logger.log(
      `Loaded ${this.maps.size} maps, ${this.classes.size} classes, ${npcs.length} npcs` +
        (this.maps.size === 0 ? ' — run `pnpm import:seeds` to populate static data' : ''),
    );
  }

  async rows(collection: string, filter: Row = {}): Promise<Row[]> {
    return this.conn.db!.collection<Row>(collection).find(filter).toArray();
  }

  getMap(id: number): Row | undefined {
    return this.maps.get(id);
  }

  listMaps(): Row[] {
    return [...this.maps.values()];
  }

  getClass(id: number): Row | undefined {
    return this.classes.get(id);
  }

  listClasses(): Row[] {
    return [...this.classes.values()].sort((a, b) => Number(a.id) - Number(b.id));
  }

  npcsOnMap(mapId: number): Row[] {
    return this.npcsByMap.get(mapId) ?? [];
  }

  toMapInfo(row: Row): MapInfo {
    return {
      id: Number(row.id),
      name: String(row.name ?? ''),
      width: Number(row.width ?? 0),
      height: Number(row.height ?? 0),
      type: Number(row.type ?? 1),
      resCode: String(row.res_code ?? 0),
      safeX: Number(row.safe_x ?? 0),
      safeY: Number(row.safe_y ?? 0),
      info: String(row.info ?? ''),
    };
  }

  toSceneNpc(row: Row): SceneNpc {
    return {
      id: Number(row.id),
      name: String(row.name ?? ''),
      posX: Number(row.pos_x ?? 0),
      posY: Number(row.pos_y ?? 0),
      posDir: Number(row.pos_dir ?? 0),
      iconCode: String(row.icon_code ?? 0),
      resCode: String(row.res_code ?? 0),
      type: Number(row.type ?? 0),
      subType: Number(row.sub_type ?? 0),
    };
  }

  private async indexById(collection: string): Promise<Map<number, Row>> {
    const out = new Map<number, Row>();
    for (const row of await this.rows(collection)) out.set(Number(row.id), row);
    return out;
  }
}
