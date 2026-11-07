// Listener registry for worn-equipment changes: EquipmentService calls `changed(characterId, position)` after an equip / unequip commits
// and the lock is released. The appearance module (which imports this module, not the other way round) registers the look pushes.

import { Injectable, Logger } from '@nestjs/common';

type Listener = (characterId: number, position: number) => Promise<void> | void;

@Injectable()
export class EquipHooks {
  private readonly logger = new Logger(EquipHooks.name);
  private readonly listeners: Listener[] = [];

  onChanged(fn: Listener): void {
    this.listeners.push(fn);
  }

  /** Runs every listener; a failing one is logged and never fails the equip. */
  async changed(characterId: number, position: number): Promise<void> {
    for (const fn of this.listeners) {
      try {
        await fn(characterId, position);
      } catch (e) {
        this.logger.warn(`equip hook ${characterId}/${position}: ${(e as Error).message}`);
      }
    }
  }
}
