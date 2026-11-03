// Bag RPC: getInitSlot (login bag snapshot keyed by item id). Item changes are pushed by the shop flows.

import { Injectable } from '@nestjs/common';
import type { GetInitSlotReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryRpc {
  constructor(private readonly inventory: InventoryService) {}

  @Rpc('getInitSlot', { requireCharacter: true })
  async getInitSlot(session: Session): Promise<GetInitSlotReply> {
    const out: GetInitSlotReply = {};
    for (const item of await this.inventory.list(session.characterId!)) out[String(item.id)] = item;
    return out;
  }
}
