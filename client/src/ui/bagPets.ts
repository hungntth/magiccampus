// Pet half of the "Túi đồ" window: 10 "P..." page tabs over a 6 x 3 grid (Flash MAX_PET_PER_PAGE = 18) of the player's pets
// (PlayerData.petList, ordered by id) with a state badge; hover = the TipCre pet tooltip (petTip.ts).

import { PetLimits, PetState, type PetView } from '@mc/shared';
import { iconUrl } from '../assets';
import { attachTip } from './itemTip';
import { renderPetTip } from './petTip';

const PET_SLOTS = 18;
const PET_TABS = 10;
const STATE_BADGE: Record<number, string> = { [PetState.BATTLE]: 'C', [PetState.FOLLOW]: 'T' };

export class BagPets {
  readonly tabs: HTMLElement;
  readonly box: HTMLElement;
  private readonly grid: HTMLElement;
  private page = 0;
  private pets: PetView[] = [];
  private maxNum: number = PetLimits.defaultSlots;

  constructor() {
    this.tabs = el('div', 'bag-tab-row bag-pet-tabs');
    this.box = el('div', 'bag-box bag-pets');
    this.grid = el('div', 'bag-grid');
    this.box.appendChild(this.grid);
  }

  /** Redraws tabs and the current page; `maxNum` (petMaxNum) decides which pages exist. */
  render(petList: Record<number, PetView> | undefined, maxNum: number | undefined): void {
    this.pets = Object.values(petList ?? {}).filter((p): p is PetView => !!p).sort((a, b) => a.id - b.id);
    this.maxNum = Math.max(maxNum ?? PetLimits.defaultSlots, this.pets.length);
    const pages = Math.min(PET_TABS, Math.max(1, Math.ceil(this.maxNum / PET_SLOTS)));
    if (this.page >= pages) this.page = 0;
    const tabs: HTMLElement[] = [];
    for (let i = 0; i < PET_TABS; i++) {
      const tab = el('button', i === this.page ? 'bag-tab selected' : 'bag-tab', 'P...');
      tab.disabled = i >= pages;
      tab.title = i < pages ? `Pet ${i * PET_SLOTS + 1}-${(i + 1) * PET_SLOTS}` : 'Chưa mở thêm ô pet';
      tab.onclick = () => {
        this.page = i;
        this.render(petList, maxNum);
      };
      tabs.push(tab);
    }
    this.tabs.replaceChildren(...tabs);
    const cells: HTMLElement[] = [];
    for (let i = 0; i < PET_SLOTS; i++) {
      const n = this.page * PET_SLOTS + i;
      cells.push(this.cell(this.pets[n], n >= this.maxNum));
    }
    this.grid.replaceChildren(...cells);
  }

  private cell(pet: PetView | undefined, locked: boolean): HTMLElement {
    const c = el('div', locked ? 'bag-cell bag-pet-locked' : 'bag-cell');
    if (!pet) return c;
    c.classList.add('filled');
    const img = document.createElement('img');
    img.src = iconUrl(pet.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    c.appendChild(img);
    c.appendChild(el('span', 'bag-count', String(pet.level)));
    const badge = STATE_BADGE[pet.state];
    if (badge) c.appendChild(el('span', 'bag-pet-state', badge));
    attachTip(c, () => renderPetTip(pet));
    return c;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
