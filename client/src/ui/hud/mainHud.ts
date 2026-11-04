// In-game HUD (legacy MainLayer): portraits, minimap strip, buff bar, menu bar and shortcut bar. Chat is ChatBox (ui/chat.ts).
// Call loadSkins() once before constructing it.

import type { MapInfo, PetView, PlayerData } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { BuffBar } from './buffBar';
import { MiniMapCanvas } from './miniMap';
import { PetCanvas } from './petCanvas';
import { PortraitCanvas } from './portrait';
import { SystemBar } from './systemBar';
import { UserBar } from './userBar';
import './hud.css';

export interface HudActions {
  onBag(): void;
  onCharacter(): void;
  onFriend(): void;
  /** E key / HUD union button (guild window). */
  onGuild(): void;
  /** HUD "Shop" button (mall). */
  onShop(): void;
  /** HUD red function column "Chế tạo" (forge window). */
  onForge(tab?: string): void;
  /** HUD btnRank (ranking window, legacy PANEL_ACTIVE). */
  onRank(): void;
  /** R key / HUD achievement button (achievement window). */
  onAchieve(): void;
  /** HUD "Hoạt động hằng ngày" button (diary window). */
  onDaily(): void;
  /** HUD VIP button (VIP window). */
  onVip(): void;
  /** A key / HUD PK button: arms the PK click mode. */
  onPk(): void;
  /** W key / HUD pet button / pet icon. */
  onPet(): void;
  onLevelUp(): void;
  /** HP / MP bar click. */
  onRecover(kind: 'hp' | 'mp'): void;
}

export class MainHud {
  private readonly portrait: PortraitCanvas;
  private readonly miniMap: MiniMapCanvas;
  private readonly systemBar: SystemBar;
  private readonly buffBar: BuffBar;
  private readonly petCanvas: PetCanvas;
  private pkInit = false;

  constructor(parent: HTMLElement, client: GameClient, typing: () => boolean, actions: HudActions) {
    this.portrait = new PortraitCanvas(parent, actions);
    this.petCanvas = new PetCanvas(parent, actions.onPet);
    this.buffBar = new BuffBar(parent, client);
    this.miniMap = new MiniMapCanvas(parent, client, actions.onShop, actions.onForge, actions.onRank);
    new UserBar(parent);
    this.systemBar = new SystemBar(parent, typing, actions.onBag, actions.onCharacter, actions.onFriend, actions.onPet, actions.onGuild, actions.onPk, actions.onAchieve, actions.onDaily);
  }

  destroy(): void {
    this.miniMap.destroy();
    this.systemBar.destroy();
    this.buffBar.destroy();
  }

  setPlayer(p: PlayerData): void {
    this.portrait.update(p);
    if (!this.pkInit) {
      this.pkInit = true;
      this.miniMap.initPk(p.apvp === true); // the login payload carries the saved opt-in
    }
  }

  setBattlePet(p: PetView | null): void {
    this.petCanvas.setPet(p);
  }

  setMap(name: string, info?: MapInfo): void {
    this.miniMap.setMap(name, info);
  }

  setPosition(x: number, y: number): void {
    this.miniMap.setPosition(x, y);
  }
}
