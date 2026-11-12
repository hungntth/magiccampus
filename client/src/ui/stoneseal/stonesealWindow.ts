// Ấn Thạch window: 12 equipment slots on the left; on the right the ten seal holes of the selected equipment (stone + equipment gem + add line),
// the seal totals, the bag stone picker and the Khai ấn / Kết ấn / Gỡ bỏ nhanh / Đổi chỗ actions. Pure view over StoneSealUiHost.

import { STONE_SEAL, type StoneSealEquipView, type StoneSealHoleView } from '@mc/shared';
import { iconUrl } from '../../assets';
import { askConfirm } from '../confirmDialog';
import { EQUIP_SLOTS } from '../characterPanel';
import { button, el } from '../feature/dom';
import { FeatureWindow } from '../feature/featureWindow';
import { propLabel } from '../itemTip';
import { boreDialog, succinctDialog } from './stonesealDialogs';
import { addText, addTotals, bagStones, toggleMark } from './stonesealRules';
import { STONE_SEAL_U as U } from './stonesealText';
import type { StoneSealUiHost } from './stonesealTypes';
import './stoneseal.css';

function icon(code: string | undefined, title: string): HTMLElement {
  const cell = el('div', 'ss-icon');
  cell.title = title;
  if (code && code !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(code);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  return cell;
}

function slotList(host: StoneSealUiHost): HTMLElement {
  const col = el('div', 'ss-slots');
  for (const v of host.views()) {
    const b = el('button', `ss-slot${v.sid === host.state.sid ? ' on' : ''}`);
    b.append(el('span', 'ss-slot-pos', EQUIP_SLOTS[v.sid]?.[0] ?? `#${v.sid}`), el('span', 'ss-slot-name', v.equipName || U.NONE));
    if (v.lvl > 0) b.appendChild(el('span', 'ss-badge', `Lv${v.lvl}`));
    b.onclick = () => {
      host.state.sid = v.sid;
      host.state.marks = [];
      host.state.dialog = null;
      host.actions.render();
    };
    col.appendChild(b);
  }
  return col;
}

/** Puts the picked bag stone into a hole (confirm first when it replaces a stone). */
function put(host: StoneSealUiHost, h: StoneSealHoleView): void {
  const id = host.state.pick;
  const go = (): void => {
    host.state.pick = 0;
    host.actions.setStone(h.idx, id);
  };
  if (h.stone) askConfirm(U.REPLACE_CONFIRM, go);
  else go();
}

function holeRow(host: StoneSealUiHost, h: StoneSealHoleView): HTMLElement {
  const st = host.state;
  const row = el('div', `ss-hole${st.marks.includes(h.idx) ? ' mark' : ''}${h.open ? '' : ' closed'}`);
  row.appendChild(el('span', 'ss-idx', String(h.idx)));
  row.appendChild(icon(h.gem?.icon, h.gem ? `${h.gem.name} (${propLabel(h.gem.prop)})` : U.NONE));
  const text = el('div', 'ss-hole-text');
  if (!h.open) {
    text.appendChild(el('div', 'ft-muted', U.NOT_BORED));
  } else if (!h.stone) {
    text.appendChild(el('div', 'ft-muted', st.pick ? U.CLICK_BORE : U.EMPTY));
  } else {
    text.appendChild(el('div', 'ss-name', h.stone.name));
    text.appendChild(el('div', h.weakened ? 'ss-bad' : 'ss-prop', `${propLabel(h.stone.prop)}+${h.stone.num}${h.weakened ? ` (${U.WEAKENED})` : ''}`));
  }
  if (h.gem) text.appendChild(el('div', 'ss-sub', `${h.gem.name}: ${propLabel(h.gem.prop)}+${h.gem.num}`));
  if (h.add) text.appendChild(el('div', 'ss-add', addText(h.add)));
  row.appendChild(text);
  if (h.open && h.stone) row.appendChild(icon(h.stone.icon, h.stone.name));
  const acts = el('div', 'ss-hole-acts');
  if (!h.open) {
    acts.appendChild(button(U.BORE, () => {
      st.dialog = { kind: 'bore', idx: h.idx };
      host.actions.render();
    }));
  } else {
    if (st.pick) acts.appendChild(button('Đặt', () => put(host, h)));
    if (h.stone) acts.appendChild(button(U.REMOVE, () => host.actions.removeStone(h.idx)));
    const m = button(st.marks.includes(h.idx) ? '✓' : '⇄', () => {
      st.marks = toggleMark(st.marks, h.idx);
      host.actions.render();
    });
    m.title = U.SWAP;
    acts.appendChild(m);
  }
  row.appendChild(acts);
  return row;
}

function picker(host: StoneSealUiHost): HTMLElement {
  const box = el('div', 'ss-picker');
  const stones = bagStones(host.items());
  if (stones.length === 0) box.appendChild(el('div', 'ft-muted', U.NO_STONE));
  for (const s of stones) {
    const c = icon(s.iconCode, `${s.name}${s.info ? `\n${s.info}` : ''}`);
    c.classList.add('ss-pickable');
    if (host.state.pick === s.id) c.classList.add('pick');
    if (s.stackNum > 1) c.appendChild(el('span', 'ss-count', String(s.stackNum)));
    c.onclick = () => {
      host.state.pick = host.state.pick === s.id ? 0 : s.id;
      host.actions.render();
    };
    box.appendChild(c);
  }
  return box;
}

function actions(host: StoneSealUiHost, v: StoneSealEquipView, help: HTMLElement): HTMLElement {
  const marks = host.state.marks;
  const row = el('div', 'ft-btns');
  row.append(
    button(U.SUCCINCT, () => {
      host.state.dialog = { kind: 'succinct' };
      host.actions.render();
    }),
    button(U.SWAP, () => {
      host.state.marks = [];
      host.actions.swap(marks[0]!, marks[1]!);
    }, marks.length !== 2),
    button(U.REMOVE_ALL, () => askConfirm(U.CONFIRM_REMOVE_ALL, () => host.actions.removeAll()), !v.holes.some((h) => h.stone)),
    button(U.HOW_TO, () => {
      help.hidden = !help.hidden;
    }),
  );
  return row;
}

function main(host: StoneSealUiHost, body: HTMLElement): void {
  const v = host.views().find((x) => x.sid === host.state.sid);
  if (!v || !v.equipName) {
    body.appendChild(el('div', 'ft-muted', U.NONE));
    return;
  }
  const head = el('div', 'ss-head');
  head.append(icon(v.equipIcon, v.equipName), el('div', 'ss-title', v.equipName), el('div', 'ss-level', U.LEVEL.replace('{num}', String(v.lvl))));
  body.append(head, el('div', 'ss-section', `Bảo thạch (${v.bored}/${STONE_SEAL.HOLES})`), picker(host));
  const holes = el('div', 'ss-holes');
  for (const h of v.holes) holes.appendChild(holeRow(host, h));
  body.appendChild(holes);
  const totals = addTotals(v);
  const sum = el('div', 'ss-sum');
  sum.appendChild(el('div', 'ss-section', U.SUCCINCT_PROPS));
  if (totals.length === 0) sum.appendChild(el('div', 'ft-muted', v.lvl > 0 ? U.NONE : U.NO_SUCCINCT));
  for (const t of totals) sum.appendChild(el('div', 'ss-add', addText(t)));
  body.appendChild(sum);
  const help = el('div', 'ss-help', U.HOW_TO_TEXT.join('\n'));
  help.hidden = true;
  body.append(actions(host, v, help), help);
  const d = host.state.dialog;
  if (d?.kind === 'bore') body.appendChild(boreDialog(host, v, d.idx));
  else if (d?.kind === 'succinct') body.appendChild(succinctDialog(host, v));
}

export function createStoneSealWindow(host: () => StoneSealUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    {
      renderTab: (_tab, body) => {
        const h = host();
        const right = el('div', 'ss-main');
        main(h, right);
        const wrap = el('div', 'ss-wrap');
        wrap.append(slotList(h), right);
        body.appendChild(wrap);
      },
      onTab: () => undefined,
      onClose,
    },
    { title: U.TITLE, tabs: [], cls: 'ss-window' },
  );
}
