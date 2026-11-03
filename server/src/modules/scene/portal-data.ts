// Adapter from GameDataService (cached scene items + maps) to the PortalData interface of portal.rules.ts.

import type { GameDataService } from '../gamedata/gamedata.service';
import type { PortalData } from './portal.rules';

/** Legacy GetSafePoint: map safe_x/safe_y when either is positive, else (100, 100). */
export function portalDataOf(gd: GameDataService): PortalData {
  return {
    gate: (id) => gd.sceneItem(id),
    transportGates: () => gd.transportGates(),
    mapName: (mapId) => {
      const m = gd.getMap(mapId);
      return m ? String(m.name ?? '') : undefined;
    },
    maps: () => gd.listMaps().map((m) => ({ id: Number(m.id), name: String(m.name ?? '') })),
    safePoint: (mapId) => {
      const m = gd.getMap(mapId);
      const x = Math.trunc(Number(m?.safe_x ?? 0));
      const y = Math.trunc(Number(m?.safe_y ?? 0));
      return x > 0 || y > 0 ? { x, y } : { x: 100, y: 100 };
    },
  };
}
