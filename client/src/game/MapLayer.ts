// Draws a map background from the old asset cache, replicating MapContainer.as:
//   type 2 (SINGLE): one image  MAP_0_0.jpg
//   type 1 (NORMAL): 100x100 tiles MAP_<col>_<row>.jpg, only the ones near the camera are loaded
//   type 0 (TILE):   200x100 staggered tiles (odd rows shifted by half a cell)

import { Assets, Container, Sprite, Texture } from 'pixi.js';
import type { MapInfo } from '@mc/shared';
import { mapTileUrl } from '../assets';

const MAP_TYPE_TILE = 0;
const MAP_TYPE_NORMAL = 1;
const MAP_TYPE_SINGLE = 2;

export class MapLayer extends Container {
  private readonly loaded = new Set<string>();
  private readonly failed = new Set<string>();
  private cellW = 100;
  private cellH = 100;

  constructor(readonly info: MapInfo) {
    super();
    if (info.type === MAP_TYPE_TILE) {
      this.cellW = 200;
      this.cellH = 100;
    }
  }

  async loadInitial(): Promise<void> {
    if (this.info.type === MAP_TYPE_SINGLE) {
      await this.loadCell(0, 0, 0, 0);
    }
  }

  updateVisible(viewX: number, viewY: number, viewW: number, viewH: number): void {
    if (this.info.type === MAP_TYPE_SINGLE) return;
    const margin = 1;
    const c0 = Math.max(0, Math.floor(viewX / this.cellW) - margin);
    const r0 = Math.max(0, Math.floor(viewY / this.rowHeight) - margin);
    const c1 = Math.min(this.cols - 1, Math.ceil((viewX + viewW) / this.cellW) + margin);
    const r1 = Math.min(this.rows - 1, Math.ceil((viewY + viewH) / this.rowHeight) + margin);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const { x, y } = this.cellOrigin(c, r);
        void this.loadCell(c, r, x, y);
      }
    }
  }

  private get cols(): number {
    return Math.ceil(this.info.width / this.cellW) + (this.info.type === MAP_TYPE_TILE ? 1 : 0);
  }

  private get rows(): number {
    return Math.ceil(this.info.height / this.rowHeight);
  }

  private get rowHeight(): number {
    return this.info.type === MAP_TYPE_TILE ? this.cellH / 2 : this.cellH;
  }

  private cellOrigin(col: number, row: number): { x: number; y: number } {
    if (this.info.type === MAP_TYPE_NORMAL) return { x: col * this.cellW, y: row * this.cellH };
    const x = row % 2 === 0 ? col * this.cellW - this.cellW / 2 : col * this.cellW;
    return { x, y: (row * this.cellH) / 2 };
  }

  private async loadCell(col: number, row: number, x: number, y: number): Promise<void> {
    const key = `${col}_${row}`;
    if (this.loaded.has(key) || this.failed.has(key)) return;
    this.loaded.add(key);
    const url = mapTileUrl(this.info.resCode, col, row);
    try {
      const texture = (await Assets.load<Texture>({ src: url, loadParser: 'loadTextures' })) as Texture;
      if (this.destroyed) return;
      const sprite = new Sprite(texture);
      sprite.position.set(x, y);
      this.addChild(sprite);
    } catch {
      this.loaded.delete(key);
      this.failed.add(key);
    }
  }
}
