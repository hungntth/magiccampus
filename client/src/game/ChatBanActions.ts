// Player-paid chat ban flow (M14 G, Flash LINKEVENTUTIL_S[3]): checkPlayerIsBaned(id, name) -> true = stop (the server already
// pushed a note); false = confirm, then banChatByPlayer(id, name, '', hours?) with hours omitted for 20 min or 12 for 12 h.

import { CHAT_BAN } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';

export function banChatFlow(client: GameClient, target: { id: number; name: string }, long: boolean): void {
  const fail = (e: unknown): void => toast((e as Error).message, true);
  client.call<boolean>('checkPlayerIsBaned', target.id, target.name).then((stop) => {
    if (stop) return;
    const when = long ? '12 giờ' : '20 phút';
    askConfirm(`Xác nhận tốn ${CHAT_BAN.priceGold} vàng để cấm chat ${target.name} trong ${when}？`, () => {
      const call = long ? client.call('banChatByPlayer', target.id, target.name, '', 12) : client.call('banChatByPlayer', target.id, target.name, '');
      call.catch(fail); // the result note arrives as onSystemMidMsgOrNote
    });
  }, fail);
}
