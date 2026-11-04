// PK click mode (legacy ACTION_PK): the system-bar PK button / A key arms it, the next click on another player runs the client safe-area
// test (TBL_MAP.sArea against the target position, "Mục tiêu trong khu vực an toàn, không thể PK") and sends PVPStartClient(targetCid).
// The server re-checks everything (apvp, forced PvP maps, distance, party, battle) and refuses with a toast. Esc / a timeout disarms it.

import { inSafeArea, parseSafeAreas, PK_NOTES, type MapInfo } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { stageEl } from '../ui/stage';
import type { Entity } from './Entity';

const ARM_TIMEOUT_MS = 10_000;

export interface PkHost {
  client: GameClient;
  mapInfo(): MapInfo | null;
  /** True while the map is blocked (battle). */
  locked(): boolean;
}

export class PkController {
  private armed = false;
  private timer: number | null = null;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.cancel();
  };

  constructor(private readonly host: PkHost) {}

  /** True while the next player click is a PK attack. */
  get active(): boolean {
    return this.armed;
  }

  /** PK button / A key: arms the click mode (pressing it again disarms). */
  begin(): void {
    if (this.armed) return this.cancel();
    if (this.host.locked()) return toast(PK_NOTES.IN_BATTLE, true);
    this.armed = true;
    stageEl().style.cursor = 'crosshair';
    window.addEventListener('keydown', this.onKey);
    this.timer = window.setTimeout(() => this.cancel(), ARM_TIMEOUT_MS);
    toast(PK_NOTES.SELECT_TARGET);
  }

  /** CharactorView.actionOnCreature(ACTION_PK): safe-area test on the clicked view, then PVPStartClient. */
  click(target: Entity): void {
    this.cancel();
    if (inSafeArea(parseSafeAreas(this.host.mapInfo()?.sArea), target.x, target.y)) {
      toast(PK_NOTES.SAFE_AREA, true);
      return;
    }
    this.host.client.call('PVPStartClient', target.entityId).catch((e) => toast((e as Error).message, true));
  }

  cancel(): void {
    if (!this.armed) return;
    this.armed = false;
    stageEl().style.cursor = '';
    window.removeEventListener('keydown', this.onKey);
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}
