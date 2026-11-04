// "Nhân vật" window (legacy CharactorPanel): 22-slot equipment grid (legacy slot layout), HP/MP + combat stats, the five
// attributes with +/- free-point allocation (step 1 or 10, OK sends changeProperty) and the info header.
// Pure view: CharacterController owns the data. Drop a bag item here = equip; double-click an equipped slot = unequip.

import { EQUIP_SLOT_COUNT, LEVEL_EXP, type BagItem, type CharProperty, type PlayerData } from '@mc/shared';
import { endDrag, dragging, fillItemCell, itemTooltip } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './characterPanel.css';

// sid -> [label, x, y] (CharactorPanel.as:351-558); 15..20 are the magic weapons (not ported, shown locked).
const SLOTS: Record<number, [string, number, number]> = {
  1: ['Mũ', 11, 10], 2: ['Đai', 11, 82], 3: ['Vũ khí', 57, 119], 4: ['Áo', 11, 46], 5: ['Quần', 11, 120],
  6: ['Trang sức 1', 11, 156], 7: ['Trợ thủ', 187, 119], 8: ['Dây chuyền', 232, 10], 9: ['Nhẫn', 232, 82],
  10: ['Hộ vai', 232, 46], 11: ['Trang sức 2', 232, 155], 12: ['Giày', 232, 119], 13: ['Găng thu thập', 187, 156],
  14: ['Phi hành', 57, 156], 15: ['Thần khí chính', 122, 84], 16: ['Thần khí phụ 1', 52, 202], 17: ['Thần khí phụ 2', 86, 202],
  18: ['Thần khí phụ 3', 120, 202], 19: ['Thần khí phụ 4', 154, 202], 20: ['Thần khí phụ 5', 188, 202],
  21: ['Thời trang', 57, 83], 22: ['Cánh', 187, 82],
};
const LOCKED = new Set([15, 16, 17, 18, 19, 20]);
export { SLOTS as EQUIP_SLOTS, LOCKED as LOCKED_EQUIP_SLOTS }; // the other-player info panel reuses the layout

type AttrKey = 'Strength' | 'Agility' | 'Stamina' | 'Intelligence' | 'Energy';
const ATTRS: [AttrKey, string][] = [
  ['Strength', 'Lực'], ['Agility', 'Xảo'], ['Stamina', 'Nhẫn'], ['Intelligence', 'Trí'], ['Energy', 'Thần'],
];

export interface CharacterPanelHost {
  player(): PlayerData;
  equipped(): Map<number, BagItem>;
  /** Item with this instance id from the bag (drag source), if any. */
  item(id: number): BagItem | undefined;
  onEquip(item: BagItem): void;
  onUnequip(item: BagItem): void;
  /** OK button: strings like the Flash client ("" = 0). */
  onAllocate(add: Record<`add${AttrKey}`, string>): void;
  onClose(): void;
}

export class CharacterPanel {
  private root: HTMLElement | null = null;
  private slots = new Map<number, HTMLElement>();
  private stats: HTMLElement | null = null;
  private pending: Record<AttrKey, number> = { Strength: 0, Agility: 0, Stamina: 0, Intelligence: 0, Energy: 0 };
  private step10 = false;
  private offs: (() => void)[] = [];

