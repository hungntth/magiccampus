// In-game HUD (legacy MainLayer): portraits, minimap strip, buff bar, menu bar and shortcut bar. Chat is ChatBox (ui/chat.ts).
// Call loadSkins() once before constructing it.

import type { PlayerData } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { BuffBar } from './buffBar';
import { MiniMapCanvas } from './miniMap';
import { PetCanvas, PortraitCanvas } from './portrait';
import { SystemBar } from './systemBar';
import { UserBar } from './userBar';
import './hud.css';

export interface HudActions {
  onBag(): void;
  onCharacter(): void;
  onLevelUp(): void;
  /** HP / MP bar click. */
  onRecover(kind: 'hp' | 'mp'): void;
}

export class MainHud {
  private readonly portrait: PortraitCanvas;
  private readonly miniMap: MiniMapCanvas;
  private readonly systemBar: SystemBar;
  private readonly buffBar: BuffBar;

  constructor(parent: HTMLElement, client: GameClient, typing: () => boolean, actions: HudActions) {
    this.portrait = new PortraitCanvas(parent, actions);
    new PetCanvas(parent);
    this.buffBar = new BuffBar(parent, client);
    this.miniMap = new MiniMapCanvas(parent, client);
    new UserBar(parent);
    this.systemBar = new SystemBar(parent, typing, actions.onBag, actions.onCharacter);
  }

  destroy(): void {
    this.miniMap.destroy();
    this.systemBar.destroy();
    this.buffBar.destroy();
  }

  setPlayer(p: PlayerData): void {
    this.portrait.update(p);
  }

  setMap(name: string): void {
    this.miniMap.setMap(name);
  }

  setPosition(x: number, y: number): void {
    this.miniMap.setPosition(x, y);
  }
}
