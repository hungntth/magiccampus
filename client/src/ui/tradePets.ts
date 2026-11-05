// Pet half of the "Giao dịch" window (M11 phase D): the 5 pet slots of a side and the picker of resting, unbound, gearless pets.
// Pure DOM helpers; TradePanel owns the state and TradeController the RPCs.

import { TRADE_MAX_PETS, type PetView } from '@mc/shared';
import { iconUrl } from '../assets';
import { attachablePets } from './mail/mailCompose';

const div = (cls: string, text?: string): HTMLDivElement => {
  const e = document.createElement('div');
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Fills `box` with TRADE_MAX_PETS slots; a double click on a filled slot of an editable side calls `onRemove`. */
export function fillPetSlots(box: HTMLElement, pets: readonly PetView[], onRemove: ((id: number) => void) | null): void {
  const cells: HTMLElement[] = [];
  for (let i = 0; i < TRADE_MAX_PETS; i++) {
    const cell = div('trade-pet-cell');
    const pet = pets[i];
    if (pet) {
      cell.title = `${pet.petName} (cấp ${pet.level})`;
      const img = document.createElement('img');
      img.src = iconUrl(pet.iconCode);
      img.draggable = false;
      img.onerror = () => img.remove();
      cell.append(img, div('trade-pet-name', pet.petName));
      if (onRemove) cell.ondblclick = () => onRemove(pet.id);
    }
    cells.push(cell);
  }
  box.replaceChildren(...cells);
}

/** Overlay listing the pets that can still be added (not already offered). Returns the element for the caller to mount. */
export function buildPetPicker(all: readonly PetView[], offered: readonly number[], onPick: (pet: PetView) => void, onClose: () => void): HTMLElement {
  const box = div('trade-pet-picker');
  box.appendChild(div('trade-pet-picker-title', 'Chọn pet (đang nghỉ, chưa khóa, không mang trang bị):'));
  const rows = attachablePets(all).filter((p) => !offered.includes(p.id));
  if (rows.length === 0) box.appendChild(div('trade-pet-picker-empty', 'Không có pet nào có thể giao dịch'));
  for (const p of rows) {
    const row = div('trade-pet-row');
    const img = document.createElement('img');
    img.src = iconUrl(p.iconCode);
    img.width = 20;
    img.height = 20;
    img.onerror = () => img.remove();
    row.append(img, div('', ` ${p.petName} (cấp ${p.level})`));
    row.onclick = () => {
      onPick(p);
      onClose();
    };
    box.appendChild(row);
  }
  const close = document.createElement('button');
  close.className = 'trade-btn';
  close.textContent = 'Đóng';
  close.onclick = onClose;
  box.appendChild(close);
  return box;
}
