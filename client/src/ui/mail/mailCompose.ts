// "Viết thư" form (legacy MailManagerPanel send tab): receiver, subject, text, gift (Tặng Bạc / Vàng), COD (Thu phí) and one
// attachment picked from the unbound bag-tab items or the resting, unbound, gearless pets. Builds the addMail object; the server
// stays authoritative (every refusal arrives as a note). Pure view: MailController sends and resets on the sent echo.

import {
  MAIL, MAIL_TEXT, MailAttachType, PetState, SlotType, type AddMailArg, type BagItem, type PetView,
} from '@mc/shared';
import { iconUrl } from '../../assets';
import { fillItemCell } from '../itemCell';
import { toast } from '../screens';
import { el } from './mailUtil';

export interface ComposeHost {
  bagItems(): BagItem[];
  pets(): PetView[];
  playerLevel(): number;
  onSend(receiver: string, arg: AddMailArg): void;
}

const BAG_TABS: number[] = [SlotType.BAG, SlotType.QUEST_BAG, SlotType.PET_BAG];
const num = (input: HTMLInputElement): number => Math.max(0, Math.trunc(Number(input.value) || 0));

export const attachableItems = (items: readonly BagItem[]): BagItem[] => items.filter((i) => BAG_TABS.includes(i.slotType) && !i.binded);
export const attachablePets = (pets: readonly PetView[]): PetView[] =>
  pets.filter((p) => p.binded === 0 && p.state === PetState.REST && !p.following && !p.equ1 && !p.equ2 && !p.equ3 && !p.equ4 && !p.equ5 && !p.equ6 && !p.equ7 && !p.equ8);

type Picked = { type: 9 | 39; id: number; label: string } | null;

export class MailCompose {
  readonly root = el('div', 'mail-compose');
  private readonly to = el('input');
  private readonly subject = el('input');
  private readonly text = el('textarea');
  private readonly money = el('input');
  private readonly gold = el('input');
  private readonly codBox = el('input');
  private readonly codMoney = el('input');
  private readonly codGold = el('input');
  private readonly attachBtn = el('button', 'mail-btn', 'Chọn vật phẩm / pet');
  private picked: Picked = null;
  private picker: HTMLElement | null = null;

  constructor(private readonly host: ComposeHost, private readonly overlayParent: () => HTMLElement) {
    this.subject.maxLength = MAIL.SUBJECT_MAX;
    this.text.maxLength = MAIL.TEXT_MAX;
    for (const i of [this.money, this.gold, this.codMoney, this.codGold]) {
      i.type = 'number';
      i.min = '0';
      i.value = '0';
    }
    this.codBox.type = 'checkbox';
    const r = this.root;
    r.append(el('label', '', 'Người nhận'), this.to, el('label', '', 'Tiêu đề'), this.subject, el('label', '', 'Nội dung'), this.text);
    r.append(el('label', '', 'Tặng'), this.pair(this.money, 'Bạc', this.gold, 'Vàng'));
    r.append(el('label', '', 'Kèm'), this.attachBtn);
    const codRow = el('div', 'pair');
    codRow.append(this.codBox, el('span', '', 'Thu phí'));
    r.append(el('label', '', ''), codRow, el('label', '', ''), this.pair(this.codMoney, 'Bạc', this.codGold, 'Vàng'));
    r.append(el('div', 'full note', 'Vui lòng kiểm tra thư hệ thống trong hộp thư hệ thống, cẩn thận tránh bị lừa!'));
    const send = el('button', 'mail-btn full', 'Gửi thư');
    send.onclick = () => this.send();
    r.appendChild(send);
    this.attachBtn.onclick = () => this.openPicker();
  }

  private pair(a: HTMLInputElement, la: string, b: HTMLInputElement, lb: string): HTMLElement {
    const p = el('div', 'pair');
    p.append(a, el('span', '', la), b, el('span', '', lb));
    return p;
  }

  /** Reply: receiver and "Re:" subject prefilled. */
  prefill(receiver: string, subject = ''): void {
    this.to.value = receiver;
    this.subject.value = subject;
  }

  /** After the sent echo: everything cleared except nothing (Flash resets the whole form). */
  reset(): void {
    this.to.value = '';
    this.subject.value = '';
    this.text.value = '';
    for (const i of [this.money, this.gold, this.codMoney, this.codGold]) i.value = '0';
    this.codBox.checked = false;
    this.setPicked(null);
  }

  private setPicked(p: Picked): void {
    this.picked = p;
    this.attachBtn.textContent = p ? p.label : 'Chọn vật phẩm / pet';
    this.closePicker();
  }

  private send(): void {
    const receiver = this.to.value.trim();
    if (!receiver) return toast(MAIL_TEXT.NEED_RECEIVER, true);
    const cod = this.codBox.checked;
    const arg: AddMailArg = {
      subject: this.subject.value, text: this.text.value, codFlag: cod ? 1 : -1, codMoney: cod ? num(this.codMoney) : 0,
      codGold: cod ? num(this.codGold) : 0, money: num(this.money), gold: num(this.gold),
      ...(this.picked ? { type: this.picked.type === 9 ? MailAttachType.ITEM : MailAttachType.PET, id: this.picked.id } : {}),
      readDate: -1,
    };
    this.host.onSend(receiver, arg);
  }

  closePicker(): void {
    this.picker?.remove();
    this.picker = null;
  }

  private openPicker(): void {
    if (this.picker) return this.closePicker();
    const box = el('div', 'mail-picker');
    box.appendChild(el('div', '', 'Chọn vật phẩm (chưa khóa) hoặc pet (đang nghỉ, chưa khóa, không mang trang bị) để đính kèm:'));
    const grid = el('div', 'grid');
    for (const it of attachableItems(this.host.bagItems())) {
      const cell = el('div', 'bag-cell');
      fillItemCell(cell, it, { level: this.host.playerLevel() }, 'bag');
      cell.draggable = false;
      cell.onclick = () => this.setPicked({ type: 9, id: it.id, label: `${it.name}${it.stackNum > 1 ? ` x${it.stackNum}` : ''}` });
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    const pets = el('div', 'pets');
    for (const p of attachablePets(this.host.pets())) {
      const row = el('div', 'pet-row');
      const img = el('img');
      img.src = iconUrl(p.iconCode);
      img.width = 20;
      img.height = 20;
      img.onerror = () => img.remove();
      row.append(img, el('span', '', ` ${p.petName} (cấp ${p.level})`));
      row.onclick = () => this.setPicked({ type: 39, id: p.id, label: `Pet: ${p.petName}` });
      pets.appendChild(row);
    }
    box.appendChild(pets);
    const none = el('button', 'mail-btn', 'Bỏ đính kèm');
    none.onclick = () => this.setPicked(null);
    box.appendChild(none);
    this.overlayParent().appendChild(box);
    this.picker = box;
  }
}
