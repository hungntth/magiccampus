// Help window "Trợ giúp" (legacy HelpPanel 600x400, M9 phase G; H key / minimap Help button): tabs T.tin (topic tree + text from
// /help/help.json, converted from profile/help.xml by server/tools/help-xml.ts), Dò tìm (label search) and Ph.tắt (shortcut grid,
// HELPPANEL_S texts). The Tự cứu button runs the unstuck flow. The GM tab and the forum link are not ported.

import type { GameClient } from '../net/client';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { toast } from './screens';
import { askUnstuck } from './unstuck';
import './helpPanel.css';

interface HelpNode {
  id: string;
  label: string;
  depth: number;
  html: string;
}

type Tab = 'tree' | 'search' | 'keys';
const TABS: readonly (readonly [Tab, string])[] = [['tree', 'T.tin'], ['search', 'Dò tìm'], ['keys', 'Ph.tắt']];

const KEYS: readonly (readonly [string, string])[] = [
  ['C', 'Mở/Đóng giao diện nhân vật'], ['W', 'Mở/Đóng giao diện pet'], ['B', 'Mở/Đóng giao diện túi đồ'],
  ['S', 'Mở/Đóng giao diện kỹ năng'], ['Q', 'Mở/Đóng giao diện nhiệm vụ'], ['K', 'Mở/Đóng giao diện xã hội'],
  ['E', 'Mở/Đóng giao diện bang hội'], ['R', 'Mở/Đóng giao diện thành tựu'], ['A', 'Chọn mục tiêu giao đấu'],
  ['T', 'Chọn mục tiêu lập nhóm'], ['M', 'Mở/Đóng giao diện bản đồ'], ['ESC', 'Đóng giao diện hiện tại'],
  ['P', 'Mở/Đóng giao diện hệ thống'], ['H', 'Mở/Đóng giao diện trợ giúp'], ['1-0', 'Thanh kỹ năng (phím tắt)'],
  ['CTRL+↑', 'Lên dòng chat trên'], ['CTRL+↓', 'Xuống dòng chat dưới'],
];

let cache: Promise<HelpNode[]> | null = null;

function loadHelp(): Promise<HelpNode[]> {
  cache ??= fetch('/help/help.json').then((r) => (r.ok ? (r.json() as Promise<HelpNode[]>) : []), () => []);
  return cache;
}

export class HelpPanel {
  private win: ActWindow | null = null;
  private tab: Tab = 'tree';
  private nodes: HelpNode[] = [];
  private selected = 0;
  private query = '';

  constructor(private readonly client: GameClient) {}

  toggle(): void {
    if (this.win) this.close();
    else void this.open();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  private async open(): Promise<void> {
    this.win = openActWindow('Trợ giúp', 'help-win', () => this.close());
    this.nodes = await loadHelp();
    if (this.nodes.length === 0) toast('Không tải được nội dung trợ giúp', true);
    this.render();
  }

  private render(): void {
    if (!this.win) return;
    const tabs = el('help-tabs');
    for (const [key, label] of TABS) {
      const b = el(`help-tab${key === this.tab ? ' on' : ''}`, label, 'button');
      b.onclick = () => {
        this.tab = key;
        this.render();
      };
      tabs.appendChild(b);
    }
    tabs.appendChild(button('Tự cứu', () => askUnstuck(this.client), 'act-btn help-unstuck'));
    const body = el('help-body');
    if (this.tab === 'keys') body.appendChild(this.keys());
    else body.append(this.list(), this.text());
    this.win.body.replaceChildren(tabs, body);
  }

  private list(): HTMLElement {
    const box = el('help-list');
    if (this.tab === 'search') {
      const bar = el('help-search');
      const input = document.createElement('input');
      input.value = this.query;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') this.search(input.value);
      };
      bar.append(input, button('Tìm', () => this.search(input.value)));
      box.appendChild(bar);
    }
    const q = this.query.trim().toLowerCase();
    this.nodes.forEach((n, i) => {
      if (this.tab === 'search' && (!q || !n.label.toLowerCase().includes(q))) return;
      const row = el(`help-node${i === this.selected ? ' on' : ''}`, n.label);
      row.style.paddingLeft = `${4 + (this.tab === 'tree' ? n.depth * 14 : 0)}px`;
      row.onclick = () => {
        this.selected = i;
        this.render();
      };
      box.appendChild(row);
    });
    return box;
  }

  private search(q: string): void {
    this.query = q;
    this.render();
  }

  /** The converter only emits <b> <i> <u> <br> and colour spans, with the text escaped. */
  private text(): HTMLElement {
    const box = el('help-text');
    const node = this.nodes[this.selected];
    box.innerHTML = node?.html || (node ? `<b>${node.label.replace(/[<>&]/g, '')}</b>` : '');
    return box;
  }

  private keys(): HTMLElement {
    const grid = el('help-keys');
    for (const [key, text] of KEYS) grid.append(el('help-key', key), el('help-key-text', text));
    return grid;
  }
}
