// Creature card of the evolution windows: title, icon (iconCode from the static handbook), name and the five aptitudes. Shared by
// the Tiến Hóa tab (before / after) and the Sách Tiến Hóa detail pane.

import { PET_APTITUDE_KEYS, type PetHandbookCreature } from '@mc/shared';
import { iconUrl } from '../../assets';
import { el } from '../petPanelTabs';
import { APT_LABEL } from '../petfunc/petFuncRules';

export function creatureCard(title: string, c: PetHandbookCreature | null, compare?: PetHandbookCreature | null): HTMLElement {
  const card = el('div', 'pe-card');
  card.appendChild(el('div', 'pe-card-title', title));
  if (!c) {
    card.appendChild(el('div', 'pf-line', '—'));
    return card;
  }
  const img = document.createElement('img');
  img.src = iconUrl(c.icon);
  img.alt = '';
  img.draggable = false;
  img.onerror = () => img.remove();
  const face = el('div', 'pe-card-icon');
  face.appendChild(img);
  card.append(face, el('div', 'pe-card-name', c.name));
  PET_APTITUDE_KEYS.forEach((key, i) => {
    const row = el('div', 'pe-apt');
    const diff = compare ? (compare.apt[i] ?? 0) - (c.apt[i] ?? 0) : 0;
    row.append(el('span', '', `${APT_LABEL[key]}: ${c.apt[i] ?? 0}`));
    if (diff !== 0) row.appendChild(el('span', diff > 0 ? 'ok' : 'bad', ` ${diff > 0 ? '+' : ''}${diff}`));
    card.appendChild(row);
  });
  return card;
}
