// Plays animations converted by tools/swf (swf2sheet): WebP atlas pages (or one legacy PNG) plus JSON describing, per label
// ("dir-behavior"), a list of frames; each frame holds N placed images with an affine matrix.
// Direction indices run counter-clockwise from south: 0=S 1=SW 2=W 3=NW 4=N 5=NE 6=E 7=SE.

import { Assets, Container, Matrix, Rectangle, Sprite, Texture } from 'pixi.js';
import type { PointData, TextureSource } from 'pixi.js';

// Pixels at or below this alpha are click-through (anti-aliased edges stay clickable).
const HIT_ALPHA = 24;

export interface SheetObj {
  i: number;
  m: [number, number, number, number, number, number];
}

export interface SheetFrame {
  d: number;
  objs: SheetObj[];
}

export interface SheetData {
  fps: number;
  width: number;
  height: number;
  ox?: number;
  oy?: number;
  /** Atlas page files next to the JSON; absent on single-PNG sheets (<name>.png). */
  pages?: string[];
  /** Image rects; p = page index (absent = 0). */
  images: { x: number; y: number; w: number; h: number; p?: number }[];
  anims: Record<string, SheetFrame[]>;
  order: string[];
  // Anchor metrics from the SWF's GameResInst class, in sheet coordinates. The Flash client places a
  // resource at (-midX, -footY) so its feet land on the entity position.
  meta?: SheetMeta;
}

export interface SheetMeta {
  midX: number;
  footY: number;
  bodyY?: number;
  bodyHeight?: number;
  headY?: number;
  totalWidth?: number;
  totalHeight?: number;
  /** Vector-anim sheets (gates): y of the SWF `localizer` child, the ground line used for depth sorting. */
  localizerY?: number;
}

export const Behavior = {
  STAND: 0,
  RUN_FAST: 1,
  RUN: 2,
  ATTACK: 3,
  DEAD: 4, // lying pose (verified on the sheets; the converter doc used to list 4 as HURT)
  HURT: 5,
  DEFENCE: 6,
  MAGIC: 7,
} as const;

export function dirFromDelta(dx: number, dy: number, fallback = 0): number {
  if (dx === 0 && dy === 0) return fallback;
  const angle = Math.atan2(dy, dx);
  const south = Math.PI / 2;
  const ccw = (south - angle + Math.PI * 2) % (Math.PI * 2);
  return Math.round(ccw / (Math.PI / 4)) % 8;
}

const loaded = new Map<string, Promise<LoadedSheet | null>>();

export interface LoadedSheet {
  data: SheetData;
  textures: Texture[];
}

interface AtlasAlpha {
  w: number;
  data: Uint8Array;
}

/** Per-page alpha channel, read lazily on the first hit test; null if the pixels can't be read. */
const alphas = new WeakMap<TextureSource, AtlasAlpha | null>();

function atlasAlpha(src: TextureSource): AtlasAlpha | null {
  const cached = alphas.get(src);
  if (cached !== undefined) return cached;
  alphas.set(src, null);
  const img = src.resource as CanvasImageSource | undefined;
  if (!img) return null;
  try {
    const w = src.pixelWidth;
    const h = src.pixelHeight;
    const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3];
    const alpha = { w, data };
    alphas.set(src, alpha);
    return alpha;
  } catch {
    return null; // fall back to rectangle hit tests
  }
}

/** Sprite whose hit test ignores transparent atlas pixels (Pixi only checks the frame rectangle). */
class AlphaSprite extends Sprite {
  override containsPoint(point: PointData): boolean {
    if (!super.containsPoint(point)) return false;
    const { frame, source } = this.texture;
    const alpha = atlasAlpha(source);
    if (!alpha) return true;
    const res = source.resolution;
    const px = Math.floor((frame.x + point.x) * res);
    const py = Math.floor((frame.y + point.y) * res);
    if (px < 0 || py < 0 || px >= alpha.w) return false;
    return (alpha.data[py * alpha.w + px] ?? 0) > HIT_ALPHA;
  }
}

export function loadSheet(name: string): Promise<LoadedSheet | null> {
  let p = loaded.get(name);
  if (!p) {
    p = (async () => {
      try {
        const data = (await (await fetch(`/sheets/${name}.json`)).json()) as SheetData;
        const dir = name.slice(0, name.lastIndexOf('/') + 1);
        const files = data.pages ?? [`${name.slice(dir.length)}.png`];
        const pages = await Promise.all(
          files.map((f) => Assets.load<Texture>({ src: `/sheets/${dir}${f}`, loadParser: 'loadTextures' })),
        );
        const textures = data.images.map(
          (r) => new Texture({ source: pages[r.p ?? 0].source, frame: new Rectangle(r.x, r.y, r.w, r.h) }),
        );
        return { data, textures };
      } catch {
        return null;
      }
    })();
    loaded.set(name, p);
  }
  return p;
}

export class SheetAnim extends Container {
  private frames: SheetFrame[] = [];
  private frameIdx = 0;
  private elapsed = 0;
  private pool: Sprite[] = [];
  private labelName = '';
  loop = true;
  onComplete: (() => void) | null = null;

  constructor(private readonly sheet: LoadedSheet) {
    super();
  }

  get currentLabel(): string {
    return this.labelName;
  }

  get firstLabel(): string {
    return this.sheet.data.order[0] ?? '';
  }

  /** Label at position `i` of the sheet order: dir 0 clips are stored under their Chinese names first (order[0..7] = behaviors 0..7). */
  orderLabel(i: number): string {
    return this.sheet.data.order[i] ?? '';
  }

  has(label: string): boolean {
    return label in this.sheet.data.anims;
  }

  play(label: string, restart = false): boolean {
    if (!this.has(label)) return false;
    if (this.labelName === label && !restart) return true;
    this.labelName = label;
    this.frames = this.sheet.data.anims[label];
    this.frameIdx = 0;
    this.elapsed = 0;
    this.render();
    return true;
  }

  playDir(dir: number, behavior: number, restart = false): boolean {
    return this.play(`${dir}-${behavior}`, restart);
  }

  tick(dtSeconds: number): void {
    if (this.frames.length === 0) return;
    this.elapsed += dtSeconds * this.sheet.data.fps;
    let changed = false;
    while (this.elapsed >= this.frames[this.frameIdx].d) {
      this.elapsed -= this.frames[this.frameIdx].d;
      if (this.frameIdx + 1 >= this.frames.length) {
        if (!this.loop) {
          this.elapsed = 0;
          this.onComplete?.();
          return;
        }
        this.frameIdx = 0;
      } else {
        this.frameIdx++;
      }
      changed = true;
    }
    if (changed) this.render();
  }

  private render(): void {
    const frame = this.frames[this.frameIdx];
    while (this.pool.length < frame.objs.length) {
      const s = new AlphaSprite();
      this.pool.push(s);
      this.addChild(s);
    }
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      const obj = frame.objs[i];
      if (!obj) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.texture = this.sheet.textures[obj.i];
      const [a, b, c, d, tx, ty] = obj.m;
      s.setFromMatrix(new Matrix(a, b, c, d, tx, ty));
    }
  }
}
