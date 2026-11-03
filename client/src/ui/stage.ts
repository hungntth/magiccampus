// Virtual Flash stage. The legacy client was a 900x570 (GamePredef.APP_WIDTH/APP_HEIGHT) Flex app embedded at 100%,
// drawn 1:1 with widgets anchored by left/right/top/bottom constraints. In-game DOM lives in #stage, sized to the
// viewport in stage pixels and scaled down uniformly when the viewport is smaller than 900x570, so every anchor stays
// where Flash put it. The Pixi world uses the same scale (GameScene reads stageScale()).

export const APP_WIDTH = 900;
export const APP_HEIGHT = 570;
/** Never upscale: on big screens the original simply showed more map at 1:1. */
const MAX_SCALE = 1;

export interface StageSize {
  /** Stage pixels (what legacy x/y/right/bottom are measured in). */
  width: number;
  height: number;
  /** CSS pixels per stage pixel. */
  scale: number;
}

let size: StageSize = { width: APP_WIDTH, height: APP_HEIGHT, scale: 1 };
const listeners = new Set<(s: StageSize) => void>();

export function stageEl(): HTMLElement {
  return document.getElementById('stage')!;
}

export function stageSize(): StageSize {
  return size;
}

export function stageScale(): number {
  return size.scale;
}

export function onStageResize(cb: (s: StageSize) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function typing(): boolean {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
}

function layout(frame: HTMLElement, stage: HTMLElement): void {
  const fw = frame.clientWidth;
  const fh = frame.clientHeight;
  if (!fw || !fh) return;
  // A soft keyboard shrinks the viewport while typing: keep the scale and let the bottom-anchored widgets
  // (chat input) follow the new edge, as a Flash stage resize would, instead of shrinking the whole HUD.
  const scale = typing() ? size.scale : Math.min(MAX_SCALE, fw / APP_WIDTH, fh / APP_HEIGHT);
  const next = { width: Math.round(fw / scale), height: Math.round(fh / scale), scale };
  stage.style.width = `${next.width}px`;
  stage.style.height = `${next.height}px`;
  stage.style.transform = scale === 1 ? '' : `scale(${scale})`;
  stage.style.setProperty('--stage-scale', String(scale));
  if (next.width === size.width && next.height === size.height && next.scale === size.scale) return;
  size = next;
  for (const cb of listeners) cb(size);
}

/** Call once at startup; #stage-frame is the safe-area box the stage is fitted into. */
export function initStage(): void {
  const frame = document.getElementById('stage-frame')!;
  const stage = stageEl();
  const update = (): void => layout(frame, stage);
  new ResizeObserver(update).observe(frame);
  window.addEventListener('orientationchange', update);
  // Re-fit after the keyboard closes (the frame size may not change again).
  document.addEventListener('focusout', () => setTimeout(update, 0));
  update();
}
