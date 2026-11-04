// Static mount tables (data_tbl_mount 33 rows, data_tbl_mount_dress 18 rows) loaded once through GameDataService.rows and shared by
// the mount service, the scene decoration and the stat provider (the tables are immutable at runtime).

import type { GameDataService } from '../gamedata/gamedata.service';
import { toDressRow, toMountRow, type DressRow, type MountRow } from './mount-rules';

export interface MountTables {
  rows: MountRow[];
  dresses: Map<number, DressRow>;
}

let cached: Promise<MountTables> | null = null;

export function mountTables(gameData: GameDataService): Promise<MountTables> {
  cached ??= (async () => {
    const rows = (await gameData.rows('data_tbl_mount')).map(toMountRow);
    const dresses = new Map((await gameData.rows('data_tbl_mount_dress')).map((r) => toDressRow(r)).map((d) => [d.id, d] as const));
    return { rows, dresses };
  })().catch((e: unknown) => {
    cached = null;
    throw e;
  });
  return cached;
}
