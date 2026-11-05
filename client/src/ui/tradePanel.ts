// "Giao dịch" window (legacy TradePanel, DOM): the other player's frame (filled by onTargetLock) and your own frame with 5 item
// slots (fed by bag double-click / drag) and 5 pet slots (Thêm pet picker, tradePets.ts), Bạc / Vàng inputs and the Khóa / Xác nhận / Hủy buttons. State machine as in Flash:
// normal -> lock -> confirm; items and money are editable only in `normal`. Pure view: TradeController owns the RPCs and pushes.

import { TRADE_MAX_ITEMS, TRADE_MAX_PETS, type BagItem, type PetView, type PlayerData, type TargetLock, type TradeOffer } from '@mc/shared';
import { endDrag, dragging, fillItemCell } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import { buildPetPicker, fillPetSlots } from './tradePets';
import './bag.css';
import './tradePanel.css';

export type TradeState = 'normal' | 'lock' | 'confirm';

export interface TradePanelHost {
  player(): PlayerData;
  /** Own pets (the picker offers the resting, unbound ones). */
  pets(): PetView[];
  /** A bag item id dragged onto the panel (resolved by the controller from the bag). */
  itemById(id: number): BagItem | undefined;
  onLock(offer: TradeOffer): void;
  onConfirm(): void;
  /** Hủy button / close button / Esc. */
  onCancel(): void;
}

