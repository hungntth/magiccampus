// Pet hover tooltip, a port of the Flash TipCre (259 x 328, absolute layout, TipCre.as:114-828; values from setInst :1992-2171):
// icon, name by growth colour, bind state, 12 upgrade stars, Cấp / T.thành / Thọ / Điểm / N.tố, quality + class line, catchable
// line, Điểm / Tư chất table, stand frame of the pet model, P.Chất, aptitude pentagon (raw vs final, max 10000) and skill row 1-5.
// The skin captions (Cấp, T.thành, ...) are art in Flash; they are drawn as text here.

import { CHAR_ELEMENT_NAMES, PetLimits, petGrowColor, petLevelOfExp, type PetView } from '@mc/shared';
import { iconUrl } from '../assets';
import { sheetNameFromResCode } from '../game/Entity';
import { loadSheet, type LoadedSheet, type SheetData, type SheetFrame } from '../game/SheetAnim';
import { NAME_COLORS } from './itemCell';
import './petTip.css';

type AptKey = 'Strength' | 'Agility' | 'Stamina' | 'Intelligence' | 'Energy';
const ATTRS: [AptKey, string][] = [['Strength', 'Lực'], ['Agility', 'Xảo'], ['Stamina', 'Nhẫn'], ['Intelligence', 'Trí'], ['Energy', 'Thần']];
const STAR_COUNT = 12;
// GamePredef ELEMENT_COLOR (index 0 "Vô" has none: white), CREATURE_QLEVEL, CREATURE_CLASS_NAME (Language GAMEPREDEF_S 224-240).
const ELEMENT_COLOR = ['#FFFFFF', '#FFCC00', '#FF9900', '#FF66CC', '#00FF00', '#3399CC', '#33FF66'];
const QLEVEL = ['', 'Sơ cấp ', 'Trung cấp ', 'Cao cấp '];
const CLASS_NAME: Record<number, string> = {
  1: 'Hệ người', 2: 'Hệ dã thú', 3: 'Hệ thực vật', 4: 'Hệ máy', 5: 'Hệ ác ma', 6: 'Hệ rồng', 7: 'Hệ boss',
};
// TipCre.as:2046-2075: growth bonus shown on top of growRateAdd by upgrade level.
const UPGRADE_GROW_BONUS: Record<number, number> = { 9: 0.1, 10: 0.3, 11: 0.35, 12: 0.4 };
// PentagonCanvas: max value 10000, max radius 40, minimum 5 % of it.
const RADAR_MAX = 10000;
const RADAR_R = 40;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderPetTip(pet: PetView): HTMLElement {
  const root = div('pet-tip');
  const icon = div('pt-icon', root, 3, 3);
  const img = document.createElement('img');
  img.src = iconUrl(pet.iconCode);
  img.alt = '';
  img.onerror = () => img.remove();
  icon.appendChild(img);
  const name = text(root, pet.petName, 56, 6, 'pt-name');
  name.style.color = NAME_COLORS[petGrowColor(pet.growRate)] ?? NAME_COLORS[0];
  text(root, pet.binded ? 'Đã khóa' : 'Chưa khóa', 56, 27, 'pt-lock');
  const stars = div('pt-stars', root, 100, 47);
  for (let i = 1; i <= STAR_COUNT; i++) stars.appendChild(div(i <= pet.upgradeNum ? 'pt-star lit' : 'pt-star'));
  stars.title = `Cấp độ cường hóa: ${pet.upgradeNum}`;

  const rows: [string, string, number][] = [
    ['Cấp', String(pet.level || petLevelOfExp(pet.exp)), 65],
    ['T.thành', String(pet.close ?? 0), 80],
    ['Thọ', `${pet.life}`, 96],
    ['Điểm', String(pet.attLastPoint), 111],
  ];
  for (const [label, value, y] of rows) {
    text(root, label, 8, y, 'pt-cap');
    text(root, value, 50, y);
  }
  text(root, 'N.tố', 8, 128, 'pt-cap');
  const el = pet.element ?? 0;
  text(root, CHAR_ELEMENT_NAMES[el] ?? CHAR_ELEMENT_NAMES[0], 50, 128).style.color = ELEMENT_COLOR[el] ?? '#fff';
  text(root, `${QLEVEL[pet.qLevel] ?? ''}${CLASS_NAME[pet.classId] ?? ''}`, 13, 144);
  const catchable = pet.catchable ?? 0;
  text(root, catchable === 0 ? 'Không thể bắt' : `Độ khó bắt pet:${catchable}`, 12, 159, catchable === 0 ? 'pt-bad' : 'pt-good');

  // Điểm / Tư chất table (TipCre.as:2037-2142): points = final attributes, aptitude = (apt + Ex + Evolution) * (growRate + add).
  const add = (pet.growRateAdd ?? 0) + (UPGRADE_GROW_BONUS[pet.upgradeNum] ?? 0);
  const rate = pet.growRate + add;
  text(root, 'Phát triển', 6, 180, 'pt-cap pt-tight');
  text(root, 'Điểm', 55, 180, 'pt-head', 45);
  text(root, 'Tư chất', 102, 180, 'pt-head', 60);
  const raw: number[] = [];
  const fin: number[] = [];
  ATTRS.forEach(([key, label], i) => {
    const r = (pet[`apt${key}`] ?? 0) + (pet[`apt${key}Ex`] ?? 0) + (pet[`apt${key}Evolution`] ?? 0);
    raw.push(r);
    fin.push(Math.round(r * rate));
    const y = 198 + i * 15.5;
    text(root, label, 12, y, 'pt-cap');
    text(root, String(Math.round(pet.property?.[`final${key}`] ?? 0)), 55, y, 'pt-num', 45);
    text(root, String(fin[i]), 102, y, 'pt-num', 60);
  });

  const model = document.createElement('canvas');
  model.className = 'pt-model';
  model.width = 90;
  model.height = 150;
  root.appendChild(model);
  void drawCreatureModel(model, pet.resCode);
  text(root, `P.Chất ${round2(pet.growRate)}+${round2(add)}`, 176, 170, 'pt-small', 67);
  root.appendChild(radar(raw, fin));

  // Skill row: buttons 1 2 3 (tab 1 shown, as the Flash tip opens on it) and skill1..5.
  ['1', '2', '3'].forEach((t, i) => text(root, t, 11 + i * 18, 294, i === 0 ? 'pt-tab on' : 'pt-tab'));
  text(root, 'Chiêu', 8, 276, 'pt-cap');
  [1, 38, 75, 113, 151].forEach((x, i) => {
    const id = pet[`skill${i + 1}` as `skill${1 | 2 | 3 | 4 | 5}`] ?? 0;
    const slot = div(id < 0 ? 'pt-skill locked' : 'pt-skill', root, 64 + x, 285);
    const info = id > 0 ? pet.skillInfo?.[id] : undefined;
    if (info) {
      const si = document.createElement('img');
      si.src = iconUrl(info.iconCode);
      si.alt = '';
      si.onerror = () => si.remove();
      slot.appendChild(si);
    }
  });
  return root;
}

