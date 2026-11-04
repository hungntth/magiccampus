// "NPC nhiệm vụ" window (legacy QuestPanel.as + QuestCanvas.as), plain HTML/CSS in #stage: left column = NPC portrait,
// name, NPC speech and Nhận / Xong / Bỏ; right = "Mô tả nvụ" description (type prefix, name, info, requirements,
// start/finish NPC with map) and the Tiền / Exp / Quà rewards. Drag by the title bar, Esc or × closes.

import {
  MoneyType, QuestAwardKind, QuestAwardMode, QuestState, QuestType, requireLabel,
  type QuestAward, type QuestView, type RequireProgress,
} from '@mc/shared';
import { iconUrl } from '../assets';
import { stageEl } from './stage';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { TYPE_PREFIX } from './questTracker';
import './questPanel.css';

// GamePredef.MSG_ITEM_COLOR (quest/item name by color index) and MSG_EVENTTEXT_COLOR[0]/[5] (NPC / map links).
const ITEM_COLOR = ['#FFFFFF', '#00FF00', '#0066FF', '#FF33FF', '#FA5B05', '#FF0000', '#33CCAA', '#33CCAA', '#000000'];
const NPC_COLOR = '#FFCC00';
const MAP_COLOR = '#33FF66';
const PREFIX_COLOR = '#1E90FF';
const GIFT_SLOTS = 6;

export interface QuestPanelOpts {
  progress: { lines: RequireProgress[]; finishable: boolean }; // per-requirement counts; finishable = can be turned in now
  npcId: number | null; // NPC the panel was opened at; null = from the tracker
  npcName: string;
  iconCode: string;
  classId: number; // CLASS award mode shows only the player's class items (QuestCanvas)
  onTake: () => void;
  onFinish: (selectId: number) => void; // selectId = picked award row id, -1 = none
  onCancel: () => void;
}

export class QuestPanel {
  private root: HTMLElement | null = null;
  private qid: number | null = null;
  private shown: { view: QuestView; opts: QuestPanelOpts } | null = null;
  private offs: (() => void)[] = [];
  private selectId = -1;

  get questId(): number | null {
    return this.qid;
  }

  /** The quest currently shown (so the controller can re-render it when counters change). */
  current(): { view: QuestView; opts: QuestPanelOpts } | null {
    return this.shown;
  }

