// In-game HUD (legacy MainLayer): portraits, minimap strip, menu bar and shortcut bar. Chat is ChatBox (ui/chat.ts).
// Call loadSkins() once before constructing it.

import type { PlayerData } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { MiniMapCanvas } from './miniMap';
import { PetCanvas, PortraitCanvas } from './portrait';
import { SystemBar } from './systemBar';
import { UserBar } from './userBar';
import './hud.css';

export class MainHud {
  private readonly portrait: PortraitCanvas;
  private readonly miniMap: MiniMapCanvas;
  private readonly systemBar: SystemBar;

  constructor(parent: HTMLElement, client: GameClient, typing: () => boolean) {
    this.portrait = new PortraitCanvas(parent);
    new PetCanvas(parent);
    this.miniMap = new MiniMapCanvas(parent, client);
    new UserBar(parent);
    this.systemBar = new SystemBar(parent, typing);
  }

  destroy(): void {
    this.miniMap.destroy();
    this.systemBar.destroy();
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
