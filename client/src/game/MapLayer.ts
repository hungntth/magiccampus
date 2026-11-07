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

/** Tile grid of a map: cell size, row step, counts and the map-pixel origin of a cell. */
class MapGrid {
  readonly cellW: number;
  readonly cellH = 100;

  constructor(private readonly info: MapInfo) {
    this.cellW = info.type === MAP_TYPE_TILE ? 200 : 100;
  }

  get rowHeight(): number {
    return this.info.type === MAP_TYPE_TILE ? this.cellH / 2 : this.cellH;
  }

  get cols(): number {
    return Math.ceil(this.info.width / this.cellW) + (this.info.type === MAP_TYPE_TILE ? 1 : 0);
  }

  get rows(): number {
    return Math.ceil(this.info.height / this.rowHeight);
  }

  origin(col: number, row: number): { x: number; y: number } {
    if (this.info.type !== MAP_TYPE_TILE) return { x: col * this.cellW, y: row * this.cellH };
    const x = row % 2 === 0 ? col * this.cellW - this.cellW / 2 : col * this.cellW;
    return { x, y: (row * this.cellH) / 2 };
  }
}

export interface MapCell {
  url: string;
  x: number;
  y: number;
}

/** Every background image of a map with its map-pixel origin (the area map draws them scaled down). */
export function mapCells(info: MapInfo): MapCell[] {
  if (info.type === MAP_TYPE_SINGLE) return [{ url: mapTileUrl(info.resCode, 0, 0), x: 0, y: 0 }];
  const grid = new MapGrid(info);
  const out: MapCell[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) out.push({ url: mapTileUrl(info.resCode, c, r), ...grid.origin(c, r) });
  }
  return out;
}

export class MapLayer extends Container {
  private readonly loaded = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly grid: MapGrid;

  constructor(readonly info: MapInfo) {
    super();
    this.grid = new MapGrid(info);
  }

  async loadInitial(): Promise<void> {
    if (this.info.type === MAP_TYPE_SINGLE) {
      await this.loadCell(0, 0, 0, 0);
    }
  }

  updateVisible(viewX: number, viewY: number, viewW: number, viewH: number): void {
    if (this.info.type === MAP_TYPE_SINGLE) return;
    const g = this.grid;
    const margin = 1;
    const c0 = Math.max(0, Math.floor(viewX / g.cellW) - margin);
    const r0 = Math.max(0, Math.floor(viewY / g.rowHeight) - margin);
    const c1 = Math.min(g.cols - 1, Math.ceil((viewX + viewW) / g.cellW) + margin);
    const r1 = Math.min(g.rows - 1, Math.ceil((viewY + viewH) / g.rowHeight) + margin);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const { x, y } = g.origin(c, r);
        void this.loadCell(c, r, x, y);
      }
    }
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
