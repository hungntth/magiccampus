// "Nhân vật" window (legacy CharactorPanel, 315x460, positions from its MXML descriptor): tab strip (Tr.bị, Th.khí,
// D.hiệu, T.luyện, Thú cưỡi), 22-slot equipment box with the element figure, and the property canvas (HP/MP, the five
// attributes with +/- free-point allocation, step 1 or 10, OK sends changeProperty; combat stats on the right).
// Pure view: CharacterController owns the data. Drop a bag item here = equip; double-click an equipped slot = unequip.

import { DRESS_HIDE_TEXT, DRESS_PANEL, EQUIP_SLOT_COUNT, MW, charElementOf, type BagItem, type CharProperty, type PlayerData } from '@mc/shared';
import { CharFigure } from './charFigure';
import { endDrag, dragging, fillItemCell } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { stageEl } from './stage';
import './characterPanel.css';

// sid -> [label, x, y] inside the equipment box (CharactorPanel.as eq1..eq22, mwMain / mwSub1..5).
const SLOTS: Record<number, [string, number, number]> = {
  1: ['Mũ', 11, 10], 2: ['Đai', 11, 82], 3: ['Vũ khí', 57, 119], 4: ['Áo', 11, 46], 5: ['Quần', 11, 120],
  6: ['Trang sức 1', 11, 156], 7: ['Trợ thủ', 187, 119], 8: ['Dây chuyền', 232, 10], 9: ['Nhẫn', 232, 82],
  10: ['Hộ vai', 232, 46], 11: ['Trang sức 2', 232, 155], 12: ['Giày', 232, 119], 13: ['Găng thu thập', 187, 156],
  14: ['Phi hành', 57, 156], 15: ['Thần khí chính', 126, 84], 16: ['Thần khí phụ 1', 80, 22], 17: ['Thần khí phụ 2', 170, 22],
  18: ['Thần khí phụ 3', 197, 107], 19: ['Thần khí phụ 4', 126, 157], 20: ['Thần khí phụ 5', 59, 107],
  21: ['Thời trang', 57, 83], 22: ['Cánh', 187, 82],
};
const LOCKED = new Set([15, 16, 17, 18, 19, 20]);
export { SLOTS as EQUIP_SLOTS, LOCKED as LOCKED_EQUIP_SLOTS }; // the other-player info panel reuses the layout

type AttrKey = 'Strength' | 'Agility' | 'Stamina' | 'Intelligence' | 'Energy';
// Property canvas rows (descriptor y): left labels at x 0, right labels at x 155; attribute rows carry +/- buttons.
const ATTRS: [AttrKey, string, number][] = [
  ['Strength', 'Lực', 52], ['Stamina', 'Nhẫn', 73], ['Agility', 'Xảo', 95], ['Intelligence', 'Trí', 117], ['Energy', 'Thần', 139],
];
const COMBAT: [string, keyof CharProperty, number][] = [
  ['Công vật lý', 'finalAttack', 8], ['Công ma pháp', 'finalMAttack', 30], ['Thủ vật lý', 'finalDefence', 52],
  ['Thủ ma pháp', 'finalMDefence', 73], ['Chính xác', 'finalHit', 96], ['Né tránh', 'finalDodge', 117],
  ['Tốc độ', 'finalSpeed', 139], ['Bạo kích', 'finalCritical', 160],
];
// Main tab strip: equipment, magic weapon, star palace, attributes and mount; the last two feature windows remain external.
type TabKey = 'equip' | 'mw' | 'star' | 'attrs' | 'mount';
const TABS: [TabKey, string, string][] = [
  ['equip', 'Tr.bị', 'Trang bị'], ['mw', 'Th.khí', 'Thần khí'], ['star', 'Tinh cung', 'Tinh cung'],
  ['attrs', 'T.tính', 'Thuộc tính'], ['mount', 'Thú cưỡi', 'Thú cưỡi'],
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
  /** "Tinh cung" tab: opens the existing stat-feature window. */
  onFeatures(): void;
  /** Thần khí tab "Chức năng" button: toggles the magic weapon window. */
  onMagicWeapon(): void;
  /** "Hồn khí" button on the equipment page: the Hồn Khí Vương Tộc window (looks, hole level-up, runes). */
  onDeco(): void;
  /** Thần khí tab "Sửa" button: repairs the worn magic weapons. */
  onRepairMagicWeapons(): void;
  /** "Thú cưỡi" tab (legacy tabBtn4 -> showMount). */
  onMount(): void;
  /** "Tủ đồ" button on the equipment page: the dress cabinet (the bag has its own HUD button / B key). */
  onDress(): void;
  /** "Ẩn thời trang" checkbox (setDressHide): current flag and the change handler. */
  dressHidden(): boolean;
  onDressHide(hide: boolean): void;
  /** "Ấn chương", "Ấn thạch" and "Ma tâm" buttons (M13 E2): the medal, stone seal and monster heart windows. */
  onMedal(): void;
  onStoneSeal(): void;
  onMonsterHeart(): void;
  /** "Cánh" button (the wing window) and the "Ẩn cánh" checkbox (setWingHide). */
  onWing(): void;
  wingHidden(): boolean;
  onWingHide(hide: boolean): void;
  /** Right-edge tab: toggles the character's secondary-rate detail window. */
  onDetail(anchor: HTMLElement): void;
  onClose(): void;
}