/** Draws the first standing sheet frame into a DOM canvas, with its feet at the bottom centre. */
export async function drawCreatureModel(canvas: HTMLCanvasElement, resCode: string): Promise<void> {
  const name = sheetNameFromResCode(resCode);
  const sheet = name ? await loadSheet(name) : null;
  const frame = sheet && (sheet.data.anims['0-0'] ?? sheet.data.anims[sheet.data.order[0] ?? ''])?.[0];
  const ctx = canvas.getContext('2d');
  if (!sheet || !frame?.objs || !ctx) return;
  drawCreatureFrame(ctx, canvas, sheet, frame, 1);
}

/** Plays the standing sheet frames in a canvas. The returned callback stops the animation. */
export function animateCreatureModel(canvas: HTMLCanvasElement, resCode: string, zoom = 1, centered = false): () => void {
  let cancelled = false;
  let request = 0;
  void (async () => {
    const name = sheetNameFromResCode(resCode);
    const sheet = name ? await loadSheet(name) : null;
    const frames = sheet && (sheet.data.anims['0-0'] ?? sheet.data.anims[sheet.data.order[0] ?? '']);
    const ctx = canvas.getContext('2d');
    if (cancelled || !sheet || !frames?.length || !ctx) return;
    let frameIndex = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      if (cancelled || !canvas.isConnected) return;
      elapsed += ((now - last) * sheet.data.fps) / 1000;
      last = now;
      while (elapsed >= frames[frameIndex].d) {
        elapsed -= frames[frameIndex].d;
        frameIndex = (frameIndex + 1) % frames.length;
      }
      drawCreatureFrame(ctx, canvas, sheet, frames[frameIndex], zoom, centered);
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
  })();
  return () => {
    cancelled = true;
    cancelAnimationFrame(request);
  };
}

function drawCreatureFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sheet: LoadedSheet,
  frame: SheetFrame,
  zoom: number,
  centered = false,
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { data } = sheet;
  const { width, height, meta } = data;
  const bounds = centered ? creatureBounds(data, frame) : null;
  const scale = bounds
    ? ((canvas.height - 6) / Math.max(1, bounds.maxY - bounds.minY)) * zoom
    : creatureScale(data, canvas, zoom);
  const originX = bounds ? canvas.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale : canvas.width / 2 - (meta?.midX ?? width / 2) * scale;
  const originY = bounds ? canvas.height - 3 - bounds.maxY * scale : canvas.height - 2 - (meta?.footY ?? height - 8) * scale;
  for (const o of frame.objs) {
    const r = data.images[o.i];
    const img = sheet.textures[o.i]?.source.resource as CanvasImageSource | undefined;
    if (!r || !img) continue;
    const [a, b, c, d, tx, ty] = o.m;
    ctx.setTransform(scale, 0, 0, scale, originX, originY);
    ctx.transform(a, b, c, d, tx, ty);
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Actual object bounds avoid the empty SWF frame around some boss sheets. */
function creatureBounds(data: SheetData, frame: SheetFrame): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of frame.objs) {
    const r = data.images[o.i];
    if (!r) continue;
    const [a, b, c, d, tx, ty] = o.m;
    for (const [x, y] of [[0, 0], [r.w, 0], [0, r.h], [r.w, r.h]]) {
      const px = a * x + c * y + tx;
      const py = b * x + d * y + ty;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: data.width, maxY: data.height };
}

function creatureScale(data: SheetData, canvas: HTMLCanvasElement, zoom = 1): number {
  const { width, height, meta } = data;
  const footY = meta?.footY ?? height - 8;
  const top = meta?.headY ?? meta?.bodyY ?? 0;
  return Math.min(1.2, Math.min((canvas.height - 4) / Math.max(1, footY - top), (canvas.width - 2) / Math.max(1, width)) * zoom);
}

/** PentagonCanvas: grid, inner polygon = raw aptitudes (green), outer = final aptitudes (purple); axes Lực, Xảo, Nhẫn, Trí, Thần. */
function radar(raw: number[], fin: number[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pt-radar');
  svg.setAttribute('viewBox', '0 0 100 103');
  const cx = 50;
  const cy = 55;
  const pt = (i: number, r: number): string => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  };
  const len = (v: number): number => Math.max(RADAR_R * 0.05, Math.min(RADAR_R, (RADAR_R * v) / RADAR_MAX));
  const poly = (pts: string, attrs: Record<string, string>): void => {
    const p = document.createElementNS(SVG_NS, 'polygon');
    p.setAttribute('points', pts);
    for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
    svg.appendChild(p);
  };
  const ring = [0, 1, 2, 3, 4].map((i) => pt(i, RADAR_R)).join(' ');
  poly(ring, { fill: 'none', stroke: '#3388ff', 'stroke-width': '2', 'stroke-opacity': '0.9' });
  for (let i = 0; i < 5; i++) {
    const l = document.createElementNS(SVG_NS, 'line');
    const [x2, y2] = pt(i, RADAR_R).split(',');
    l.setAttribute('x1', String(cx));
    l.setAttribute('y1', String(cy));
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    l.setAttribute('stroke', '#3388ff');
    l.setAttribute('stroke-opacity', '0.6');
    svg.appendChild(l);
    const t = document.createElementNS(SVG_NS, 'text');
    const [lx, ly] = pt(i, RADAR_R + 8).split(',');
    t.setAttribute('x', lx);
    t.setAttribute('y', String(Number(ly) + 3));
    t.setAttribute('text-anchor', 'middle');
    t.textContent = ATTRS[i][1];
    svg.appendChild(t);
  }
  poly(fin.map((v, i) => pt(i, len(v))).join(' '), { fill: '#6600ff', 'fill-opacity': '0.3', stroke: '#6600ff' });
  poly(raw.map((v, i) => pt(i, len(v))).join(' '), { fill: '#00ff00', 'fill-opacity': '0.5', stroke: '#00ff00' });
  return svg;
}

const round2 = (v: number): string => String(Math.round(v * 100) / 100);

function div(cls: string, parent?: HTMLElement, x?: number, y?: number): HTMLDivElement {
  const e = document.createElement('div');
  e.className = cls;
  if (x !== undefined && y !== undefined) {
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
  }
  parent?.appendChild(e);
  return e;
}

function text(parent: HTMLElement, value: string, x: number, y: number, cls = '', width?: number): HTMLDivElement {
  const e = div(cls ? `pt-text ${cls}` : 'pt-text', parent, x, y);
  e.textContent = value;
  if (width !== undefined) e.style.width = `${width}px`;
  return e;
}
