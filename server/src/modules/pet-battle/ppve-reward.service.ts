// The floor reward item of a PPVE win (carve_award.item_id, quantity 1): into the bag with the usual onAddItem + onAddCharactorSlot
// pushes, or, when the bag is full, as a system mail (the attachment is created on take) so a win never loses its item.
// Callers hold the character lock; the win (free try + KP) is already saved when this runs (spend before credit).

import { Injectable, Logger } from '@nestjs/common';
import { ItemKind } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack, type AddSpec } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { MailSystemService } from '../mail/mail-system.service';

export const PPVE_MAIL = {
  SENDER: 'Không Gian Điêu Khắc',
  TITLE: 'Phần thưởng tầng',
  text: (floor: number, item: string): string => `Túi đồ đã đầy, phần thưởng vượt tầng ${floor} (${item}) được gửi qua thư.`,
} as const;

@Injectable()
export class PpveRewardService {
  private readonly logger = new Logger(PpveRewardService.name);

  constructor(
    private readonly data: GameDataService,
    private readonly inventory: InventoryService,
    private readonly mail: MailSystemService,
  ) {}

  /** Pushes of the credit ([] when the template is unknown or the item went to the mailbox). */
  async grant(characterId: number, floor: number, itemId: number): Promise<Push[]> {
    if (!(itemId > 0)) return [];
    const tpl = await this.data.template(29, itemId);
    if (!tpl) {
      this.logger.warn(`PPVE floor ${floor}: reward item ${itemId} has no template`);
      return [];
    }
    const name = String(tpl.name ?? `#${itemId}`);
    const bound = Number(tpl.bind_type ?? 0) > 0;
    const spec: AddSpec = { templateId: itemId, itemType: ItemKind.ITEM, bound, color: 0, amount: 1, maxStack: maxStack(tpl) };
    if (await this.inventory.canFit(characterId, spec)) {
      try {
        const changed = await this.inventory.add(characterId, spec);
        return [push('onAddItem', { i: itemId, q: 1, t: ItemKind.ITEM, n: name }), ...changed.map((c) => push('onAddCharactorSlot', c))];
      } catch (e) {
        this.logger.warn(`PPVE floor ${floor}: bag add failed (${(e as Error).message}), mailing the item`);
      }
    }
    const sent = await this.mail.sendSystemMail({
      receiverId: characterId, senderName: PPVE_MAIL.SENDER, title: `${PPVE_MAIL.TITLE} ${floor}`, text: PPVE_MAIL.text(floor, name),
      item: { templateId: itemId, table: 29, count: 1, bound }, source: `ppve:${characterId}:${floor}`,
    });
    if (!sent) this.logger.error(`PPVE floor ${floor}: reward item ${itemId} for character ${characterId} was not delivered`);
    return [];
  }
}