export class CharacterPanel {
  private root: HTMLElement | null = null;
  private slots = new Map<number, HTMLElement>();
  private stats: HTMLElement | null = null;
  private pending: Record<AttrKey, number> = { Strength: 0, Agility: 0, Stamina: 0, Intelligence: 0, Energy: 0 };
  private step10 = false;
  private mode: 'equip' | 'mw' = 'equip';
  private selectedTab: TabKey = 'equip';
  private tabs = new Map<TabKey, HTMLElement>();
  private mwTools: HTMLElement | null = null;
  private equipTools: HTMLElement | null = null;
  private growthTools: HTMLElement | null = null;
  private dressHide: HTMLInputElement | null = null;
  private wingHide: HTMLInputElement | null = null;
  private figure: CharFigure | null = null;
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
    const tabs = el('div', 'char-tabs');
    this.tabs.clear();
    for (const [key, label, title] of TABS) {
      const b = el('button', 'char-tab', label);
      b.title = title;
      b.onclick = () => this.onTab(key);
      this.tabs.set(key, b);
      tabs.appendChild(b);
    }
    const next = el('button', 'char-next', 'Sau');
    next.title = 'Chuyển tab tiếp theo';
    next.onclick = () => this.nextTab();
    tabs.appendChild(next);
    root.appendChild(tabs);
    const equip = el('div', 'char-equip');
    this.figure = new CharFigure();
    equip.appendChild(this.figure.el);
    this.slots.clear();
    for (let sid = 1; sid <= EQUIP_SLOT_COUNT; sid++) {
      const [label, sx, sy] = SLOTS[sid];
      const cell = el('div', 'char-slot');
      cell.style.left = `${sx}px`;
      cell.style.top = `${sy}px`;
      cell.title = label;
      this.slots.set(sid, cell);
      equip.appendChild(cell);
    }
    const tools = el('div', 'char-mwtools');
    const spirit = el('span', 'char-spirit');
    const repair = el('button', 'char-ok', 'Sửa');
    repair.title = 'Sửa chữa thần khí đang mặc (Thâm Lam Tinh)';
    repair.onclick = () => this.host.onRepairMagicWeapons();
    const fn = el('button', 'char-ok', 'Chức năng');
    fn.title = 'Thăng cấp, phân giải, kỹ năng, chuyển / tái lập thuộc tính';
    fn.onclick = () => this.host.onMagicWeapon();
    tools.append(spirit, repair, fn);
    equip.appendChild(tools);
    this.mwTools = tools;
    const equipTools = el('div', 'char-equiptools');
    const bag = el('button', 'char-ok', DRESS_PANEL.BUTTON);
    bag.title = 'Mở Tủ đồ';
    bag.onclick = () => this.host.onDress();
    const soul = el('button', 'char-ok', 'Hồn khí');
    soul.title = 'Hồn Khí Vương Tộc: hình dạng, cường hóa, phù văn';
    soul.onclick = () => this.host.onDeco();
    const wing = el('button', 'char-ok', 'Cánh');
    wing.title = 'Cải tạo cánh: dung hợp, thăng tinh, lông vũ, thăng cấp';
    wing.onclick = () => this.host.onWing();
    equipTools.append(bag, soul, wing);
    equip.appendChild(equipTools);
    this.equipTools = equipTools;
    const growthTools = el('div', 'char-equiptools char-equiptools2');
    const medal = el('button', 'char-ok', 'Ấn chương');
    medal.title = 'Ấn Chương: trang bị, thăng cấp, phân giải, dòng khắc ấn';
    medal.onclick = () => this.host.onMedal();
    const seal = el('button', 'char-ok', 'Ấn thạch');
    seal.title = 'Ấn Thạch: khai ấn, phong ấn bảo thạch, kết ấn';
    seal.onclick = () => this.host.onStoneSeal();
    const heart = el('button', 'char-ok', 'Ma tâm');
    heart.title = 'Ma Tâm: đặt Ma Tâm, tổ hợp, dung luyện, phân giải';
    heart.onclick = () => this.host.onMonsterHeart();
    growthTools.append(medal, seal, heart);
    equip.appendChild(growthTools);
    this.growthTools = growthTools;
    const hide = el('label', 'char-dresshide');
    hide.title = DRESS_HIDE_TEXT.TIP;
    const hideBox = document.createElement('input');
    hideBox.type = 'checkbox';
    hideBox.onchange = () => this.host.onDressHide(hideBox.checked);
    hide.append(hideBox, document.createTextNode(DRESS_HIDE_TEXT.LABEL));
    equip.appendChild(hide);
    this.dressHide = hideBox;
    const wingHide = el('label', 'char-dresshide char-winghide');
    wingHide.title = 'Ẩn cánh';
    const wingBox = document.createElement('input');
    wingBox.type = 'checkbox';
    wingBox.onchange = () => this.host.onWingHide(wingBox.checked);
    wingHide.append(wingBox, document.createTextNode('Ẩn cánh'));
    equip.appendChild(wingHide);
    this.wingHide = wingBox;
    this.stats = el('div', 'char-stats');
    equip.appendChild(this.stats);
    root.appendChild(equip);
    const detail = el('button', 'char-detail-toggle', '‹');
    detail.title = 'Mở / đóng thông tin chi tiết';
    detail.onclick = () => this.host.onDetail(root);
    root.appendChild(detail);
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
    this.offs.push(makeDraggable(root, header, 'characterPanel'), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.slots.clear();
    this.stats = null;
    this.mwTools = null;
    this.equipTools = null;
    this.growthTools = null;
    this.dressHide = null;
    this.wingHide = null;
    this.figure = null;
    this.tabs.clear();
    this.mode = 'equip';
    this.selectedTab = 'equip';
    this.resetPending();
  }

