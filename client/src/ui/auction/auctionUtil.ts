// Small helpers shared by the auction windows: price accessors of an AuctionRow, the goods cell (icon + hover tooltip of the listed
// item or pet) and price formatting. Pure view code, no calls.

import { auctionCurrencyLabel, type AuctionRow } from '@mc/shared';
import { iconUrl } from '../../assets';
import { fillItemCell, NAME_COLORS } from '../itemCell';
import { attachTip } from '../itemTip';
import { el, fmt } from '../mail/mailUtil';

export { el, fmt };

export const currentPrice = (r: AuctionRow): number => (r.auctionType === 2 ? r.nowGold : r.nowMoney);
export const buyoutPrice = (r: AuctionRow): number => (r.auctionType === 2 ? r.maxGold : r.maxMoney);
export const priceText = (n: number, auctionType: number): string => `${fmt(n)} ${auctionCurrencyLabel(auctionType)}`;

/** Icon cell of a listing: the escrowed item's full tooltip, or a name / level tooltip for a pet. */
export function goodsCell(r: AuctionRow, playerLevel: number): HTMLElement {
  const cell = el('div', 'bag-cell');
  if (r.item) {
    fillItemCell(cell, r.item, { level: playerLevel }, 'bag');
    cell.draggable = false;
    return cell;
  }
  cell.classList.add('filled');
  if (r.color > 0) cell.style.borderColor = NAME_COLORS[r.color] ?? '';
  if (r.iconCode && r.iconCode !== '0') {
    const img = el('img');
    img.src = iconUrl(r.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (r.stackNum > 1) cell.appendChild(el('span', 'bag-count', String(r.stackNum)));
  const pet = r.pet?.data;
  attachTip(cell, () => {
    const box = el('div', 'it-body');
    box.appendChild(el('div', 'it-name', pet ? `${r.name} (cấp ${pet.level})` : r.name));
    if (pet) box.appendChild(el('div', '', `Thọ mệnh: ${pet.life}`));
    return box;
  });
  return cell;
}

/** Name label in the quality colour. */
export function nameLabel(r: AuctionRow): HTMLElement {
  const n = el('span', 'au-name', r.name);
  if (r.color > 0) n.style.color = NAME_COLORS[r.color] ?? '';
  return n;
}