const el = <K extends 'div' | 'button' | 'span' | 'input'>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class TradePanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private mine: BagItem[] = [];
  private minePets: PetView[] = [];
  private picker: HTMLElement | null = null;
  private state: TradeState = 'normal';
  private target: TargetLock | null = null;
  private targetConfirmed = false;
  private money!: HTMLInputElement;
  private gold!: HTMLInputElement;

  constructor(private readonly host: TradePanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  get current(): TradeState {
    return this.state;
  }

  open(targetName: string): void {
    this.close();
    this.mine = [];
    this.minePets = [];
    this.state = 'normal';
    this.target = null;
    this.targetConfirmed = false;
    const root = el('div', 'trade-panel');
    const header = el('div', 'trade-header');
    header.append(el('div', 'trade-title', `Giao dịch với ${targetName}`));
    const x = el('button', 'trade-close', '×');
    x.title = 'Hủy giao dịch';
    x.onclick = () => this.host.onCancel();
    header.appendChild(x);
    const cols = el('div', 'trade-cols');
    cols.append(this.column('target', 'Khung giao dịch đối phương'), this.column('self', 'Khung giao dịch bản thân'));
    root.append(header, cols, el('div', 'trade-hint', 'Nhấp đôi vật phẩm trong túi đồ hoặc bấm Thêm pet để thêm, nhấp đôi vào khung để xóa'), this.buttons());
    stageEl().appendChild(root);
    this.root = root;
    this.offs = [makeDraggable(root, header, 'tradePanel'), closeOnEscape(() => this.host.onCancel())];
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.picker = null;
    this.root?.remove();
    this.root = null;
  }

  /** Bag double-click / drag: adds to the first free slot (no duplicates). Returns false when refused. */
  addItem(item: BagItem): boolean {
    if (!this.root || this.state !== 'normal') return false;
    if (this.mine.some((i) => i.id === item.id) || this.mine.length >= TRADE_MAX_ITEMS) return false;
    this.mine.push(item);
    this.render();
    return true;
  }

  /** Pet picker pick: adds to the first free pet slot (no duplicates). Returns false when refused. */
  addPet(pet: PetView): boolean {
    if (!this.root || this.state !== 'normal') return false;
    if (this.minePets.some((p) => p.id === pet.id) || this.minePets.length >= TRADE_MAX_PETS) return false;
    this.minePets.push(pet);
    this.render();
    return true;
  }

  setState(state: TradeState): void {
    this.state = state;
    this.render();
  }

  /** onTargetLock: shows what the other side offers; a re-lock also resets our own confirmation back to `lock`. */
  setTarget(lock: TargetLock): void {
    this.target = lock;
    this.targetConfirmed = false;
    if (this.state === 'confirm') this.state = 'lock';
    this.render();
  }

  setTargetConfirmed(): void {
    this.targetConfirmed = true;
    this.render();
  }

  offer(): TradeOffer {
    const n = (i: HTMLInputElement): number => Math.max(0, Math.floor(Number(i.value) || 0));
    return { money: n(this.money), gold: n(this.gold), items: this.mine.map((i) => i.id), pets: this.minePets.map((p) => p.id) };
  }

  private column(side: 'target' | 'self', title: string): HTMLElement {
    const col = el('div', `trade-col trade-${side}`);
    col.appendChild(el('div', 'trade-col-title', title));
    col.appendChild(el('div', 'trade-status'));
    col.appendChild(el('div', 'trade-slots'));
    col.appendChild(el('div', 'trade-pets'));
    if (side === 'self') {
      const add = el('button', 'trade-btn trade-add-pet', 'Thêm pet');
      add.onclick = () => this.togglePicker();
      col.appendChild(add);
    }
    const wallet = el('div', 'trade-wallet');
    for (const [key, label] of [['money', 'Bạc'], ['gold', 'Vàng']] as const) {
      const row = el('div', 'trade-money');
      row.append(el('span', 'trade-money-label', label));
      const input = el('input', `trade-input trade-in-${key}`);
      input.type = 'number';
      input.min = '0';
      input.value = '0';
      input.onkeydown = (e) => e.stopPropagation();
      if (side === 'self') {
        input.oninput = () => this.clampInputs();
        if (key === 'money') this.money = input;
        else this.gold = input;
      } else input.disabled = true;
      row.appendChild(input);
      wallet.appendChild(row);
    }
    col.appendChild(wallet);
    if (side === 'self') {
      col.ondragover = (e) => {
        if (dragging() && this.state === 'normal') e.preventDefault();
      };
      col.ondrop = (e) => {
        e.preventDefault();
        const d = dragging();
        endDrag();
        const item = d && d.from === 'bag' ? this.host.itemById(d.id) : undefined;
        if (item) this.addItem(item);
      };
    }
    return col;
  }

  private buttons(): HTMLElement {
    const bar = el('div', 'trade-buttons');
    const lock = el('button', 'trade-btn trade-lock', 'Khóa');
    lock.onclick = () => this.host.onLock(this.offer());
    const confirm = el('button', 'trade-btn trade-confirm', 'Giao dịch');
    confirm.onclick = () => this.host.onConfirm();
    const cancel = el('button', 'trade-btn trade-cancel', 'Hủy');
    cancel.onclick = () => this.host.onCancel();
    bar.append(lock, confirm, cancel);
    return bar;
  }

  private removePet(id: number): void {
    this.minePets = this.minePets.filter((p) => p.id !== id);
    this.render();
  }

  private togglePicker(): void {
    if (this.picker) return this.closePicker();
    if (!this.root || this.state !== 'normal') return;
    this.picker = buildPetPicker(this.host.pets(), this.minePets.map((p) => p.id), (p) => this.addPet(p), () => this.closePicker());
    this.root.appendChild(this.picker);
  }

  private closePicker(): void {
    this.picker?.remove();
    this.picker = null;
  }

  private clampInputs(): void {
    const p = this.host.player();
    for (const [input, max] of [[this.money, p.money ?? 0], [this.gold, p.gold ?? 0]] as const) {
      if (Number(input.value) > max) input.value = String(max);
      if (Number(input.value) < 0) input.value = '0';
    }
  }

  private render(): void {
    const root = this.root;
    if (!root) return;
    const player = this.host.player();
    const live = new Set(this.host.pets().map((p) => p.id));
    this.minePets = this.minePets.filter((p) => live.has(p.id)); // a pet that left meanwhile (released, sent) is dropped
    const editable = this.state === 'normal';
    this.fillSlots(root.querySelector('.trade-self .trade-slots') as HTMLElement, this.mine, editable, player.level);
    this.fillSlots(root.querySelector('.trade-target .trade-slots') as HTMLElement, this.target?.itemList ?? [], false, player.level);
    fillPetSlots(root.querySelector('.trade-self .trade-pets') as HTMLElement, this.minePets, editable ? (id) => this.removePet(id) : null);
    fillPetSlots(root.querySelector('.trade-target .trade-pets') as HTMLElement, this.target?.petList.map((w) => w.data) ?? [], null);
    (root.querySelector('.trade-add-pet') as HTMLButtonElement).disabled = !editable;
    if (!editable) this.closePicker();
    (root.querySelector('.trade-target .trade-in-money') as HTMLInputElement).value = String(this.target?.money ?? 0);
    (root.querySelector('.trade-target .trade-in-gold') as HTMLInputElement).value = String(this.target?.gold ?? 0);
    this.money.disabled = this.gold.disabled = !editable;
    this.money.max = String(player.money ?? 0);
    this.gold.max = String(player.gold ?? 0);
    const label = (s: TradeState): string => (s === 'normal' ? '' : s === 'lock' ? 'Đã khóa' : 'Đã xác nhận');
    (root.querySelector('.trade-self .trade-status') as HTMLElement).textContent = label(this.state);
    (root.querySelector('.trade-target .trade-status') as HTMLElement).textContent =
      this.targetConfirmed ? 'Đã xác nhận' : this.target ? 'Đã khóa' : 'Chưa khóa';
    (root.querySelector('.trade-lock') as HTMLButtonElement).disabled = !editable;
    (root.querySelector('.trade-confirm') as HTMLButtonElement).disabled = this.state !== 'lock';
  }

  private fillSlots(box: HTMLElement, items: readonly BagItem[], removable: boolean, level: number): void {
    const cells: HTMLElement[] = [];
    for (let i = 0; i < TRADE_MAX_ITEMS; i++) {
      const c = el('div', 'bag-cell trade-cell');
      const item = items[i];
      if (item) {
        fillItemCell(c, item, { level }, 'bag');
        c.draggable = false;
        if (removable) {
          c.ondblclick = () => {
            this.mine = this.mine.filter((m) => m.id !== item.id);
            this.render();
          };
        }
      }
      cells.push(c);
    }
    box.replaceChildren(...cells);
  }
}
