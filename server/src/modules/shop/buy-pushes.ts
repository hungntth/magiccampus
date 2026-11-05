// Pushes after a successful shop purchase (NPC shop and mall share them), legacy order:
// onBlueMsg, onUPP, onAddItem, then onAddCharactorSlot per changed slot.

import type { Session } from '../../gateway/session';
import type { BuyResult } from './shop.service';

export function pushBuy(session: Session, r: BuyResult): void {
  session.callback('onBlueMsg', `Mua thành công x${r.amount}! Mất ${r.costText ?? `${r.cost} ${r.currencyName}`}.`);
  session.callback('onUPP', r.update);
  session.callback('onAddItem', r.notice);
  for (const item of r.changed) session.callback('onAddCharactorSlot', item);
}
