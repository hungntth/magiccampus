// "Phù Văn" tab (legacy RuneSlot / RuneBag / RuneBagUpLvl / RuneClickBag / RuneChipBag, click based instead of drag and drop): the 16 rune
// holes of the chosen Hồn Khí (odd = Nhân vật page, even = Pet page, opened by the Hồn Khí level), the rune bag with a page switch, the
// up-level hole, the dissolve mode and the chip exchange. Select a rune, then click an open hole (or "Khảm"); click a filled hole to take it back.

import { DECO_PANEL, DECO_RUNE_UNLOCK_LEVELS, decoRuneSlotOpen, runePanelText } from '@mc/shared';
import { button, el, fmt } from '../feature/dom';
import { iconCell, positionBar, runeCell } from './decoCells';
import { dissolveGain, firstSocket, pageHoles, pageTotals, propName } from './decoRules';
import type { DecoUiHost } from './decoTypes';

function holeCell(host: DecoUiHost, holePos: number): HTMLElement {
  const p = host.info()[String(host.view.position)];
  const page = holePos % 2 === 1 ? 0 : 1;
  const open = decoRuneSlotOpen(p.level, holePos - 1);
  const rune = host.rune(p.r[holePos - 1]);
  if (rune) {
    const c = runeCell(host, rune, 1);
    c.classList.add('filled');
    c.onclick = () => host.actions.unsocket(holePos, page, host.view.position);
    return c;
  }
  const c = iconCell('', open ? DECO_PANEL.RUNE_HINT : DECO_PANEL.SLOT_LOCK(DECO_RUNE_UNLOCK_LEVELS[holePos - 1]));
  c.classList.add(open ? 'dc-hole' : 'dc-locked');
  if (open) {
    c.onclick = () => {
      const { sel, page: bagPage } = host.view;
      if (sel >= 0 && bagPage === page) host.actions.socket(sel, holePos, page, host.view.position);
    };
  }
  return c;
}

function holes(host: DecoUiHost): HTMLElement {
  const box = el('div', 'ft-box dc-holes');
  box.appendChild(el('div', 'ft-h', DECO_PANEL.RUNE_ADD));
  const grid = el('div', 'dc-hole-grid');
  DECO_PANEL.PAGE.forEach((label) => grid.appendChild(el('div', 'dc-label', label)));
  const cha = pageHoles(0);
  const pet = pageHoles(1);
  cha.forEach((h, i) => grid.append(holeCell(host, h), holeCell(host, pet[i])));
  box.appendChild(grid);
  for (const [i, label] of DECO_PANEL.PAGE.entries()) {
    const lines = pageTotals(host.info(), i, (id) => host.rune(id)).map((l) => `${propName(l.t)}+${runePanelText(l.t, l.v)}`);
    box.appendChild(el('div', 'dc-sub', `${label}: ${lines.join('  ') || '-'}`));
  }
  return box;
}

function bagGrid(host: DecoUiHost): HTMLElement {
  const { view } = host;
  const bag = host.bag();
  const slots = view.page === 1 ? bag.petBag : bag.chaBag;
  const used = Math.max(-1, ...Object.keys(slots).map(Number));
  const total = Math.max(40, Math.ceil((used + 1) / 5) * 5);
  const grid = el('div', 'dc-grid');
  for (let i = 0; i < total; i++) {
    const s = slots[String(i)];
    const rune = s ? host.rune(s.r) : undefined;
    const cell = rune && s ? runeCell(host, rune, s.n) : iconCell('');
    if (view.sel === i && !view.resolve) cell.classList.add('pick');
    if (view.resolve && view.picked.has(String(i))) cell.classList.add('pick');
    if (rune) {
      cell.onclick = () => {
        if (view.resolve) {
          if (!view.picked.delete(String(i))) view.picked.add(String(i));
        } else view.sel = view.sel === i ? -1 : i;
        host.actions.render();
      };
    }
    grid.appendChild(cell);
  }
  return grid;
}

