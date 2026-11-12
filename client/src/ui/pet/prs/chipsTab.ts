// "Đổi Thần Dụ" tab: the Mảnh Thần Dụ bag (PRSChipBag, 10 per page), the three exchange slots (PRSExcCvs; a click moves a whole stack
// between the bag and the slots like the Flash drag), Đổi / Đổi Nhanh (three different chips -> one random chip) and the crystal exchange list
// (PRSSlotItem: one chip for its Kết Tinh Thần Dụ cost).

import { PRS, PRS_CHIP_ROWS, PRS_TEXT, type PrsChipSlot, type PrsPanel } from '@mc/shared';
import { iconUrl } from '../../../assets';
import { button, el, fmt } from '../../feature/dom';
import { chipOf, type PrsUiHost } from './prsTypes';

function chipCell(slot: PrsChipSlot | undefined, onClick?: () => void): HTMLElement {
  const cell = el('div', `prs-cell${slot ? '' : ' empty'}`);
  if (slot) {
    const row = chipOf(slot.chipId);
    cell.title = row?.name ?? `#${slot.chipId}`;
    const img = document.createElement('img');
    img.src = iconUrl(row?.iconCode ?? '0');
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.append(img, el('span', 'prs-count', String(slot.chipNum)));
    if (onClick) cell.onclick = onClick;
  }
  return cell;
}

function bagSection(host: PrsUiHost, p: PrsPanel): HTMLElement {
  const box = el('div', 'prs-box');
  const size = Object.keys(p.chipBag).length;
  const pages = Math.max(1, Math.ceil(size / PRS.CHIP_PAGE));
  const page = Math.min(host.chipPage(), pages);
  box.appendChild(el('div', 'prs-title', PRS_TEXT.CHIPS));
  const grid = el('div', 'prs-grid');
  const freeExc = [1, 2, 3].find((i) => !p.excBag[String(i)]) ?? 1;
  for (let i = 1; i <= PRS.CHIP_PAGE; i++) {
    const pos = (page - 1) * PRS.CHIP_PAGE + i;
    grid.appendChild(chipCell(p.chipBag[String(pos)], host.busy() ? undefined : () => host.move(pos, freeExc, PRS.MOVE_TO_EXC)));
  }
  const nav = el('div', 'prs-row');
  nav.append(
    button('<', () => host.setChipPage(page - 1), page <= 1),
    el('span', '', `${page}/${pages}`),
    button('>', () => host.setChipPage(page + 1), page >= pages),
  );
  box.append(grid, nav);
  return box;
}

function swapSection(host: PrsUiHost, p: PrsPanel): HTMLElement {
  const box = el('div', 'prs-box');
  box.append(el('div', 'prs-title', PRS_TEXT.SWAP_TITLE), el('div', 'ft-muted', PRS_TEXT.SWAP_RULE));
  const slots = el('div', 'prs-row');
  const back = Object.keys(p.chipBag).length + 1;
  for (let i = 1; i <= PRS.EXC_SLOTS; i++) {
    slots.appendChild(chipCell(p.excBag[String(i)], host.busy() ? undefined : () => host.move(i, back, PRS.MOVE_TO_BAG)));
  }
  const ids = [1, 2, 3].map((i) => p.excBag[String(i)]?.chipId ?? 0);
  const ready = ids.every((id) => id > 0) && new Set(ids).size === PRS.EXC_SLOTS;
  const actions = el('div', 'prs-row');
  actions.append(button(PRS_TEXT.SWAP, () => host.swap(false), host.busy() || !ready), button(PRS_TEXT.SWAP_FAST, () => host.swap(true), host.busy() || !ready));
  box.append(slots, actions);
  return box;
}

function exchangeSection(host: PrsUiHost): HTMLElement {
  const box = el('div', 'prs-box prs-exchange');
  box.appendChild(el('div', 'prs-title', PRS_TEXT.CRYSTAL_HAVE(host.crystal())));
  for (const chip of [...PRS_CHIP_ROWS].sort((a, b) => a.position - b.position)) {
    const row = el('div', 'prs-xrow');
    row.append(
      chipCell({ chipId: chip.id, chipNum: 1 }),
      el('span', 'prs-xname', chip.name),
      el('span', 'prs-xcost', PRS_TEXT.CRYSTAL_COST(chip.cost)),
      button(PRS_TEXT.SWAP, () => host.exchange(chip.id), host.busy() || host.crystal() < chip.cost),
    );
    box.appendChild(row);
  }
  return box;
}

export function renderChipsTab(host: PrsUiHost, body: HTMLElement): void {
  const p = host.panel();
  if (!p) return;
  const left = el('div', 'prs-col');
  left.append(bagSection(host, p), swapSection(host, p), el('div', 'ft-muted', `${PRS_TEXT.STONE}: ${fmt(host.stone())}`));
  const right = el('div', 'prs-col');
  right.appendChild(exchangeSection(host));
  const cols = el('div', 'prs-cols');
  cols.append(left, right);
  body.appendChild(cols);
}
