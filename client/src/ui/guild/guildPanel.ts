// Guild window (legacy GuildPanel): a draggable frame with tabs Bang hội / Thành viên / Danh sách / Quyền hạn / Đơn xin (approvers
// only) / Quyên góp / Kho bang / Kỹ năng. Pure view over GuildState; the controller calls render() after every state change and
// the tab renderers read the model. Opening a tab calls onTab (the controller loads lists, the bank and the skills lazily).

import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { renderBankTab } from './guildBankTab';
import { renderDonateTab } from './guildDonateTab';
import { renderInfoTab } from './guildInfoTab';
import { renderListTab } from './guildListTab';
import { renderApplyTab, renderMembersTab } from './guildMembersTab';
import { renderRanksTab } from './guildRanksTab';
import { renderSkillsTab } from './guildSkillsTab';
import { el, type GuildCtx } from './guildState';
import './guild.css';
import './guildEstate.css';

type TabId = 'info' | 'members' | 'list' | 'ranks' | 'apply' | 'donate' | 'bank' | 'skills';
const TABS: { id: TabId; label: string }[] = [
  { id: 'info', label: 'Bang hội' }, { id: 'members', label: 'Thành viên' }, { id: 'list', label: 'Danh sách' },
  { id: 'ranks', label: 'Quyền hạn' }, { id: 'apply', label: 'Đơn xin' }, { id: 'donate', label: 'Quyên góp' },
  { id: 'bank', label: 'Kho bang' }, { id: 'skills', label: 'Kỹ năng' },
];

export class GuildPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: TabId = 'info';

  constructor(private readonly ctx: () => GuildCtx, private readonly onOpen: () => void, private readonly onTab: (t: string) => void) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(tab?: TabId): void {
    if (tab) {
      this.tab = tab;
      this.onTab(tab);
    }
    if (!this.root) {
      const root = el('div', 'guild-panel');
      const header = el('div', 'guild-header');
      header.appendChild(el('div', 'guild-title', 'Bang hội'));
      const x = el('button', 'guild-close', '×');
      x.title = 'Đóng';
      x.onclick = () => this.close();
      header.appendChild(x);
      root.append(header, el('div', 'guild-tabs'), el('div', 'guild-body'));
      stageEl().appendChild(root);
      this.root = root;
      this.offs = [makeDraggable(root, header, 'guildPanel'), closeOnEscape(() => this.close())];
      this.onOpen();
    }
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  render(): void {
    const root = this.root;
    if (!root) return;
    const ctx = this.ctx();
    const visible = TABS.filter((t) => t.id !== 'apply' || ctx.state.can('canAdd'));
    if (!visible.some((t) => t.id === this.tab)) this.tab = 'info';
    const tabs = root.querySelector('.guild-tabs') as HTMLElement;
    tabs.replaceChildren(...visible.map((t) => {
      const b = el('button', `guild-tab-btn${t.id === this.tab ? ' active' : ''}`, t.label);
      b.dataset.tab = t.id;
      b.onclick = () => {
        this.tab = t.id;
        this.onTab(t.id);
        this.render();
      };
      return b;
    }));
    const body = root.querySelector('.guild-body') as HTMLElement;
    body.replaceChildren(this.content(ctx));
  }

  private content(ctx: GuildCtx): HTMLElement {
    const rerender = (): void => this.render();
    const c = { ...ctx, rerender };
    switch (this.tab) {
      case 'members': return renderMembersTab(c);
      case 'list': return renderListTab(c);
      case 'ranks': return renderRanksTab(c);
      case 'apply': return renderApplyTab(c);
      case 'donate': return renderDonateTab(c);
      case 'bank': return renderBankTab(c);
      case 'skills': return renderSkillsTab(c);
      default: return renderInfoTab(c);
    }
  }
}
