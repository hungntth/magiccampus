// Area map window (legacy compDragable/MapPanel + comp/MapCanvas; M key / minimap Earth button): the current map's own
// background tiles drawn scaled to 400 px wide, NPC icons ("NPC" checkbox), transport gates ("Điểm đến"), the player marker
// and a hover x,y tip. Clicking the map walks there, an NPC icon walks up and talks, a gate walks in; "Thế giới" opens the
// world map (POPU_WORLDMAP).

import { QuestState, type MapInfo } from '@mc/shared';
import { el } from '../actWindow';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { toast } from '../screens';
import { stageEl } from '../stage';
import { mapCells } from '../../game/MapLayer';
import './localMap.css';

const MAP_W = 400; // MapCanvas MINIMAP_WIDTH 405 inside the 430 px panel's 15 px margins
const PLAYER_MS = 200;
const ICONS_MS = 1000;
const NO_MINIMAP = 'Khu vực này không thể hiển thị bản đồ mini.'; // MAPPANEL_S[0]

export interface LocalMapNpc {
  entityId: number;
  name: string;
  x: number;
  y: number;
  npcType: number;
  questState: number;
}

export interface LocalMapGate {
  id: number;
  name: string;
  x: number;
  y: number;
}

/** Scene data and actions the area map needs (GameScene). Coordinates are map pixels. */
export interface LocalMapSource {
  map(): MapInfo | null;
  self(): { x: number; y: number } | null;
  npcs(): LocalMapNpc[];
  gates(): LocalMapGate[];
  walk(x: number, y: number): void;
  talk(npcId: number): void;
  enterGate(gateId: number): void;
}

/** One scaled background per map resCode, kept for the last map only (tiles load progressively into it). */
let cached: { key: string; canvas: HTMLCanvasElement } | null = null;

function mapImage(info: MapInfo, scale: number): HTMLCanvasElement {
  const key = `${info.resCode}@${info.width}x${info.height}`;
  if (cached?.key === key) return cached.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = Math.round(info.height * scale);
  const g = canvas.getContext('2d');
  for (const cell of mapCells(info)) {
    const img = new Image();
    img.onload = () => g?.drawImage(img, cell.x * scale, cell.y * scale, img.width * scale, img.height * scale);
    img.src = cell.url;
  }
  cached = { key, canvas };
  return canvas;
}

/** CSS icon class of an NPC (MapCanvas.addNpc styleNames: quest state first, then the function type). */
function npcIcon(n: LocalMapNpc): string {
  if (n.questState === QuestState.CAN_TAKE) return 'q-take';
  if (n.questState === QuestState.TAKEN) return 'q-doing';
  if (n.questState === QuestState.CAN_FINISH) return 'q-done';
  switch (n.npcType) {
    case 2: case 5: return 'trade';
    case 3: return 'mail';
    case 8: return 'heal';
    case 9: return 'send';
    case 10: return 'battle';
    default: return 'talk';
  }
}

