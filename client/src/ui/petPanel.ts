// "Quản lý pet" window (legacy PetManagerPanel, PANEL_PETMANAGER): pet list (10 per page), selected pet header,
// attribute / skill / equipment tabs, and the actions Xuất chiến / Nghỉ, Đi theo / Hủy theo, Đổi tên, Phóng sinh, Khóa.
// Pure view: PetController owns the data and the RPCs. Skills / equipment tabs: petSkillTab.ts, petEquipTab.ts; "Mở ô pet" is phase E.

import { petGrowColor, petLevelOfExp, type BagItem, type ChangePetPropertyArg, type PetSkillInfo, type PetView } from '@mc/shared';
import { iconUrl } from '../assets';
import { NAME_COLORS } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { renderEquipTab } from './petEquipTab';
import { PetAllocation, el, renderStatsTab } from './petPanelTabs';
import { renderSkillTab } from './petSkillTab';
import { stageEl } from './stage';
import './petPanel.css';

const PAGE_SIZE = 10;
const STATE_LABEL: Record<number, string> = { 1: 'Đấu', 2: 'Hiển', 3: 'Nghỉ' };
type Tab = 'info' | 'skill' | 'equip';
const TABS: [Tab, string][] = [['info', 'Thuộc tính'], ['skill', 'Kỹ năng'], ['equip', 'Trang bị']];

export interface PetPanelHost {
  pets(): PetView[];
  maxNum(): number;
  selected(): number;
  onSelect(id: number): void;
  onState(pet: PetView, target: 1 | 3): void;
  /** Id of the pet following on the map (-1 none) and whether the 5 s follow button lock is active. */
  following(): number;
  followLocked(): boolean;
  onFollow(pet: PetView): void;
  onRename(pet: PetView, name: string): void;
  onRelease(pet: PetView): void;
  onBind(pet: PetView): void;
  onAllocate(pet: PetView, add: ChangePetPropertyArg): void;
  /** Phase E: skill display facts, worn items, slot / skill / equipment actions. */
  skillInfo(id: number): PetSkillInfo | undefined;
  item(id: number): BagItem | undefined;
  onOpenSkill(pet: PetView, slot: number): void;
  onDelSkill(pet: PetView, slot: number): void;
  onEquipOff(pet: PetView, item: BagItem): void;
  onOpenSlot(): void;
  onClose(): void;
}

export class PetPanel {
  private root: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private detail: HTMLElement | null = null;
  private page = 0;
  private tab: Tab = 'info';
  private renaming = false;
  private offs: (() => void)[] = [];
  private readonly alloc = new PetAllocation();

  constructor(private readonly host: PetPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return;
    const root = el('div', 'pet-panel');
    const header = el('div', 'pet-header');
    header.appendChild(el('div', 'pet-title', 'Quản lý pet'));
    root.appendChild(header);
    const x = el('button', 'pet-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.appendChild(x);
    this.list = el('div', 'pet-list');
    this.detail = el('div', 'pet-detail');
    root.append(this.list, this.detail);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'petPanel'), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.list = null;
    this.detail = null;
    this.renaming = false;
    this.alloc.reset();
  }

  render(): void {
    if (!this.root || !this.list || !this.detail) return;
    const pets = this.host.pets();
    const sel = pets.find((p) => p.id === this.host.selected());
    this.alloc.bind(sel?.id ?? -1);
    this.renderList(pets, sel?.id ?? -1);
    this.renderDetail(sel);
  }

  /** Select-by-controller: jump to the page that shows the pet. */
  reveal(id: number): void {
    const i = this.host.pets().findIndex((p) => p.id === id);
    if (i >= 0) this.page = Math.floor(i / PAGE_SIZE);
  }

