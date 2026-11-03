// Read-only access to the static game tables imported from the old Postgres `data` schema.
// Collections keep their original names (data_tbl_map, data_tbl_class, ...) and snake_case columns.
// Hot tables (map, class, npc, quest + require/pre) are cached in memory at startup.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { MapInfo, SceneNpc } from '@mc/shared';
import { buildQuestTables, type QuestPreRow, type QuestRequireRow, type QuestTables, type QuestTemplate } from './quest-data';

export type Row = Record<string, unknown>;

@Injectable()
export class GameDataService implements OnModuleInit {
  private readonly logger = new Logger(GameDataService.name);
  private maps = new Map<number, Row>();
  private classes = new Map<number, Row>();
  private npcsByMap = new Map<number, Row[]>();
  private npcsById = new Map<number, Row>();
  private quests: QuestTables = buildQuestTables([], [], []);

  constructor(@InjectConnection() private readonly conn: Connection) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.maps = await this.indexById('data_tbl_map');
    this.classes = await this.indexById('data_tbl_class');
    const npcs = await this.rows('data_tbl_npc');
    this.npcsByMap = new Map();
    this.npcsById = new Map();
    for (const npc of npcs) {
      this.npcsById.set(Number(npc.id), npc);
      const mapId = Number(npc.pos_map_id);
      if (!this.npcsByMap.has(mapId)) this.npcsByMap.set(mapId, []);
      this.npcsByMap.get(mapId)!.push(npc);
    }
    const [quests, requires, pres] = await Promise.all([
      this.rows('data_tbl_quest'),
      this.rows('data_tbl_quest_require'),
      this.rows('data_tbl_quest_pre'),
    ]);
    this.quests = buildQuestTables(quests, requires, pres);
    this.logger.log(
      `Loaded ${this.maps.size} maps, ${this.classes.size} classes, ${npcs.length} npcs, ` +
        `${quests.length} quests (${requires.length} require, ${pres.length} pre)` +
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

  getNpc(id: number): Row | undefined {
    return this.npcsById.get(id);
  }

  npcsOnMap(mapId: number): Row[] {
    return this.npcsByMap.get(mapId) ?? [];
  }

  getQuest(id: number): QuestTemplate | undefined {
    return this.quests.byId.get(id);
  }

  questsByStartNpc(npcId: number): QuestTemplate[] {
    return this.quests.byStartNpc.get(npcId) ?? [];
  }

  questsByFinishNpc(npcId: number): QuestTemplate[] {
    return this.quests.byFinishNpc.get(npcId) ?? [];
  }

  questRequire(qid: number): QuestRequireRow[] {
    return this.quests.require.get(qid) ?? [];
  }

  questPre(qid: number): QuestPreRow[] {
    return this.quests.pre.get(qid) ?? [];
  }

  /** Name of an item (table type 29) or equipment (type 19) template, queried on demand; '#<id>' if unknown. */
  async templateName(type: number, id: number): Promise<string> {
    const collection = type === 19 ? 'data_tbl_equipt_template' : type === 29 ? 'data_tbl_item_template' : null;
    if (!collection) return `#${id}`;
    const row = await this.conn.db!.collection<{ _id: number; name?: unknown }>(collection).findOne({ _id: id }, { projection: { name: 1 } });
    return row?.name ? String(row.name) : `#${id}`;
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
      subType: String(row.sub_type ?? ''),
      questState: -1,
    };
  }

  private async indexById(collection: string): Promise<Map<number, Row>> {
    const out = new Map<number, Row>();
    for (const row of await this.rows(collection)) out.set(Number(row.id), row);
    return out;
  }
}