export class LocalMapPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private timers: number[] = [];
  private scale = 1;
  private mapKey = '';
  private showNpc = true;
  private showGate = true;
  private refs: { title: HTMLElement; view: HTMLElement; npcs: HTMLElement; gates: HTMLElement; me: HTMLElement; tip: HTMLElement } | null = null;

  constructor(private readonly source: LocalMapSource, private readonly openWorld: () => void) {}

  toggle(): void {
    if (this.root) this.close();
    else this.open();
  }

  close(): void {
    for (const off of this.offs) off();
    for (const t of this.timers) window.clearInterval(t);
    this.offs = [];
    this.timers = [];
    this.root?.remove();
    this.root = null;
    this.refs = null;
    this.mapKey = '';
  }

  /** The scene changed map: redraw while open. */
  refresh(): void {
    if (this.root) this.render();
  }

  private open(): void {
    const info = this.source.map();
    if (!info) return;
    if ((info.mMap ?? 0) < 0) return void toast(NO_MINIMAP, true);
    const root = el('lm-win');
    const head = el('lm-head');
    const title = el('lm-title');
    head.appendChild(title);
    const x = el('lm-close', '×', 'button');
    x.title = 'Đóng';
    x.onclick = () => this.close();

    const bar = el('lm-bar');
    bar.append(
      this.check('NPC', this.showNpc, (on) => {
        this.showNpc = on;
      }),
      this.check('Điểm đến', this.showGate, (on) => { // MAPPANEL_S[1]
        this.showGate = on;
      }),
    );
    const world = el('lm-world', 'Thế giới', 'button');
    world.onclick = () => {
      this.close();
      this.openWorld();
    };
    bar.appendChild(world);

    const view = el('lm-view');
    const gates = el('lm-layer');
    const npcs = el('lm-layer');
    const me = el('lm-me');
    const tip = el('lm-tip');
    tip.hidden = true;
    view.append(gates, npcs, me, tip);
    view.onclick = (e) => this.onMapClick(e);
    view.onmousemove = (e) => this.onHover(e);
    view.onmouseleave = () => (tip.hidden = true);

    root.append(head, x, bar, view);
    stageEl().appendChild(root);
    this.root = root;
    this.refs = { title, view, npcs, gates, me, tip };
    this.offs.push(makeDraggable(root, head, 'lm.win'), closeOnEscape(() => this.close()));
    this.timers.push(
      window.setInterval(() => this.placePlayer(), PLAYER_MS),
      window.setInterval(() => this.drawIcons(), ICONS_MS),
    );
    this.render();
  }

  private check(label: string, on: boolean, set: (on: boolean) => void): HTMLElement {
    const lab = el('lm-check', undefined, 'label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = on;
    box.onchange = () => {
      set(box.checked);
      this.applyToggles();
    };
    lab.append(box, label);
    return lab;
  }

  private render(): void {
    const info = this.source.map();
    const r = this.refs;
    if (!info || !r) return;
    if ((info.mMap ?? 0) < 0) return void this.close();
    r.title.textContent = info.name;
    const key = `${info.id}`;
    if (key !== this.mapKey) {
      this.mapKey = key;
      this.scale = MAP_W / Math.max(1, info.width);
      const img = mapImage(info, this.scale);
      img.className = 'lm-img';
      r.view.querySelector('.lm-img')?.remove();
      r.view.prepend(img);
      r.view.style.height = `${img.height}px`;
    }
    this.drawIcons();
    this.placePlayer();
    this.applyToggles();
  }

  private applyToggles(): void {
    if (!this.refs) return;
    this.refs.npcs.hidden = !this.showNpc;
    this.refs.gates.hidden = !this.showGate;
  }

  private drawIcons(): void {
    const r = this.refs;
    if (!r) return;
    const s = this.scale;
    r.npcs.replaceChildren(...this.source.npcs().map((n) => {
      const icon = this.icon(`lm-npc ${npcIcon(n)}`, n.x * s, n.y * s);
      icon.title = `NPC: ${n.name}\nTọa độ: ${Math.trunc(n.x / 10)},${Math.trunc(n.y / 10)}`;
      icon.onclick = (e) => {
        e.stopPropagation();
        this.source.talk(n.entityId);
      };
      return icon;
    }));
    r.gates.replaceChildren(...this.source.gates().map((g) => {
      const icon = this.icon('lm-gate', g.x * s, g.y * s);
      icon.title = `Chuyển đến: ${g.name}\nTọa độ: ${Math.trunc(g.x / 10)},${Math.trunc(g.y / 10)}`;
      icon.onclick = (e) => {
        e.stopPropagation();
        this.source.enterGate(g.id);
      };
      return icon;
    }));
  }

  private icon(cls: string, x: number, y: number): HTMLElement {
    const i = el(cls);
    i.style.left = `${Math.round(x)}px`;
    i.style.top = `${Math.round(y)}px`;
    return i;
  }

  private placePlayer(): void {
    const r = this.refs;
    const p = this.source.self();
    if (!r) return;
    r.me.hidden = !p;
    if (!p) return;
    r.me.style.left = `${Math.round(p.x * this.scale)}px`;
    r.me.style.top = `${Math.round(p.y * this.scale)}px`;
    r.me.title = `Bạn: ${Math.trunc(p.x / 10)},${Math.trunc(p.y / 10)}`;
  }

  private onMapClick(e: MouseEvent): void {
    if (!this.refs) return;
    const { x, y } = local(this.refs.view, e);
    this.source.walk(x / this.scale, y / this.scale);
  }

  private onHover(e: MouseEvent): void {
    if (!this.refs) return;
    const { view, tip } = this.refs;
    const { x, y } = local(view, e);
    tip.hidden = false;
    tip.textContent = `${Math.trunc(x / this.scale / 10)},${Math.trunc(y / this.scale / 10)}`;
    tip.style.left = `${Math.min(x + 12, MAP_W - 50)}px`;
    tip.style.top = `${y + 16}px`;
  }
}

/** Mouse position inside the map view, in view pixels (the stage may be CSS-scaled). */
function local(view: HTMLElement, e: MouseEvent): { x: number; y: number } {
  const b = view.getBoundingClientRect();
  const k = b.width / view.offsetWidth || 1;
  return { x: (e.clientX - b.left) / k, y: (e.clientY - b.top) / k };
}