  private renderList(pets: PetView[], selId: number): void {
    const pages = Math.max(1, Math.ceil(pets.length / PAGE_SIZE));
    this.page = Math.min(this.page, pages - 1);
    const frag = document.createDocumentFragment();
    for (const p of pets.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)) {
      const row = el('div', `pet-row${p.id === selId ? ' sel' : ''}`);
      const icon = document.createElement('img');
      icon.className = 'pet-row-icon';
      icon.alt = '';
      icon.src = iconUrl(p.iconCode);
      const name = el('span', 'pet-row-name', p.petName);
      name.style.color = NAME_COLORS[petGrowColor(p.growRate)] ?? '#fff';
      row.append(icon, name, el('span', 'pet-row-lv', `Lv${petLevelOfExp(p.exp)}`),
        el('span', `pet-row-state s${p.state}`, STATE_LABEL[p.state] ?? ''));
      row.onclick = () => this.host.onSelect(p.id);
      frag.appendChild(row);
    }
    const foot = el('div', 'pet-list-foot');
    const prev = el('button', 'pet-pm', '<');
    prev.disabled = this.page === 0;
    prev.onclick = () => {
      this.page--;
      this.render();
    };
    const next = el('button', 'pet-pm', '>');
    next.disabled = this.page >= pages - 1;
    next.onclick = () => {
      this.page++;
      this.render();
    };
    const open = el('button', 'pet-pm pet-open-slot', '+');
    open.title = 'Mở ô pet';
    open.onclick = () => this.host.onOpenSlot();
    foot.append(prev, el('span', 'pet-count', `${pets.length}/${this.host.maxNum()}`), open, next);
    frag.appendChild(foot);
    this.list?.replaceChildren(frag);
  }

  private renderDetail(pet: PetView | undefined): void {
    if (!this.detail) return;
    if (!pet) {
      this.detail.replaceChildren(el('div', 'pet-empty', 'Bạn chưa có pet nào'));
      return;
    }
    const frag = document.createDocumentFragment();
    frag.appendChild(this.header(pet));
    const tabs = el('div', 'pet-tabs');
    for (const [key, label] of TABS) {
      const b = el('button', `pet-tab${key === this.tab ? ' on' : ''}`, label);
      b.onclick = () => {
        this.tab = key;
        this.render();
      };
      tabs.appendChild(b);
    }
    frag.appendChild(tabs);
    const body = el('div', 'pet-body');
    if (this.tab === 'info') {
      renderStatsTab(body, pet, this.alloc, {
        onChange: () => this.render(), onSubmit: (add) => this.host.onAllocate(pet, add),
      });
    } else if (this.tab === 'skill') {
      renderSkillTab(body, pet, {
        skillInfo: (id) => this.host.skillInfo(id),
        onOpen: (slot) => this.host.onOpenSkill(pet, slot),
        onDelete: (slot) => this.host.onDelSkill(pet, slot),
      });
    } else renderEquipTab(body, pet, { item: (id) => this.host.item(id), onOff: (item) => this.host.onEquipOff(pet, item) });
    frag.appendChild(body);
    frag.appendChild(this.actions(pet));
    this.detail.replaceChildren(frag);
  }

  private header(pet: PetView): HTMLElement {
    const head = el('div', 'pet-head');
    const icon = document.createElement('img');
    icon.className = 'pet-icon';
    icon.alt = '';
    icon.src = iconUrl(pet.iconCode);
    const info = el('div', 'pet-head-info');
    const name = el('div', 'pet-name', pet.petName);
    name.style.color = NAME_COLORS[petGrowColor(pet.growRate)] ?? '#fff';
    info.append(name, el('div', 'pet-sub', `${pet.creatureName}  Cấp ${petLevelOfExp(pet.exp)}`),
      el('div', 'pet-sub', pet.binded ? 'Đã khóa' : 'Chưa khóa, nhấp chọn icon để khóa pet'));
    icon.title = pet.binded ? 'Đã khóa' : 'Chưa khóa, nhấp chọn icon để khóa pet';
    icon.classList.toggle('bound', pet.binded === 1);
    icon.onclick = () => {
      if (!pet.binded) this.host.onBind(pet);
    };
    head.append(icon, info);
    return head;
  }

  private actions(pet: PetView): HTMLElement {
    const bar = el('div', 'pet-actions');
    if (this.renaming) {
      const input = document.createElement('input');
      input.className = 'pet-name-input';
      input.maxLength = 20;
      input.value = pet.petName;
      input.placeholder = 'Tên mới pet (để trống = tên gốc)';
      const done = (save: boolean): void => {
        this.renaming = false;
        if (save && input.value !== pet.petName) this.host.onRename(pet, input.value);
        this.render();
      };
      input.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(true);
        else if (e.key === 'Escape') done(false);
      };
      const ok = el('button', 'pet-btn', 'OK');
      ok.onclick = () => done(true);
      const cancel = el('button', 'pet-btn', 'Hủy');
      cancel.onclick = () => done(false);
      bar.append(input, ok, cancel);
      setTimeout(() => input.focus(), 0);
      return bar;
    }
    const state = el('button', 'pet-btn primary', pet.state === 1 ? 'Nghỉ' : 'Xuất chiến');
    state.onclick = () => this.host.onState(pet, pet.state === 1 ? 3 : 1);
    const follow = el('button', 'pet-btn', pet.id === this.host.following() ? 'Hủy theo' : 'Đi theo');
    follow.disabled = this.host.followLocked();
    follow.onclick = () => this.host.onFollow(pet);
    const rename = el('button', 'pet-btn', 'Đổi tên');
    rename.onclick = () => {
      this.renaming = true;
      this.render();
    };
    const release = el('button', 'pet-btn', 'Phóng sinh');
    release.onclick = () => this.host.onRelease(pet);
    const bind = el('button', 'pet-btn', pet.binded ? 'Đã khóa' : 'Khóa');
    bind.disabled = pet.binded === 1;
    bind.onclick = () => this.host.onBind(pet);
    bar.append(state, follow, rename, release, bind);
    return bar;
  }
}
