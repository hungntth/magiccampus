// Click menu for another player (legacy TargetCanvas, rebuilt as a DOM list): Thông tin, Chat mật, Chat riêng, Mời lập nhóm,
// Xin vào nhóm (only when the target has a party and you do not); Kết bạn adds a friend by name; Giao dịch opens a trade.
// PopupMenu is the generic list (also used by the HUD team tiles). Closes on any outside press, Escape or a pick.
// Positioned in stage pixels (the stage is scaled).

import { notReady } from './hud/skin';
import { stageEl, stageScale } from './stage';
import './social.css';

export interface MenuTarget {
  id: number;
  name: string;
}

/** One row; a null `run` renders greyed and toasts "not ready". */
export type MenuItem = [label: string, run: (() => void) | null];

export class PopupMenu {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens the menu next to the pointer (client coordinates). */
  show(title: string, items: MenuItem[], clientX: number, clientY: number, id = ''): void {
    this.close();
    const root = document.createElement('div');
    root.className = 'player-menu';
    root.dataset.target = id;
    const head = document.createElement('div');
    head.className = 'player-menu-title';
    head.textContent = title;
    root.appendChild(head);
    for (const [label, run] of items) {
      const item = document.createElement('div');
      item.className = `player-menu-item${run ? '' : ' disabled'}`;
      item.textContent = label;
      item.onclick = () => {
        this.close();
        if (run) run();
        else notReady();
      };
      root.appendChild(item);
    }
    const stage = stageEl();
    stage.appendChild(root);
    const rect = stage.getBoundingClientRect();
    const scale = stageScale();
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    const x = Math.max(0, Math.min(rect.width / scale - w, (clientX - rect.left) / scale + 6));
    const y = Math.max(0, Math.min(rect.height / scale - h, (clientY - rect.top) / scale + 6));
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    this.root = root;
    const onDown = (e: PointerEvent): void => {
      if (!(e.target instanceof Node) || !root.contains(e.target)) this.close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') this.close();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    this.offs = [
      () => window.removeEventListener('pointerdown', onDown, true),
      () => window.removeEventListener('keydown', onKey),
    ];
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }
}

export interface PlayerMenuActions {
  info(t: MenuTarget): void;
  whisper(t: MenuTarget): void;
  privateChat(t: MenuTarget): void;
  invite(t: MenuTarget): void;
  /** Offered only when the target is in a party and you are not. */
  canRequestJoin(t: MenuTarget): boolean;
  requestJoin(t: MenuTarget): void;
  addFriend(t: MenuTarget): void;
  trade(t: MenuTarget): void;
}

export class PlayerMenu {
  private readonly popup = new PopupMenu();

  constructor(private readonly actions: PlayerMenuActions) {}

  get isOpen(): boolean {
    return this.popup.isOpen;
  }

  show(target: MenuTarget, clientX: number, clientY: number): void {
    const a = this.actions;
    const items: MenuItem[] = [
      ['Thông tin', () => a.info(target)],
      ['Chat mật', () => a.whisper(target)],
      ['Chat riêng', () => a.privateChat(target)],
      ['Mời lập nhóm', () => a.invite(target)],
    ];
    if (a.canRequestJoin(target)) items.push(['Xin vào nhóm', () => a.requestJoin(target)]);
    items.push(['Kết bạn', () => a.addFriend(target)], ['Giao dịch', () => a.trade(target)]);
    this.popup.show(target.name, items, clientX, clientY, String(target.id));
  }

  close(): void {
    this.popup.close();
  }
}