  show(view: QuestView, opts: QuestPanelOpts): void {
    this.close();
    this.selectId = -1;
    const root = el('div', 'qp');
    const header = el('div', 'qp-header');
    header.appendChild(el('div', 'qp-title', 'NPC nhiệm vụ'));
    const x = el('button', 'qp-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    root.append(header, x);

    const body = el('div', 'qp-body');
    body.appendChild(this.leftColumn(view, opts));
    body.append(el('div', 'qp-label qp-desc-label', 'Mô tả nvụ'), description(view, opts.progress.lines));
    const money = view.data.moneyNum;
    const gold = view.data.moneyType === MoneyType.GOLD || view.data.moneyType === MoneyType.GOLD_BIND;
    body.append(el('div', 'qp-label', 'Tiền'), reward(gold ? 'qp-coin gold' : 'qp-coin', money > 0 ? money : 0));
    body.append(el('div', 'qp-label', 'Exp'), reward('qp-exp', view.data.awardExp > 0 ? view.data.awardExp : 0));
    body.append(el('div', 'qp-label', 'Quà'), this.gifts(view, opts.classId));
    root.appendChild(body);

    stageEl().appendChild(root);
    this.root = root;
    this.qid = view.qid;
    this.shown = { view, opts };
    this.offs.push(makeDraggable(root, header), closeOnEscape(() => this.close()));
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.qid = null;
    this.shown = null;
  }

  /** Six Quà slots filled in award row order; CHOOSE_ONE slots are clickable and the picked one is highlighted. */
  private gifts(view: QuestView, classId: number): HTMLElement {
    const box = el('div', 'qp-gifts');
    const shown = view.award.filter((a) => visibleAward(a, view.data.at, classId)).slice(0, GIFT_SLOTS);
    const choose = view.data.at === QuestAwardMode.CHOOSE_ONE;
    const slots: HTMLElement[] = [];
    for (const a of shown) {
      const slot = awardSlot(a);
      if (choose) {
        slot.classList.add('qp-pick');
        slot.onclick = () => {
          this.selectId = a.id;
          for (const s of slots) s.classList.toggle('selected', s === slot);
        };
      }
      slots.push(slot);
      box.appendChild(slot);
    }
    for (let i = shown.length; i < GIFT_SLOTS; i++) box.appendChild(el('div', 'qp-slot'));
    return box;
  }

  private leftColumn(view: QuestView, opts: QuestPanelOpts): HTMLElement {
    const left = el('div', 'qp-left');
    const head = el('div', 'qp-npc');
    const portrait = el('div', 'qp-portrait');
    if (opts.npcId !== null && opts.iconCode && opts.iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(opts.iconCode);
      img.alt = '';
      img.onerror = () => img.remove();
      portrait.appendChild(img);
    }
    const name = el('div', 'qp-npc-name', opts.npcId !== null ? opts.npcName : 'Hệ thống');
    name.title = name.textContent ?? '';
    head.append(portrait, name);
    // NPC speech: the accept text until the quest can be turned in, then the completion text.
    const finishable = opts.progress.finishable;
    const speech = finishable ? view.data.completeText || view.data.startText : view.data.startText;
    left.append(head, el('div', 'qp-speech', speech || '…'));

    const actions = el('div', 'qp-actions');
    if (view.state === QuestState.CAN_TAKE) {
      actions.appendChild(button('Nhận', opts.onTake));
    } else if (view.state === QuestState.TAKEN || view.state === QuestState.CAN_FINISH) {
      if (view.data.finishNpc <= 0 || opts.npcId === view.data.finishNpc) {
        const done = button('Xong', () => opts.onFinish(this.selectId));
        done.disabled = !finishable;
        actions.appendChild(done);
      }
      const give = button('Bỏ', opts.onCancel);
      give.disabled = view.data.type === QuestType.NEWHAND;
      actions.appendChild(give);
    }
    left.appendChild(actions);
    return left;
  }
}

/** QuestCanvas info box: "[Phụ][Name]", info, "Yêu cầu nhiệm vụ:" lines, then the start / finish NPC with their maps. */
function description(view: QuestView, progress: readonly RequireProgress[]): HTMLElement {
  const box = el('div', 'qp-desc');
  const title = el('div', 'qp-qname');
  const prefix = TYPE_PREFIX[view.data.type];
  if (prefix) title.appendChild(colored(prefix, PREFIX_COLOR));
  title.appendChild(colored(`[${view.data.name}]`, ITEM_COLOR[view.data.color] ?? ITEM_COLOR[0]));
  box.appendChild(title);
  if (view.data.info) box.appendChild(el('div', 'qp-line', view.data.info));
  box.appendChild(el('div', 'qp-line', 'Yêu cầu nhiệm vụ:'));
  for (const p of progress) {
    const line = el('div', 'qp-line qp-indent');
    line.append(colored(requireLabel(p), p.done ? '#7fd17f' : ITEM_COLOR[0]));
    box.appendChild(line);
  }
  if (view.sName) box.appendChild(npcLine('NPC nhận nhiệm vụ: ', view.sName, view.sMap));
  if (view.fName) box.appendChild(npcLine('NPC trả nhiệm vụ: ', view.fName, view.pos?.name ?? ''));
  return box;
}

/** QuestCanvas: in CLASS mode an item award shows only when its template req_class has the player's class. */
function visibleAward(a: QuestAward, mode: number, classId: number): boolean {
  if (mode !== QuestAwardMode.CLASS || a.kind !== QuestAwardKind.ITEM) return true;
  return !a.reqClass || a.reqClass === 'all' || a.reqClass.includes(`|${classId}|`);
}

function awardSlot(a: QuestAward): HTMLElement {
  const slot = el('div', 'qp-slot qp-award');
  slot.title = a.num > 1 ? `${a.name} x${a.num}` : a.name;
  slot.style.borderColor = ITEM_COLOR[a.color] ?? '';
  if (a.iconCode && a.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(a.iconCode);
    img.alt = a.name;
    img.onerror = () => img.remove();
    slot.appendChild(img);
  } else {
    slot.appendChild(el('span', 'qp-award-name', a.name));
  }
  if (a.num > 1) slot.appendChild(el('span', 'qp-award-num', String(a.num)));
  return slot;
}

function npcLine(label: string, npc: string, map: string): HTMLElement {
  const line = el('div', 'qp-line');
  line.append(label, colored(`[${npc}]`, NPC_COLOR));
  if (map) line.appendChild(colored(`[${map}]`, MAP_COLOR));
  return line;
}

function reward(iconCls: string, value: number): HTMLElement {
  const row = el('div', 'qp-reward');
  row.append(el('span', iconCls), el('span', 'qp-value', value.toLocaleString('vi-VN')));
  return row;
}

function colored(text: string, color: string): HTMLSpanElement {
  const s = el('span', '', text) as HTMLSpanElement;
  s.style.color = color;
  return s;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'qp-btn';
  b.textContent = label;
  b.onclick = onClick;
  return b;
}
