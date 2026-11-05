// Map-side encounter trigger split out of BattleController: sends cbom once the player walked >= 100 px from the last
// check point (PlayerView.CHECK_DIS), at most once per second (RPCConfig RPC_DELAY["cbom"]).

import type { GameClient } from '../../net/client';

const CHECK_DISTANCE = 100;
const CBOM_THROTTLE_MS = 1000;

export class EncounterWalk {
  private lastCheck = { x: 0, y: 0 };
  /** Last walked position (the player object is not updated by moves). */
  pos = { x: 0, y: 0 };
  private lastCbom = -Infinity;

  constructor(private readonly client: () => GameClient) {}

  setCheckPoint(x: number, y: number): void {
    this.lastCheck = { x, y };
  }

  /** `blocked`: battle / revive open, safe map or dead player — no encounter check. */
  onWalking(x: number, y: number, blocked: boolean): void {
    this.pos = { x, y };
    if (blocked) return;
    if (Math.hypot(x - this.lastCheck.x, y - this.lastCheck.y) < CHECK_DISTANCE) return;
    const now = performance.now();
    if (now - this.lastCbom < CBOM_THROTTLE_MS) return;
    this.lastCbom = now;
    void this.client().call('cbom', Math.round(x), Math.round(y)).catch(() => undefined);
  }
}
