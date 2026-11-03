// Walkability mask extracted from the old MAP_HIT_NEW.swf (tools/swf/cmd/swfhit):
// 1 bit per pixel, row-major, bit set = walkable. Grid may be slightly larger than the map image.

import { decodeResCode } from '@mc/shared';

export class HitMask {
  private constructor(
    readonly width: number,
    readonly height: number,
    private readonly bits: Uint8Array,
  ) {}

  static async load(mapResCode: string): Promise<HitMask | null> {
    const folder = decodeResCode(mapResCode).path;
    if (!folder) return null;
    try {
      const metaRes = await fetch(`/sheets/${folder}/hit.json`);
      if (!metaRes.ok) return null;
      const meta = (await metaRes.json()) as { w: number; h: number };
      const binRes = await fetch(`/sheets/${folder}/hit.bin`);
      if (!binRes.ok) return null;
      const bits = new Uint8Array(await binRes.arrayBuffer());
      if (!meta.w || !meta.h) return null;
      return new HitMask(meta.w, meta.h, bits);
    } catch {
      return null;
    }
  }

  isWalkable(x: number, y: number): boolean {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return false;
    const i = iy * this.width + ix;
    const byte = this.bits[i >> 3];
    if (byte === undefined) return false;
    return (byte & (1 << (i & 7))) !== 0;
  }

  nearestWalkable(x: number, y: number, radius = 40): { x: number; y: number } | null {
    if (this.isWalkable(x, y)) return { x, y };
    for (let r = 4; r <= radius; r += 4) {
      for (let a = 0; a < 16; a++) {
        const px = Math.round(x + Math.cos((a / 16) * Math.PI * 2) * r);
        const py = Math.round(y + Math.sin((a / 16) * Math.PI * 2) * r);
        if (this.isWalkable(px, py)) return { x: px, y: py };
      }
    }
    return null;
  }
}