  private onTab(key: TabKey): void {
    if (key === 'mw' && this.host.player().level < MW.UNLOCK_LEVEL) {
      toast('Cần đạt cấp 50 mới có thể trang bị thần khí', true);
      return;
    }
    this.selectedTab = key;
    if (key === 'star') {
      this.render();
      return this.host.onFeatures();
    }
    if (key === 'mount') {
      this.render();
      return this.host.onMount();
    }
    this.mode = key === 'attrs' ? 'equip' : key;
    this.render();
  }

  private nextTab(): void {
    const current = TABS.findIndex(([key]) => key === this.selectedTab);
    const next = TABS[(current + 1) % TABS.length][0];
    this.onTab(next);
  }

  render(): void {
    if (!this.root || !this.stats) return;
    const p = this.host.player();
    const eq = this.host.equipped();
    for (const [key, b] of this.tabs) b.classList.toggle('on', key === this.selectedTab);
    if (this.mwTools) this.mwTools.style.display = this.mode === 'mw' ? '' : 'none';
    if (this.equipTools) this.equipTools.style.display = this.mode === 'equip' ? '' : 'none';
    if (this.growthTools) this.growthTools.style.display = this.mode === 'equip' ? '' : 'none';
    if (this.dressHide) {
      this.dressHide.checked = this.host.dressHidden();
      (this.dressHide.parentElement as HTMLElement).style.display = this.mode === 'equip' ? '' : 'none';
    }
    if (this.wingHide) {
      this.wingHide.checked = this.host.wingHidden();
      (this.wingHide.parentElement as HTMLElement).style.display = this.mode === 'equip' ? '' : 'none';
    }
    const spirit = this.mwTools?.querySelector('.char-spirit');
    if (spirit) spirit.textContent = `Thần tu: ${p.property?.spirituality ?? 0}`;
    if (this.figure) {
      this.figure.el.style.display = this.mode === 'equip' ? '' : 'none';
      this.figure.set(charElementOf(eq.values()));
    }
    for (const [sid, cell] of this.slots) {
      const mw = sid >= MW.MAIN_POSITION && sid <= MW.SUB_LAST;
      cell.style.display = mw === (this.mode === 'mw') ? '' : 'none';
      const it = eq.get(sid);
      cell.replaceChildren();
      cell.classList.remove('filled');
      cell.draggable = false;
      cell.ondblclick = null;
      cell.style.borderColor = '';
      if (!it) {
        cell.title = SLOTS[sid][0];
        continue;
      }
      fillItemCell(cell, it, { level: p.level, equipped: true, hint: true }, 'equip');
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

  /** Property canvas: absolutely placed labels / value boxes at the legacy descriptor positions. */
  private renderStats(p: PlayerData): void {
    if (!this.stats) return;
    const prop = p.property;
    const free = prop?.lastPoint ?? p.attrPoints;
    if (this.pendingTotal() > free) this.resetPending(); // points were spent elsewhere meanwhile
    const left = free - this.pendingTotal();
    const frag = document.createDocumentFragment();
    const at = <T extends HTMLElement>(node: T, x: number, y: number, w?: number): T => {
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      if (w !== undefined) node.style.width = `${w}px`;
      frag.appendChild(node);
      return node;
    };
    const label = (text: string, x: number, y: number): void => {
      at(el('span', 'char-label', text), x, y).title = text;
    };
    const box = (text: string, x: number, y: number, w: number): HTMLElement => {
      const b = at(el('span', 'char-value', text), x, y, w);
      b.title = text;
      return b;
    };
    label('HP', 0, 8);
    box(`${p.currentHp}/${prop?.finalHp ?? p.maxHp}`, 36, 8, 104);
    label('MP', 0, 30);
    box(`${p.currentMp}/${prop?.finalMp ?? p.maxMp}`, 37, 30, 103);
    for (const [key, text, y] of ATTRS) {
      label(text, 0, y);
      const v = box(n(prop, `final${key}`), 37, y, 60);
      const add = this.pending[key];
      if (add > 0) v.appendChild(el('span', 'char-add', `+${add}`));
      const plus = at(el('button', 'char-pm', '+'), 101, y);
      plus.disabled = left <= 0;
      plus.onclick = () => this.bump(key, this.step10 ? 10 : 1, left);
      const minus = at(el('button', 'char-pm char-minus', '−'), 124, y);
      minus.disabled = add === 0;
      minus.onclick = () => this.bump(key, -(this.step10 ? 10 : 1), left);
    }
    label('Điểm', 0, 159);
    box(String(left), 37, 160, 35).classList.add('char-points');
    const chk = at(document.createElement('label'), 73, 160);
    chk.className = 'char-step';
    chk.title = 'Cộng / trừ 10 điểm mỗi lần';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this.step10;
    cb.onchange = () => {
      this.step10 = cb.checked;
    };
    chk.append(cb, document.createTextNode('*10'));
    const ok = at(el('button', 'char-ok', 'OK'), 108, 159, 32);
    ok.disabled = this.pendingTotal() === 0;
    ok.onclick = () => this.submit();
    for (const [text, key, y] of COMBAT) {
      label(text, 155, y);
      box(n(prop, key), 191, y, 66);
    }
    this.stats.replaceChildren(frag);
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