function bagBox(host: DecoUiHost): HTMLElement {
  const { view, actions } = host;
  const box = el('div', 'ft-box dc-bag');
  const tabs = el('div', 'ft-btns');
  DECO_PANEL.PAGE.forEach((label, i) => {
    const b = button(label, () => {
      view.page = i;
      view.sel = -1;
      view.picked.clear();
      actions.render();
    });
    if (view.page === i) b.classList.add('on');
    tabs.appendChild(b);
  });
  tabs.appendChild(button(DECO_PANEL.ARRANGE, () => actions.arrange(view.page)));
  box.append(el('div', 'ft-h', DECO_PANEL.RUNE_BAG), tabs, bagGrid(host));
  const slots = view.page === 1 ? host.bag().petBag : host.bag().chaBag;
  const held = view.sel >= 0 ? host.rune(slots[String(view.sel)]?.r ?? 0) : undefined;
  const p = host.info()[String(view.position)];
  const ops = el('div', 'ft-btns');
  const target = held ? firstSocket(p, held, (id) => host.rune(id)) : 0;
  ops.append(
    button('Khảm', () => actions.socket(view.sel, target, view.page, view.position), !held || target === 0 || view.resolve),
    button(DECO_PANEL.UP_TITLE, () => actions.stage(view.sel, view.page), !held || view.resolve),
    button(DECO_PANEL.RESOLVE_TITLE, () => {
      view.resolve = !view.resolve;
      view.sel = -1;
      view.picked.clear();
      actions.render();
    }),
  );
  box.appendChild(ops);
  if (view.resolve) box.appendChild(resolveBox(host));
  return box;
}

function resolveBox(host: DecoUiHost): HTMLElement {
  const { view, actions } = host;
  const slots = view.page === 1 ? host.bag().petBag : host.bag().chaBag;
  const box = el('div', 'dc-resolve');
  box.append(el('div', 'ft-muted', DECO_PANEL.RESOLVE_PICK), el('div', '', DECO_PANEL.RESOLVE_GAIN(dissolveGain(host.bag(), view.page, view.picked, (id) => host.rune(id)))));
  const row = el('div', 'ft-btns');
  row.append(
    button(DECO_PANEL.SELECT_ALL, () => {
      for (const k of Object.keys(slots)) view.picked.add(k);
      actions.render();
    }),
    button(DECO_PANEL.RESOLVE_TITLE, () => {
      const obj: Record<string, number> = {};
      for (const k of view.picked) obj[k] = slots[k]?.r ?? 0;
      view.picked.clear();
      actions.resolve(obj, view.page);
    }, view.picked.size === 0),
  );
  box.appendChild(row);
  return box;
}

function upLevelBox(host: DecoUiHost): HTMLElement {
  const box = el('div', 'ft-box dc-up');
  const staged = host.rune(host.bag().upLvlHole);
  box.appendChild(el('div', 'ft-h', DECO_PANEL.UP_TITLE));
  const row = el('div', 'dc-up-row');
  const cell = staged ? runeCell(host, staged, 1) : iconCell('', DECO_PANEL.UP_HINT);
  if (staged) cell.onclick = () => host.actions.unstage(staged.k === 2 ? 1 : 0);
  const info = el('div', 'dc-up-info');
  info.append(
    el('div', '', staged ? (staged.nx > 0 ? DECO_PANEL.EXP_NEED(staged.ue) : DECO_PANEL.MAX) : DECO_PANEL.UP_HINT),
    el('div', '', `${DECO_PANEL.EXP_HAVE}${fmt(host.runeExp())}`),
  );
  row.append(cell, info, button(DECO_PANEL.UP_TITLE, () => host.actions.upLevel(), !staged || staged.nx <= 0));
  box.appendChild(row);
  return box;
}

function chipBox(host: DecoUiHost): HTMLElement {
  const box = el('div', 'ft-box dc-chips');
  box.appendChild(el('div', 'ft-h', DECO_PANEL.EXCHANGE));
  const lines = Object.values(host.chips()).map((c) => {
    const row = host.runes().chips.find((x) => x.id === Number(c.chipId));
    return row ? `${row.name} x${c.num} (${Math.floor(c.num / row.num)} phù văn)` : `#${c.chipId} x${c.num}`;
  });
  box.appendChild(el('div', 'dc-sub', lines.join('\n') || DECO_PANEL.NONE));
  box.appendChild(button(DECO_PANEL.EXCHANGE, () => host.actions.exchange(), lines.length === 0));
  return box;
}

export function renderRune(body: HTMLElement, host: DecoUiHost): void {
  const left = el('div', 'dc-left');
  left.append(holes(host), upLevelBox(host), chipBox(host));
  const split = el('div', 'dc-split');
  split.append(left, bagBox(host));
  body.append(positionBar(host), split);
}
