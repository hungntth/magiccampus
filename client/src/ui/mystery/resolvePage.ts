// Mật Bảo "Phân Giải" page (legacy MysTreBag + resolve panel): the Túi Mật Bảo grid (30 per page), click toggles a whole stack, "Chọn tất cả", the Bí Ngân preview
// (mys_sil x units), the rune / chip chance lines and the Phân giải button (mysTreObjResolve). Selection survives a re-render and is pruned against the bag.

import { MYS, MYS_TEXT } from '@mc/shared';
import { button, el, fmt } from '../feature/dom';
import { iconCell } from '../deco/decoCells';
import { resolveTotals } from './mysteryRules';
import type { MysteryUiHost } from './mysteryTypes';

export function renderResolve(body: HTMLElement, host: MysteryUiHost): void {
  const { view } = host;
  const catalog = host.catalog()!;
  const bag = host.bag();
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  for (const slot of [...view.picked.keys()]) if (bag[String(slot)]?.mid !== view.picked.get(slot)?.mid) view.picked.delete(slot);
  const box = el('div', 'ft-box');
  box.append(el('div', 'ft-h', `${MYS_TEXT.BAG} · ${MYS_TEXT.RESOLVE_PICK}`));
  const pages = Math.max(1, Math.ceil(Math.max(0, ...Object.keys(bag).map(Number)) / MYS.BAG_PAGE));
  view.page = Math.min(view.page, pages - 1);
  const grid = el('div', 'my-bag');
  for (let n = 1; n <= MYS.BAG_PAGE; n++) {
    const slot = view.page * MYS.BAG_PAGE + n;
    const s = bag[String(slot)];
    const row = s ? byId.get(s.mid) : undefined;
    const cell = row && s ? iconCell(row.iconCode, `${row.name} ${MYS_TEXT.STAR(row.star)}`, s.num) : iconCell('');
    cell.classList.add('my-bag-cell');
    if (row && s) {
      cell.appendChild(el('span', 'dc-lv', MYS_TEXT.STAR(row.star)));
      if (view.picked.has(slot)) cell.classList.add('pick');
      cell.onclick = () => {
        if (view.picked.has(slot)) view.picked.delete(slot);
        else view.picked.set(slot, { mid: s.mid, num: s.num });
        host.actions.render();
      };
    }
    grid.appendChild(cell);
  }
  const nav = el('div', 'dc-controls');
  nav.append(
    button('‹', () => { view.page = Math.max(0, view.page - 1); host.actions.render(); }, view.page <= 0),
    el('span', 'dc-label', `${view.page + 1}/${pages}`),
    button('›', () => { view.page = Math.min(pages - 1, view.page + 1); host.actions.render(); }, view.page >= pages - 1),
    button(MYS_TEXT.SELECT_ALL, () => {
      view.picked = new Map(Object.entries(bag).map(([slot, s]) => [Number(slot), { mid: s.mid, num: s.num }]));
      host.actions.render();
    }),
  );
  box.append(grid, nav);
  const totals = resolveTotals(view.picked, (mid) => byId.get(mid)?.sil ?? 0);
  const info = el('div', 'ft-box');
  info.append(
    el('div', 'ft-h', MYS_TEXT.RESOLVE_GET),
    el('div', 'dc-ok', `${MYS_TEXT.SILVER}: ${fmt(totals.silver)} (${fmt(totals.units)})`),
    el('div', 'dc-sub', MYS_TEXT.CHANCE_RUNE),
    el('div', 'dc-sub', MYS_TEXT.CHANCE_CHIP),
    el('div', 'dc-label', `${MYS_TEXT.SILVER_HAVE}: ${fmt(host.silver())}`),
    button(MYS_TEXT.RESOLVE, () => host.actions.resolve(view.picked), view.picked.size === 0),
  );
  body.append(box, info);
}
