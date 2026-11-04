// Skills tab of the pet window: 15 slots (-1 locked, 0 empty, > 0 learned). A locked slot shows its gold cost and opens
// on click (confirm in PetGearActions); a learned slot shows the skill icon with a delete button; books are learned by
// double-clicking them in the bag while the window is open.

import { PET_FIRST_LOCKED_SLOT, petSkillOpenCost, type PetSkillInfo, type PetView } from '@mc/shared';
import { iconUrl } from '../assets';
import { el } from './petPanelTabs';

export interface SkillTabContext {
  skillInfo(id: number): PetSkillInfo | undefined;
  onOpen(slot: number): void;
  onDelete(slot: number): void;
}

export function renderSkillTab(body: HTMLElement, pet: PetView, ctx: SkillTabContext): void {
  const grid = el('div', 'pet-slots');
  for (let i = 1; i <= 15; i++) {
    const v = pet[`skill${i as 1}`];
    const cell = el('div', `pet-slot${v < 0 ? ' locked' : ''}`);
    cell.dataset.slot = String(i);
    if (v > 0) fillLearned(cell, v, ctx.skillInfo(v), () => ctx.onDelete(i));
    else if (v === 0) cell.title = 'Ô kỹ năng trống. Nhấp đôi sách kỹ năng trong túi đồ để học.';
    else fillLocked(cell, i, pet.qLevel, () => ctx.onOpen(i));
    grid.appendChild(cell);
  }
  body.append(grid, el('div', 'pet-note', 'Nhấp đôi sách kỹ năng trong túi để học. Nhấp ô khóa để mở.'));
}

function fillLearned(cell: HTMLElement, id: number, info: PetSkillInfo | undefined, onDelete: () => void): void {
  cell.classList.add('learned');
  cell.title = info ? `${info.name}${info.type === 11 ? ' (bị động)' : ''}\n${info.info}` : `Kỹ năng ${id}`;
  if (info && info.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(info.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  cell.appendChild(el('span', 'pet-slot-name', info?.name ?? `#${id}`));
  const del = el('button', 'pet-slot-del', '×');
  del.title = 'Xóa kỹ năng';
  del.onclick = (e) => {
    e.stopPropagation();
    onDelete();
  };
  cell.appendChild(del);
}

function fillLocked(cell: HTMLElement, slot: number, qLevel: number, onOpen: () => void): void {
  const cost = petSkillOpenCost(slot, qLevel);
  if (slot < PET_FIRST_LOCKED_SLOT || cost === null) {
    cell.textContent = 'Khóa';
    cell.title = 'Ô kỹ năng chưa mở';
    return;
  }
  cell.classList.add('openable');
  cell.title = `Mở ô kỹ năng: ${cost} Kim phiếu / Vàng`;
  cell.append(el('span', 'pet-slot-open', 'Mở'), el('span', 'pet-slot-cost', String(cost)));
  cell.onclick = onOpen;
}
