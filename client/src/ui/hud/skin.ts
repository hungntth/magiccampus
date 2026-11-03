// Legacy Flex skin art extracted from the main client by `tools/swf` swfui into /ui/<lib>/<symbol>.png,
// plus small DOM helpers (absolutely positioned boxes, state-skinned buttons, tooltips).

import { toast } from '../screens';

interface SkinInfo {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

let index: Record<string, SkinInfo> = {};

export async function loadSkins(): Promise<void> {
  try {
    const res = await fetch('/ui/index.json');
    if (res.ok) index = (await res.json()) as Record<string, SkinInfo>;
  } catch {
    // missing art: buttons still work, just without images
  }
}

export function skinUrl(key: string): string {
  return `/ui/${key}.png`;
}

export function skinSize(key: string): SkinInfo {
  return index[key] ?? { w: 0, h: 0, ox: 0, oy: 0 };
}

export function div(cls: string, parent?: HTMLElement, text?: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Absolute placement in the parent's coordinate space (legacy MXML x/y/width/height). */
export function place(e: HTMLElement, x: number, y: number, w?: number, h?: number): HTMLElement {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
}

/** Element whose background is a skin image at its natural size, offset by the symbol registration point. */
export function skinImage(key: string, parent: HTMLElement, x: number, y: number, cls = ''): HTMLDivElement {
  const s = skinSize(key);
  const e = div(`skin ${cls}`.trim(), parent);
  place(e, x - s.ox, y - s.oy, s.w || undefined, s.h || undefined);
  e.style.backgroundImage = `url(${skinUrl(key)})`;
  return e;
}

export interface SkinStates {
  up: string;
  over?: string;
  down?: string;
}

/** Button with up/over/down skin images (Flex Button upSkin/overSkin/downSkin). */
export function skinButton(states: SkinStates, parent: HTMLElement, x: number, y: number, tip: string,
  onClick: () => void): HTMLDivElement {
  const e = skinImage(states.up, parent, x, y, 'skin-btn');
  setStates(e, states);
  if (tip) e.title = tip;
  e.onclick = (ev) => {
    ev.stopPropagation();
    onClick();
  };
  return e;
}

export function setStates(e: HTMLElement, states: SkinStates): void {
  e.style.setProperty('--up', `url(${skinUrl(states.up)})`);
  e.style.setProperty('--over', `url(${skinUrl(states.over ?? states.up)})`);
  e.style.setProperty('--down', `url(${skinUrl(states.down ?? states.over ?? states.up)})`);
  e.style.backgroundImage = '';
}

/** Standard "Up/Over/Down" suffixed skin names. */
export function std(base: string): SkinStates {
  return { up: `${base}Up`, over: `${base}Over`, down: `${base}Down` };
}

export function notReady(): void {
  toast('Tính năng đang phát triển');
}
