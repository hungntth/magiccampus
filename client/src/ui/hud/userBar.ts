// Skill/item shortcut bar, bottom-right (legacy UserBarCanvas right0/bottom44, 460x52): 3 pages of 10 slots (keys 1..9,0),
// page switcher, show/hide toggle (uif au), lock (us ubl) and the Auto battle box (toggles autoState). Slots render the hotbar
// (game/hotbarController) and accept drops from the skill window, the bag and other slots; dragging a slot off the bar clears it.

import { HOTBAR_PAGE, HOTBAR_TEXT, HotbarKind, ItemKind } from '@mc/shared';
import { iconUrl } from '../../assets';
import { autoState } from '../../game/battle/autoState';
import type { HotbarController } from '../../game/hotbarController';
import { dragging, endDrag } from '../itemCell';
import { HOTBAR_DRAG_MIME } from '../skillRow';
import { div, place, setStates, skinButton, std } from './skin';

const SC = 'MainStage_ShortcutCanvas';
// btnLock skins (swfui names): "1".."3" = up/over/down, "1320" / "21038" / "31742" = the selected (locked) up/over/down.
const LOCK_OPEN = { up: `${SC}/1`, over: `${SC}/2`, down: `${SC}/3` };
const LOCK_CLOSED = { up: `${SC}/1320`, over: `${SC}/21038`, down: `${SC}/31742` };
const SLOT_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

interface SlotDrag { st: number; sid: number; from?: number }

export class UserBar {
  private readonly pageLabel: HTMLDivElement;
  private readonly cells: HTMLDivElement[] = [];
  private readonly container: HTMLDivElement;
  private readonly toggle: HTMLElement;
  private readonly lock: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly bar: HotbarController) {
    const root = div('hud-userbar', parent);
    this.container = place(div('hud-skillbar', root), 23, 5, 373, 44) as HTMLDivElement;
    const slots = place(div('hud-slots', this.container), 5, 3, 350, 37);
    SLOT_LABELS.forEach((n, i) => {
      const slot = place(div('hud-slot', slots), i * 35, 0, 34, 37) as HTMLDivElement;
      place(div('hud-slot-num', slot, n), 3, 23);
      this.wire(slot, i);
      this.cells.push(slot);
    });

    const nums = place(div('hud-pagebox', this.container), 352, 0, 22, 48);
    skinButton(std(`${SC}/LastRow`), nums, 4, 3, 'Trang trước', () => bar.turn(-1));
    this.pageLabel = place(div('hud-page-num', nums, '1'), 0, 14, 22) as HTMLDivElement;
    skinButton(std(`${SC}/NextRow`), nums, 4, 29, 'Trang sau', () => bar.turn(1));

    this.toggle = skinButton(std(`${SC}/HideShortcuts`), root, 396, 7, HOTBAR_TEXT.TOGGLE.replace(/\r/g, '\n'), () => bar.setVisible(!bar.visible));
    // Flash AutoBattleCanva (right0 → x374, y1) btnLock x22/y26 20x20: a toggle, selected skins = locked.
    this.lock = skinButton(LOCK_OPEN, root, 396, 27, HOTBAR_TEXT.LOCK, () => bar.setLocked(!bar.locked));
    place(this.lock, 396, 27, 20, 20);
    this.lock.classList.add('hud-lock');

    const auto = skinButton({ up: `${SC}/AutoBattleUp`, over: `${SC}/AutoBattleOver`, down: `${SC}/AutoBattleDown` },
      root, 418, 6, 'Nút tự động chiến đấu', () => autoState.set(!autoState.on));
    auto.classList.add('hud-auto');
    const label = (on: boolean): void => void (auto.textContent = on ? 'Auto\nbật' : 'Auto\ntắt');
    label(autoState.on);
    autoState.onChange(label);
    bar.onChange(() => this.render());
    this.render();
  }

  private slotNo(i: number): number {
    return (this.bar.page - 1) * HOTBAR_PAGE + i + 1;
  }

  private wire(cell: HTMLDivElement, i: number): void {
    cell.onclick = () => this.bar.click(this.slotNo(i), false);
    cell.ondblclick = () => this.bar.click(this.slotNo(i), true);
    cell.draggable = true;
    cell.ondragstart = (e) => {
      const s = this.bar.slots()[this.slotNo(i) - 1];
      if (!s || s.st === HotbarKind.NONE) return void e.preventDefault();
      e.dataTransfer?.setData(HOTBAR_DRAG_MIME, JSON.stringify({ ...s, from: this.slotNo(i) }));
    };
    cell.ondragend = (e) => {
      if (e.dataTransfer?.dropEffect === 'none') void this.bar.clear(this.slotNo(i)); // dragged off the bar
    };
    cell.ondragover = (e) => e.preventDefault();
    cell.ondrop = (e) => {
      e.preventDefault();
      const n = this.slotNo(i);
      const raw = e.dataTransfer?.getData(HOTBAR_DRAG_MIME);
      if (raw) {
        const d = JSON.parse(raw) as SlotDrag;
        if (d.st === HotbarKind.SKILL) void this.bar.putSkill(n, d.sid, d.from ?? 0);
        else if (d.st === HotbarKind.ITEM) void this.bar.putItem(n, d.sid, d.from ?? 0);
        return;
      }
      const bag = dragging();
      endDrag();
      const item = bag?.from === 'bag' ? this.bar.firstItemById(bag.id) : undefined;
      if (item && item.itemType === ItemKind.ITEM) void this.bar.putItem(n, item.tid);
    };
  }

  private render(): void {
    this.pageLabel.textContent = String(this.bar.page);
    this.container.hidden = !this.bar.visible;
    setStates(this.toggle, std(`${SC}/${this.bar.visible ? 'HideShortcuts' : 'ShowShortcuts'}`));
    setStates(this.lock, this.bar.locked ? LOCK_CLOSED : LOCK_OPEN);
    const slots = this.bar.slots();
    this.cells.forEach((cell, i) => {
      cell.querySelector('.hud-slot-icon')?.remove();
      cell.querySelector('.hud-slot-count')?.remove();
      cell.style.opacity = '';
      const s = slots[this.slotNo(i) - 1];
      cell.title = HOTBAR_TEXT.EMPTY.replace(/\r/g, '\n');
      if (!s || s.st === HotbarKind.NONE) return;
      let icon = '';
      if (s.st === HotbarKind.SKILL) {
        const sk = this.bar.skill(s.sid);
        icon = sk?.iconCode ?? '';
        cell.title = sk?.name ?? this.bar.petSkillName(s.sid) ?? `Kỹ năng #${s.sid}`;
      } else {
        const item = this.bar.firstItem(s.sid);
        const n = this.bar.count(s.sid);
        icon = item?.iconCode ?? '';
        cell.title = item?.name ?? `Vật phẩm #${s.sid}`;
        if (n === 0) cell.style.opacity = '0.5';
        div('hud-slot-count', cell, String(n));
      }
      if (icon) {
        const img = document.createElement('img');
        img.className = 'hud-slot-icon';
        img.src = iconUrl(icon);
        img.draggable = false;
        cell.prepend(img);
      }
    });
  }
}
