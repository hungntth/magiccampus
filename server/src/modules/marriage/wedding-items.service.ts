// Item plumbing of the wedding flows (M14 phase E): gifts to a partner or guest (bag first, system mail when the bag is full so a
// ring or gift bag is never lost), cards delivered to friends (bag only), and the consume / take-back of one bag unit with the
// slot pushes. Every bag write runs under that character's lock, one character at a time (never nested): see wedding-invites.
// The couple gift bags 1687-1689 open into invitation cards through the item-use registry (lock-free handler: the caller holds
// the bag lock).

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WEDDING_ITEMS, WEDDING_TEXT, type BagItem } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import type { Push } from '../inventory/pushes';
import { ItemUseRegistry } from '../item-use/item-use.registry';
import { note } from '../item-use/open-helpers';
import { PushCollector } from '../item-use/push-collector';
import { MailSystemService } from '../mail/mail-system.service';
import { GrantService, type Grant } from '../rewards/grant.service';
import type { PushSink } from '../rewards/push-sink';
import { MarriagePush } from './marriage-push.service';

const MAIL_TITLE = 'Quà hôn lễ';
const MAIL_TEXT = 'Hành trang của bạn đã đầy nên vật phẩm hôn lễ được gửi qua thư, hãy nhận trong hòm thư.';

/** Sink of an offline receiver: the pushes have nobody to go to. */
const silent = (characterId: number): PushSink => ({ characterId, callback: () => undefined });

@Injectable()
export class WeddingItems implements OnModuleInit {
  private readonly logger = new Logger(WeddingItems.name);

  constructor(
    private readonly grants: GrantService,
    private readonly inventory: InventoryService,
    private readonly mail: MailSystemService,
    private readonly push: MarriagePush,
    private readonly registry: ItemUseRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.addTemplate(WEDDING_ITEMS.giftBags, (ctx) => this.openGiftBag(ctx.characterId, ctx.templateId, ctx.bound, () => ctx.consume()));
  }

  private grantOf(templateId: number, qty: number): Grant {
    return { kind: 'item', table: 29, templateId, qty, bound: true };
  }

  /** The character's own session when online, else a silent sink. */
  private sink(characterId: number): PushSink {
    return this.push.session(characterId) ?? silent(characterId);
  }

  /** Gives items: into the bag when they fit (with the gain pushes), else as a system mail keyed by `source` (idempotent). */
  async give(characterId: number, templateId: number, qty: number, source: string): Promise<'bag' | 'mail' | 'lost'> {
    const where = await withCharLock(characterId, async () => {
      const g = [this.grantOf(templateId, qty)];
      if (!(await this.grants.fits(characterId, g))) return 'full' as const;
      return (await this.grants.grant(this.sink(characterId), g)) ? ('bag' as const) : ('full' as const);
    });
    if (where === 'bag') return 'bag';
    const sent = await this.mail.sendSystemMail({
      receiverId: characterId, title: MAIL_TITLE, text: MAIL_TEXT, item: { templateId, table: 29, count: qty, bound: true }, source,
    });
    if (!sent) this.logger.error(`wedding item ${templateId} x${qty} for ${characterId} could not be delivered (${source})`);
    return sent ? 'mail' : 'lost';
  }

  /** Bag-only delivery (invitation cards): false when the bag has no room. */
  giveIfFits(characterId: number, templateId: number, qty: number): Promise<boolean> {
    return withCharLock(characterId, async () => {
      const g = [this.grantOf(templateId, qty)];
      if (!(await this.grants.fits(characterId, g))) return false;
      return this.grants.grant(this.sink(characterId), g);
    });
  }

  /** The bag item `itemId` of the character (a peek, no lock), or null. */
  async peek(characterId: number, itemId: number): Promise<BagItem | null> {
    return (await this.inventory.byIds(characterId, [itemId]))[0] ?? null;
  }

  /** Consumes one unit of a bag stack (conditional): pushes the slot update to the owner. False when the stack is gone. */
  consumeOne(characterId: number, item: BagItem): Promise<boolean> {
    return withCharLock(characterId, async () => {
      const r = await this.inventory.consumeStack(characterId, item.id, 1);
      if (!r) return false;
      const s = this.push.session(characterId);
      if (r.left > 0) {
        const [fresh] = await this.inventory.byIds(characterId, [item.id]);
        if (fresh) s?.callback('onAddCharactorSlot', fresh);
      } else {
        s?.callback('onDelCharactorSlot', item.id, r.sid);
      }
      return true;
    });
  }

  /** Takes one unit of a template back (a delivery that could not be completed). Best effort, logged on failure. */
  takeBack(characterId: number, templateId: number): Promise<void> {
    return withCharLock(characterId, async () => {
      try {
        const r = await this.inventory.removeByTemplate(characterId, templateId, 1);
        const s = this.push.session(characterId);
        for (const u of r.updated) s?.callback('onAddCharactorSlot', u);
        for (const d of r.deleted) s?.callback('onDelCharactorSlot', d.id, d.sid);
      } catch (e) {
        this.logger.warn(`takeBack ${templateId} from ${characterId} failed: ${(e as Error).message}`);
      }
    });
  }

  /** Couple gift bag: N invitation cards of its tier (the candy boxes and the outfit are celebration extras, not ported). */
  private async openGiftBag(characterId: number, templateId: number, bound: boolean, consume: () => Promise<Push[]>): Promise<Push[] | null> {
    const cards = WEDDING_ITEMS.giftBagCards[templateId];
    const card = WEDDING_ITEMS.invites[(WEDDING_ITEMS.giftBags as readonly number[]).indexOf(templateId)];
    if (cards === undefined || card === undefined) return null;
    const g: Grant[] = [{ kind: 'item', table: 29, templateId: card, qty: cards, bound }];
    if (!(await this.grants.fits(characterId, g))) return [note(WEDDING_TEXT.bagFull)];
    const slot = await consume();
    const out = new PushCollector(characterId);
    await this.grants.grant(out, g);
    return [...slot, ...out.pushes, { m: 'onSystemSay', a: [WEDDING_TEXT.cardsOpened(cards)] }];
  }

  /** Session lookup for flows that push lines. */
  sessionOf(characterId: number): Session | undefined {
    return this.push.session(characterId);
  }
}
