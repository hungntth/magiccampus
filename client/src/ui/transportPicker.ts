// Teleport scroll map picker (legacy WorldMapIcon list): searchable list of reachable maps, "Cá nhân" / "Nhóm" radios for a party
// leader, Dịch chuyển / Hủy. The caller supplies the pay wording (scroll or gold) and what happens on confirm.

import type { TransportMapEntry } from '@mc/shared';
import { stageEl } from './stage';
import './bag.css';
import './transport.css';

export interface TransportPickerOptions {
  maps: TransportMapEntry[];
  current: number;
  /** Party leader: offers the "Nhóm" mode (followers come along, senior scroll / 5 gold). */
  leader: boolean;
  /** Payment line shown under the list for the chosen mode (scroll in the bag or gold). */
  payText(group: boolean): string;
  onPick(mapId: number, group: boolean): void;
  /** Called whenever the picker closes (pick, cancel or Esc). */
  onClose?(): void;
}

/** Opens the picker; returns a function that closes it. */
export function openTransportPicker(opts: TransportPickerOptions): () => void {
  const root = document.createElement('div');
  root.className = 'amount-dialog transport-picker';
  const title = document.createElement('div');
  title.className = 'amount-title';
  title.textContent = 'Chọn bản đồ cần đến';
  const search = document.createElement('input');
  search.className = 'amount-input';
  search.placeholder = 'Tìm bản đồ...';
  const list = document.createElement('div');
  list.className = 'tp-list';
  const pay = document.createElement('div');
  pay.className = 'amount-total';
  const row = document.createElement('div');
  row.className = 'amount-row';
  const go = document.createElement('button');
  go.className = 'amount-btn';
  go.textContent = 'Dịch chuyển';
  go.disabled = true;
  const cancel = document.createElement('button');
  cancel.className = 'amount-btn';
  cancel.textContent = 'Hủy';
  row.append(go, cancel);

  let group = false;
  let selected = 0;
  const modes = document.createElement('div');
  modes.className = 'tp-modes';
  if (opts.leader) {
    for (const [label, value] of [['Cá nhân', false], ['Nhóm', true]] as const) {
      const lab = document.createElement('label');
      lab.className = 'pay-radio';
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'tp-mode';
      r.checked = value === group;
      r.onchange = () => {
        group = value;
        refresh();
      };
      lab.append(r, document.createTextNode(label));
      modes.append(lab);
    }
  }

  const refresh = (): void => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();
    for (const m of opts.maps) {
      if (q && !m.name.toLowerCase().includes(q) && String(m.id) !== q) continue;
      const b = document.createElement('button');
      b.className = 'tp-item' + (m.id === selected ? ' selected' : '') + (m.id === opts.current ? ' here' : '');
      b.textContent = `${m.name}${m.level > 0 ? ` (Lv ${m.level})` : ''}`;
      b.dataset.mapId = String(m.id);
      b.disabled = m.id === opts.current;
      b.onclick = () => {
        selected = m.id;
        refresh();
      };
      b.ondblclick = () => confirm();
      list.append(b);
    }
    go.disabled = selected === 0;
    pay.textContent = opts.payText(group);
  };
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    opts.onClose?.();
  };
  const confirm = (): void => {
    if (selected === 0) return;
    const id = selected;
    close();
    opts.onPick(id, group);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close();
    }
  };
  search.oninput = refresh;
  go.onclick = confirm;
  cancel.onclick = close;
  root.append(title, search, list, modes, pay, row);
  window.addEventListener('keydown', onKey, true);
  stageEl().appendChild(root);
  refresh();
  search.focus();
  return close;
}
