// Divorce by card (item 122 Thẻ Ly Hôn, Flash `useGoodCard()` after the PLAYER_S[24] confirm). Order (plan decision 7): the card
// is checked, the marriage is ended FIRST, then the card is consumed, all under the caller's bag lock; the pushes follow outside it
// (TitleService.revoke takes the character lock itself). Single -> "Bạn chưa kết hôn."; no card -> refusal.

import { Injectable } from '@nestjs/common';
import { MARRIAGE, MARRIAGE_TEXT } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { MarriageService } from './marriage.service';

@Injectable()
export class MarriageDivorceService {
  constructor(
    private readonly marriages: MarriageService,
    private readonly inventory: InventoryService,
  ) {}

  async useCard(session: Session): Promise<null> {
    const cid = session.characterId!;
    if (!(await this.marriages.isMarried(cid))) throw RpcException.forbidden(MARRIAGE_TEXT.single);
    const ended = await withCharLock(cid, async () => {
      const have = (await this.inventory.countByTemplate(cid, [MARRIAGE.divorceCardTid])).get(MARRIAGE.divorceCardTid) ?? 0;
      if (have < 1) throw RpcException.forbidden(MARRIAGE_TEXT.noCard);
      const result = await this.marriages.endMarriage(cid);
      if (!result) throw RpcException.forbidden(MARRIAGE_TEXT.single);
      const spent = await this.inventory.removeByTemplate(cid, MARRIAGE.divorceCardTid, 1);
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      return result;
    });
    await this.marriages.announceEnded(ended, cid);
    return null;
  }
}
