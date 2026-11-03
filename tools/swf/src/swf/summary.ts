// Tag-level summary: sprite ids with frame counts and labels, exported symbol names,
// per-tag-type counts, and whether the file carries ActionScript (DoABC / DoAction).

import { cstring, readTags, u16, type SwfFile, type Tag as SwfTag } from './reader.js';
import { BITMAP_TAGS, SHAPE_TAGS, Tag, TAG_NAMES } from './tags.js';

// Field order and optional (omitted when empty) fields mirror the JSON the Go tool printed.
export interface SpriteInfo {
  id: number;
  frameCount: number;
  labels?: string[];
  children?: number[];
  name?: string;
}

export interface Summary {
  version: number;
  frameRate: number;
  frameCount: number;
  width: number;
  height: number;
  hasAbc: boolean;
  hasAs2: boolean;
  mainLabels?: string[];
  mainPlaced?: number[];
  symbols?: Map<number, string>;
  sprites: SpriteInfo[] | null;
  tagCounts: Map<string, number>;
  shapeIds?: number[];
  bitmapIds?: number[];
  morphIds?: number[];
}

export function summarize(f: SwfFile): Summary {
  const symbols = new Map<number, string>();
  const tagCounts = new Map<string, number>();
  const mainLabels: string[] = [];
  const mainPlaced: number[] = [];
  const shapeIds: number[] = [];
  const bitmapIds: number[] = [];
  const morphIds: number[] = [];
  const sprites: SpriteInfo[] = [];
  let hasAbc = false;
  let hasAs2 = false;
  for (const t of f.tags) {
    const name = TAG_NAMES[t.code] ?? 'Unknown';
    tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
    if (SHAPE_TAGS.includes(t.code)) {
      shapeIds.push(u16(t.data, 0));
      continue;
    }
    if (BITMAP_TAGS.includes(t.code)) {
      bitmapIds.push(u16(t.data, 0));
      continue;
    }
    switch (t.code) {
      case Tag.DoABC:
        hasAbc = true;
        break;
      case Tag.DoAction:
        hasAs2 = true;
        break;
      case Tag.FrameLabel:
        mainLabels.push(cstring(t.data)[0]);
        break;
      case Tag.PlaceObject2:
      case Tag.PlaceObject3: {
        const id = placedCharacterId(t);
        if (id > 0) mainPlaced.push(id);
        break;
      }
      case Tag.ExportAssets:
      case Tag.SymbolClass: {
        if (t.data.length < 2) break;
        const n = u16(t.data, 0);
        let pos = 2;
        for (let i = 0; i < n && pos + 2 <= t.data.length; i++) {
          const id = u16(t.data, pos);
          pos += 2;
          const [sym, adv] = cstring(t.data.subarray(pos));
          pos += adv;
          symbols.set(id, sym);
        }
        break;
      }
      case Tag.DefineMorphShape:
      case Tag.DefineMorphShape2:
        morphIds.push(u16(t.data, 0));
        break;
      case Tag.DefineSprite: {
        if (t.data.length < 4) break;
        const labels: string[] = [];
        const children: number[] = [];
        for (const it of readTags(t.data.subarray(4)).tags) {
          if (it.code === Tag.FrameLabel) {
            labels.push(cstring(it.data)[0]);
          } else if (it.code === Tag.PlaceObject2 || it.code === Tag.PlaceObject3) {
            const id = placedCharacterId(it);
            if (id > 0 && !children.includes(id)) children.push(id);
          }
        }
        sprites.push({
          id: u16(t.data, 0),
          frameCount: u16(t.data, 2),
          labels: orUndef(labels),
          children: orUndef(children),
        });
        break;
      }
    }
  }
  for (const s of sprites) s.name = symbols.get(s.id) || undefined;
  sprites.sort((a, b) => a.id - b.id);
  return {
    version: f.version,
    frameRate: f.frameRate,
    frameCount: f.frameCount,
    width: f.width,
    height: f.height,
    hasAbc,
    hasAs2,
    mainLabels: orUndef(mainLabels),
    mainPlaced: orUndef(mainPlaced),
    symbols: symbols.size ? symbols : undefined,
    sprites: sprites.length ? sprites : null,
    tagCounts,
    shapeIds: orUndef(shapeIds),
    bitmapIds: orUndef(bitmapIds),
    morphIds: orUndef(morphIds),
  };
}

function orUndef<T>(a: T[]): T[] | undefined {
  return a.length ? a : undefined;
}

function placedCharacterId(t: SwfTag): number {
  const d = t.data;
  if (d.length < 3) return 0;
  const flags = d[0];
  let pos = t.code === Tag.PlaceObject3 ? 2 : 1;
  pos += 2;
  if (!(flags & 0x02)) return 0;
  if (t.code === Tag.PlaceObject3 && d[1] & 0x08) pos += cstring(d.subarray(pos))[1];
  if (pos + 2 > d.length) return 0;
  return u16(d, pos);
}
