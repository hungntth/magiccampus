// Small item cell shared by the forge tabs: icon, quality border, stack / requirement count, tooltip. Not draggable
// (the bag window owns drag and drop).

import { iconUrl } from '../../assets';
import { NAME_COLORS } from '../itemCell';
import { el } from '../shopCell';

export interface ForgeCellSpec {
  iconCode: string;
  name: string;
  color: number;
  /** Text in the bottom-right corner ("3/5", "x12"). */
  count?: string;
  /** Red count when the player lacks the units. */
  lacking?: boolean;
  title?: string;
}

export function forgeCell(spec: ForgeCellSpec, cls = 'forge-cell'): HTMLElement {
  const c = el('div', cls);
  c.title = spec.title ?? spec.name;
  if (spec.color > 0) c.style.borderColor = NAME_COLORS[spec.color] ?? '';
  if (spec.iconCode && spec.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(spec.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    c.appendChild(img);
  }
  if (spec.count) {
    const n = el('span', 'forge-count', spec.count);
    if (spec.lacking) n.classList.add('lacking');
    c.appendChild(n);
  }
  return c;
}
