// "Hồn Khí" tab (legacy DecorateItem list + the look controls): the five shows of the chosen position (activate with gold, wear, take off),
// show / hide, the look tier (2 needs hole level 30, 3 needs 50) and the suit box (getDecoSuitProp: pieces worn, full-suit and link bonus).

import { DECO_PANEL, decoMaxShowLvl, type DecoShowRow } from '@mc/shared';
import { button, el } from '../feature/dom';
import { iconCell, positionBar } from './decoCells';
import { lineText, showsAt, showState } from './decoRules';
import type { DecoUiHost } from './decoTypes';

function showRow(host: DecoUiHost, show: DecoShowRow, now: number): HTMLElement {
  const p = host.info()[String(host.view.position)];
  const state = showState(p, show, now);
  const row = el('div', `dc-row${host.view.showSel === show.id ? ' sel' : ''}`);
  row.onclick = () => {
    host.view.showSel = show.id;
    host.actions.suit(show);
  };
  const text = el('div', 'dc-row-text');
  text.append(el('div', 'dc-name', show.name), el('div', 'dc-sub', show.props.map(lineText).join('  ')));
  const status = state === 'locked' ? (show.activeGold > 0 ? `${show.activeGold} vàng` : DECO_PANEL.NOT_ACTIVE) : DECO_PANEL.ACTIVE;
  const act = state === 'locked'
    ? button(DECO_PANEL.BTN_ACTIVATE, () => host.actions.activate(show), show.activeGold <= 0)
    : button(state === 'worn' ? DECO_PANEL.BTN_UNEQUIP : DECO_PANEL.BTN_EQUIP, () => host.actions.equip(show, state !== 'worn'));
  if (state === 'locked' && show.activeGold <= 0) act.title = DECO_PANEL.EVENT_ONLY;
  row.append(iconCell(show.iconCode, show.desc), text, el('div', `dc-state${state === 'locked' ? '' : ' on'}`, status), act);
  return row;
}

function suitBox(host: DecoUiHost): HTMLElement {
  const box = el('div', 'ft-box dc-suit');
  const r = host.suitReply();
  box.appendChild(el('div', 'ft-h', `${DECO_PANEL.SUIT}${r?.actName ? `: ${r.actName}` : ''}`));
  if (!r) {
    box.appendChild(el('div', 'ft-muted', DECO_PANEL.NONE));
    return box;
  }
  const total = Object.keys(r.suitIdObj).length;
  box.appendChild(el('div', r.actFlag ? 'dc-ok' : 'ft-muted', `${r.actArr.length}/${total}  ${r.actFlag ? DECO_PANEL.ACTIVE : DECO_PANEL.NOT_ACTIVE}`));
  box.appendChild(el('div', 'dc-sub', r.suitProp.map((l) => `${lineText({ t: l.t, v: l.propVal })}`).join('  ') || '-'));
  if (Array.isArray(r.linkProp)) {
    box.appendChild(el('div', r.linkFlag ? 'dc-ok' : 'ft-muted', `${r.actLinkSuitName}: ${r.linkProp.map((l) => lineText({ t: l.t, v: l.propVal })).join('  ')}`));
  }
  return box;
}

export function renderLook(body: HTMLElement, host: DecoUiHost): void {
  const position = host.view.position;
  const p = host.info()[String(position)];
  const now = Date.now();
  const rows = el('div', 'dc-rows');
  for (const show of showsAt(host.catalog(), position)) rows.appendChild(showRow(host, show, now));
  const controls = el('div', 'dc-controls');
  controls.appendChild(button(p.isShow === 1 ? DECO_PANEL.HIDE : DECO_PANEL.SHOW, () => host.actions.setVisible(position, p.isShow !== 1)));
  controls.appendChild(el('span', 'dc-label', `${DECO_PANEL.LOOK}:`));
  const max = decoMaxShowLvl(p.level);
  DECO_PANEL.LOOK_TIER.forEach((label, i) => {
    const tier = i + 1;
    const b = button(label, () => host.actions.setTier(position, tier), tier > max);
    if (p.showLvl === tier) b.classList.add('on');
    if (tier > max) b.title = DECO_PANEL.TIER_LOCK[tier - 1];
    controls.appendChild(b);
  });
  body.append(positionBar(host), rows, controls, suitBox(host));
}
