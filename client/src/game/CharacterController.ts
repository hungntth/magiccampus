// Client character state + flows: the "Nhân vật" panel (C key / HUD button), changeProperty (OK button, fire-and-forget),
// manual level-up (lvUp from level 20, confirm first), stat-refresh onUPP (the player object is merged by QuestController
// first; this only re-renders). Server text pushes (onSystemMidMsgOrNote, ...) are handled by BagController.
// Must be constructed after QuestController and BagController.

import { AUTO_LEVEL_CAP } from '@mc/shared';
import type { ChangePropertyArg, PlayerData, SceneCharacter } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { CharacterPanel } from '../ui/characterPanel';
import type { BagController } from './BagController';
import { AchievementController } from './AchievementController';
import { FeatureController } from './FeatureController';
import { MagicWeaponController } from './MagicWeaponController';
import type { Entity } from './Entity';
import { TitleController } from './TitleController';

export interface CharacterHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
  entityOf(id: number): Entity | undefined;
}

export class CharacterController {
  private readonly panel: CharacterPanel;
  private readonly titles: TitleController;
  private readonly achievements: AchievementController;
  private readonly features: FeatureController;
  private readonly magicWeapon: MagicWeaponController;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: CharacterHost) {
    const bag = host.bag;
    this.achievements = new AchievementController(host.client, host.player);
    this.features = new FeatureController(host.client, host.player);
    this.magicWeapon = new MagicWeaponController({
      client: host.client, player: host.player, items: () => [...bag.list(), ...bag.equipped().values()],
    });
    this.titles = new TitleController({ client: host.client, player: host.player, entityOf: host.entityOf, changed: () => this.panel.render() });
    this.panel = new CharacterPanel({
      player: () => host.player,
      equipped: () => bag.equipped(),
      item: (id) => bag.find(id),
      onEquip: (item) => bag.actions.equipOn(item),
      onUnequip: (item) => bag.actions.equipOff(item, -1),
      onAllocate: (add) => this.allocate(add),
      onTitles: () => this.titles.toggle(),
      onFeatures: () => this.features.toggle(),
      onMagicWeapon: () => this.magicWeapon.toggle(),
      onRepairMagicWeapons: () => this.magicWeapon.repairWorn(),
      onClose: () => this.panel.close(),
    });
    bag.onChange = () => {
      this.panel.render();
      this.magicWeapon.refresh();
    };
    this.offs.push(host.client.on('onUPP', () => this.panel.render()));
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.host.bag.onChange = null;
    this.titles.destroy();
    this.achievements.destroy();
    this.features.destroy();
    this.magicWeapon.destroy();
    this.panel.close();
  }

  /** Scene payload of self or a peer: draws its title nameplates. */
  applyTitles(entity: Entity, sc: Pick<SceneCharacter, 'id' | 'tv' | 'atv'>): void {
    this.titles.apply(entity, sc);
  }

  /** HUD character button / C key. */
  toggle(): void {
    if (this.panel.isOpen) this.panel.close();
    else this.panel.show();
  }

  /** HUD achievement button / R key. */
  toggleAchievements(): void {
    this.achievements.toggle();
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
