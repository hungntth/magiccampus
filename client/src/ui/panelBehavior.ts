// Shared behaviour for in-game windows (legacy compDragable panels): drag by the frame/title, Esc closes.
// Panels live in the scaled #stage, so pointer deltas are divided by the stage scale. A panel made draggable with a `key`
// keeps its last position in localStorage (`mc.pos.<key>`) and reopens there.

import { stageEl, stageScale } from './stage';

const NO_DRAG = 'button, input, select, textarea, a, [data-no-drag]';
const POS_PREFIX = 'mc.pos.';

/**
 * Drag `panel` by pressing anywhere on it except controls (or only on `handle` when given). With `key` the saved position
 * is applied now and every drop is saved. Returns a disposer.
 */
export function makeDraggable(panel: HTMLElement, handle?: HTMLElement, key?: string): () => void {
  const grip = handle ?? panel;
  if (key) restorePosition(panel, key);
  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest(NO_DRAG))) return;
    const stage = stageEl().getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const scale = stageScale();
    // Switch from centered CSS to explicit stage-pixel left/top once, so dragging keeps the panel under the pointer.
    const left = (box.left - stage.left) / scale;
    const top = (box.top - stage.top) / scale;
    pin(panel, left, top);
    const startX = e.clientX;
    const startY = e.clientY;
    const maxLeft = stage.width / scale - 40;
    const maxTop = stage.height / scale - 30;
    const onMove = (m: PointerEvent): void => {
      const x = Math.max(40 - box.width / scale, Math.min(maxLeft, left + (m.clientX - startX) / scale));
      const y = Math.max(0, Math.min(maxTop, top + (m.clientY - startY) / scale));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (key) savePosition(key, parseFloat(panel.style.left), parseFloat(panel.style.top));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  };
  grip.addEventListener('pointerdown', onDown);
  grip.style.cursor = 'move';
  return () => grip.removeEventListener('pointerdown', onDown);
}

/** Replaces the CSS placement (centred or right-anchored) with explicit stage-pixel left/top. */
function pin(panel: HTMLElement, left: number, top: number): void {
  panel.style.transform = 'none';
  panel.style.margin = '0';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

/** Applies the saved position, clamped like a drag so the panel stays reachable on a smaller stage. */
function restorePosition(panel: HTMLElement, key: string): void {
  let saved: unknown;
  try {
    saved = JSON.parse(localStorage.getItem(POS_PREFIX + key) ?? 'null');
  } catch {
    return; // storage blocked or a corrupt entry: keep the default placement
  }
  if (typeof saved !== 'object' || saved === null) return;
  const { x, y } = saved as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const stage = stageEl(); // offsetWidth/Height are unscaled stage pixels
  pin(panel, Math.max(0, Math.min(stage.offsetWidth - 40, x)), Math.max(0, Math.min(stage.offsetHeight - 30, y)));
}

function savePosition(key: string, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  try {
    localStorage.setItem(POS_PREFIX + key, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
  } catch {
    // storage blocked (private window): the position is just not remembered
  }
}

/** Calls `close` on Escape, also while the chat input has focus (it is blurred). Returns a disposer. */
export function closeOnEscape(close: () => void): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    const a = document.activeElement;
    if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) a.blur();
    e.preventDefault();
    close();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
