// "Tín hiệu" / "Tự cứu" (legacy UserSystemSetPanel + HelpPanel, M9 phase G): confirm, a 20 s wait note, then toMovable().
// The server moves the player to the map's safe point and answers with onSceneEnter.

import { SYSTEM_TEXT, UNSTUCK_WAIT_MS } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from './confirmDialog';
import { toast } from './screens';

let pending = false;

export function askUnstuck(client: GameClient): void {
  if (pending) return void toast(SYSTEM_TEXT.UNSTUCK_WAIT);
  askConfirm(SYSTEM_TEXT.UNSTUCK_CONFIRM, () => {
    pending = true;
    toast(SYSTEM_TEXT.UNSTUCK_WAIT, false, 5000);
    setTimeout(() => {
      pending = false;
      void client.call('toMovable').catch((e) => toast((e as Error).message, true));
    }, UNSTUCK_WAIT_MS);
  });
}