  constructor(private readonly host: CharacterPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return;
    const root = el('div', 'char-panel');
    const header = el('div', 'char-header');
    header.appendChild(el('div', 'char-title', 'Nhân vật'));
    root.appendChild(header);
    const x = el('button', 'char-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.appendChild(x);
    const equip = el('div', 'char-equip');
    this.slots.clear();
    for (let sid = 1; sid <= EQUIP_SLOT_COUNT; sid++) {
      const [label, sx, sy] = SLOTS[sid];
      const cell = el('div', `char-slot${LOCKED.has(sid) ? ' locked' : ''}`);
      cell.style.left = `${sx}px`;
      cell.style.top = `${sy}px`;
      cell.title = LOCKED.has(sid) ? `${label} (chưa mở)` : label;
      this.slots.set(sid, cell);
      equip.appendChild(cell);
    }
    root.appendChild(equip);
    this.stats = el('div', 'char-stats');
    root.appendChild(this.stats);
    root.ondragover = (e) => {
      if (dragging()?.from === 'bag') e.preventDefault();
    };
    root.ondrop = (e) => {
      const d = dragging();
      endDrag();
      if (!d || d.from !== 'bag') return;
      e.preventDefault();
      const it = this.host.item(d.id);
      if (it) this.host.onEquip(it);
    };
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.slots.clear();
    this.stats = null;
    this.resetPending();
  }

  render(): void {
    if (!this.root || !this.stats) return;
    const p = this.host.player();
    const eq = this.host.equipped();
    for (const [sid, cell] of this.slots) {
      const it = eq.get(sid);
      cell.replaceChildren();
      cell.classList.remove('filled');
      cell.draggable = false;
      cell.ondblclick = null;
      cell.style.borderColor = '';
      if (!it) {
        cell.title = LOCKED.has(sid) ? `${SLOTS[sid][0]} (chưa mở)` : SLOTS[sid][0];
        continue;
      }
      fillItemCell(cell, it, itemTooltip(it, p.level, true), 'equip');
      cell.ondblclick = () => this.host.onUnequip(it);
    }
    this.renderStats(p);
  }

  private resetPending(): void {
    for (const k of Object.keys(this.pending) as AttrKey[]) this.pending[k] = 0;
  }

  private pendingTotal(): number {
    return Object.values(this.pending).reduce((a, b) => a + b, 0);
  }

  private renderStats(p: PlayerData): void {
    if (!this.stats) return;
    const prop = p.property;
    const free = prop?.lastPoint ?? p.attrPoints;
    if (this.pendingTotal() > free) this.resetPending(); // points were spent elsewhere meanwhile
    const left = free - this.pendingTotal();
    const next = LEVEL_EXP[p.level];
    const base = LEVEL_EXP[p.level - 1] ?? 0;
    const frag = document.createDocumentFragment();
    frag.appendChild(el('div', 'char-name', `${p.name}  Cấp ${p.level}`));
    frag.appendChild(el('div', 'char-exp', next === undefined ? 'Exp: -' : `Exp: ${Math.max(0, p.exp - base)}/${next - base}`));
    const rows: [string, string][] = [
      ['HP', `${p.currentHp}/${prop?.finalHp ?? p.maxHp}`], ['MP', `${p.currentMp}/${prop?.finalMp ?? p.maxMp}`],
      ['Công vật lý', n(prop, 'finalAttack')], ['Công ma pháp', n(prop, 'finalMAttack')],
      ['Thủ vật lý', n(prop, 'finalDefence')], ['Thủ ma pháp', n(prop, 'finalMDefence')],
      ['Chính xác', n(prop, 'finalHit')], ['Bạo kích', n(prop, 'finalCritical')],
      ['Né tránh', n(prop, 'finalDodge')], ['Tốc độ', n(prop, 'finalSpeed')],
    ];
    for (const [label, value] of rows) frag.appendChild(statRow(label, value));
    frag.appendChild(el('div', 'char-sep'));
    for (const [key, label] of ATTRS) frag.appendChild(this.attrRow(key, label, prop, left));
    frag.appendChild(statRow('Điểm', String(left), 'char-points'));
    const foot = el('div', 'char-foot');
    const chk = document.createElement('label');
    chk.className = 'char-step';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.step10;
    box.onchange = () => {
      this.step10 = box.checked;
    };
    chk.append(box, document.createTextNode(' x10'));
    const ok = el('button', 'char-ok', 'OK');
    ok.disabled = this.pendingTotal() === 0;
    ok.onclick = () => this.submit();
    foot.append(chk, ok);
    frag.appendChild(foot);
    this.stats.replaceChildren(frag);
  }

  private attrRow(key: AttrKey, label: string, prop: CharProperty | undefined, left: number): HTMLElement {
    const row = el('div', 'char-row');
    row.appendChild(el('span', 'char-label', label));
    row.appendChild(el('span', 'char-value', n(prop, `final${key}`)));
    const add = this.pending[key];
    row.appendChild(el('span', 'char-add', add > 0 ? `+${add}` : ''));
    const minus = el('button', 'char-pm', '-');
    minus.disabled = add === 0;
    minus.onclick = () => this.bump(key, -(this.step10 ? 10 : 1), left);
    const plus = el('button', 'char-pm', '+');
    plus.disabled = left <= 0;
    plus.onclick = () => this.bump(key, this.step10 ? 10 : 1, left);
    row.append(minus, plus);
    return row;
  }

  /** Moves points between the free pool and the pending label, bounded locally like the Flash client. */
  private bump(key: AttrKey, delta: number, left: number): void {
    const next = delta > 0 ? Math.min(delta, left) : -Math.min(-delta, this.pending[key]);
    this.pending[key] += next;
    this.renderStats(this.host.player());
  }

  private submit(): void {
    if (this.pendingTotal() === 0) return;
    const add = (k: AttrKey): string => (this.pending[k] > 0 ? String(this.pending[k]) : '');
    this.host.onAllocate({
      addStrength: add('Strength'), addAgility: add('Agility'), addStamina: add('Stamina'),
      addIntelligence: add('Intelligence'), addEnergy: add('Energy'),
    });
    this.resetPending();
    this.renderStats(this.host.player());
  }
}

function n(prop: CharProperty | undefined, key: keyof CharProperty): string {
  return String(Math.round(prop?.[key] ?? 0));
}

function statRow(label: string, value: string, cls = ''): HTMLElement {
  const row = el('div', `char-row ${cls}`.trim());
  row.append(el('span', 'char-label', label), el('span', 'char-value', value));
  return row;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
