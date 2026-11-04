// Guild buildings on the guild map (49): createGuildBuildings -> one Entity per lot / building (the building template art is a
// creature-style sheet, resolved by the server to the chain's level-1 SWF; no sheet = the circle placeholder). Click = legacy
// BuildingView: clickBuild(id, type) -> popup menu -> execBuildFunc(func, bid, type). onCreateBuild / reloadBuild upsert one object.

import type { Container, FederatedPointerEvent } from 'pixi.js';
import type { BuildMenuItem, BuildingObj } from '@mc/shared';
import type { GameClient } from '../net/client';
import { PopupMenu } from '../ui/playerMenu';
import { toast } from '../ui/screens';
import { Entity } from './Entity';

export class GuildBuildingLayer {
  private readonly views = new Map<number, { obj: BuildingObj; entity: Entity }>();
  private readonly menu = new PopupMenu();
  private generation = 0;
  private active = false; // true while the loaded map is the guild map (a non-empty building list came back)

  constructor(private readonly client: GameClient, private readonly layer: Container) {}

  /** Loads the lots of the current map (the server answers [] off the guild map or without a guild). */
  async load(): Promise<void> {
    const gen = ++this.generation;
    const list = await this.client.call<BuildingObj[]>('createGuildBuildings').catch(() => [] as BuildingObj[]);
    if (gen !== this.generation) return;
    this.active = list.length > 0;
    for (const obj of list) this.upsert(obj);
  }

  clear(): void {
    this.generation++;
    this.active = false;
    this.menu.close();
    for (const v of this.views.values()) v.entity.destroy({ children: true });
    this.views.clear();
  }

  tick(dt: number): void {
    for (const v of this.views.values()) v.entity.tick(dt);
  }

  /** Adds or replaces a building (onCreateBuild / reloadBuild); ignored while no guild map is loaded. */
  upsert(obj: BuildingObj): void {
    if (!this.active) return;
    this.views.get(obj.id)?.entity.destroy({ children: true });
    const entity = new Entity(-obj.id, 'npc', obj.name || 'Đất trống', '0', obj.resCode, obj.posX, obj.posY, obj.posDir);
    entity.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      void this.click(obj, e.clientX, e.clientY);
    });
    this.layer.addChild(entity);
    this.views.set(obj.id, { obj, entity });
  }

  /** Test / debug access: the building objects currently drawn. */
  objects(): BuildingObj[] {
    return [...this.views.values()].map((v) => v.obj);
  }

  private async click(obj: BuildingObj, x: number, y: number): Promise<void> {
    try {
      const items = await this.client.call<BuildMenuItem[]>('clickBuild', obj.id, obj.buildType);
      this.menu.show(obj.name || 'Đất trống', items.map((i): [string, () => void] => [i.name, () => this.exec(i, obj)]), x, y, String(obj.id));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  private exec(item: BuildMenuItem, obj: BuildingObj): void {
    void this.client.call('execBuildFunc', item.func, item.bid, obj.buildType).catch((e) => toast((e as Error).message, true));
  }
}
