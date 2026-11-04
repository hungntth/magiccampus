// Client character state + flows: the "Nhân vật" panel (C key / HUD button), changeProperty (OK button, fire-and-forget),
// manual level-up (lvUp from level 20, confirm first), stat-refresh onUPP (the player object is merged by QuestController
// first; this only re-renders) and onSystemMidMsgOrNote (gate / failure messages shown as the toast).
// Must be constructed after QuestController and BagController.

import { AUTO_LEVEL_CAP } from '@mc/shared';
import type { ChangePropertyArg, PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { CharacterPanel } from '../ui/characterPanel';
import { toast } from '../ui/screens';
import type { BagController } from './BagController';

export interface CharacterHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
}

export class CharacterController {
  private readonly panel: CharacterPanel;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: CharacterHost) {
    const bag = host.bag;
    this.panel = new CharacterPanel({
      player: () => host.player,
      equipped: () => bag.equipped(),
      item: (id) => bag.find(id),
      onEquip: (item) => bag.actions.equipOn(item),
      onUnequip: (item) => bag.actions.equipOff(item, -1),
      onAllocate: (add) => this.allocate(add),
      onClose: () => this.panel.close(),
    });
    bag.onChange = () => this.panel.render();
    this.offs.push(
      host.client.on('onUPP', () => this.panel.render()),
      host.client.on('onSystemMidMsgOrNote', (text) => toast(String(text))),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.host.bag.onChange = null;
    this.panel.close();
  }

  /** HUD character button / C key. */
  toggle(): void {
    if (this.panel.isOpen) this.panel.close();
    else this.panel.show();
  }

  /** HUD "Up" button (level >= 20 and exp full): confirm, then lvUp(level, password = null). */
  levelUp(): void {
    if (this.host.player.level < AUTO_LEVEL_CAP) return;
    askConfirm('Xác nhận thăng cấp?', () => {
      void this.host.client.call<boolean>('lvUp', this.host.player.level, null).then(
        (ok) => {
          if (ok && this.host.player.level > AUTO_LEVEL_CAP && !this.panel.isOpen) this.panel.show();
        },
        () => undefined,
      );
    });
  }

  private allocate(add: ChangePropertyArg): void {
    void this.host.client.call('changeProperty', add).catch(() => undefined);
  }
}
