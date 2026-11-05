// "Kỹ năng" window (legacy SkillManager, M9 phase B): tabs Chủ động / Bị động / Luyện (tab = use_env), the expSkill and silver
// line, one row per skill with Học / Nâng / Đầy cấp gated like SkillUseSlot.enableBtnReqSkill. Books learn with useItem, Luyện
// rows with addTrainingSkill, upgrades with skillLearnByClient. Rows refresh on onSkillUpdate / onUPP. Rows are hotbar drag sources.

import {
  canLearn, classRankText, SKILL_TABS, skillPool, type BagItem, type PlayerData, type PlayerUpdate, type SkillLearnView,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { el, openActWindow, type ActWindow } from './actWindow';
import { askConfirm } from './confirmDialog';
import { toast } from './screens';
import { skillRow } from './skillRow';
import './skillPanel.css';

export interface SkillPanelHost {
  client: GameClient;
  player(): PlayerData | null;
  bagItems(): BagItem[];
}

const PAGE = 8;

export class SkillPanel {
  private win: ActWindow | null = null;
  private rows: SkillLearnView[] = [];
  private tab = 0;
  private page = 0;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: SkillPanelHost) {
    this.offs.push(host.client.on('onSkillUpdate', () => void (this.win && this.load())));
    // A book entering or leaving the bag flips the Học gate.
    for (const m of ['onAddCharactorSlot', 'onDelCharactorSlot', 'onUpChaSlotStackNum']) {
      this.offs.push(host.client.on(m, () => void (this.win && setTimeout(() => this.render(), 0))));
    }
    this.offs.push(host.client.on('onUPP', (d) => {
      const u = d as PlayerUpdate;
      const p = host.player();
      if (typeof u.cl === 'number' && p) {
        p.cl = u.cl;
        toast(classRankText(u.cl, p.classId), false, 5000);
      }
      if (this.win) setTimeout(() => this.render(), 0); // after the player object was merged
    }));
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
  }

  get isOpen(): boolean {
    return this.win !== null;
  }

  toggle(): void {
    if (this.win) this.close();
    else this.open();
  }

  open(): void {
    this.win ??= openActWindow('Kỹ năng', 'skill-win', () => this.close());
    void this.load();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  private async load(): Promise<void> {
    try {
      this.rows = await this.host.client.call<SkillLearnView[]>('getSkillLearnList');
    } catch (e) {
      toast((e as Error).message, true);
    }
    this.render();
  }

  private render(): void {
    const win = this.win;
    const p = this.host.player();
    if (!win || !p) return;
    const pool = skillPool(p.exp, p.level);
    const tabs = el('skill-tabs');
    SKILL_TABS.forEach((t, i) => {
      const b = el(`skill-tab${i === this.tab ? ' on' : ''}`, t.label, 'button');
      b.onclick = () => {
        this.tab = i;
        this.page = 0;
        this.render();
      };
      tabs.appendChild(b);
    });
    const wallet = el('skill-wallet', `Kinh nghiệm kỹ năng: ${pool.toLocaleString('vi-VN')}   Bạc: ${p.money.toLocaleString('vi-VN')}   Bạc khóa: ${(p.moneyBind ?? 0).toLocaleString('vi-VN')}`);
    const env = SKILL_TABS[this.tab].env;
    const list = this.rows.filter((r) => r.useEnv === env);
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    const body = el('skill-list');
    const bag = this.host.bagItems();
    const facts = { level: p.level, cl: p.cl ?? 0, pool, money: p.money, moneyBind: p.moneyBind ?? 0 };
    for (const r of list.slice(this.page * PAGE, (this.page + 1) * PAGE)) {
      const book = r.bookTid > 0 ? bag.find((b) => b.tid === r.bookTid) : undefined;
      const enabled = canLearn(r, { ...facts, hasBook: book !== undefined });
      body.appendChild(skillRow(r, enabled, () => this.act(r, book)));
    }
    if (list.length === 0) body.appendChild(el('skill-empty', 'Chưa có kỹ năng'));
    const nav = el('skill-nav');
    const prev = el('act-btn', '<', 'button') as HTMLButtonElement;
    const next = el('act-btn', '>', 'button') as HTMLButtonElement;
    prev.disabled = this.page === 0;
    next.disabled = this.page >= pages - 1;
    prev.onclick = () => this.turn(-1);
    next.onclick = () => this.turn(1);
    nav.append(prev, el('skill-page', `${this.page + 1}/${pages}`), next);
    win.body.replaceChildren(tabs, wallet, body, nav);
  }

  private turn(d: number): void {
    this.page += d;
    this.render();
  }

  /** Học (book / Luyện) or Nâng, after the SKILLUSESLOT confirm. */
  private act(r: SkillLearnView, book: BagItem | undefined): void {
    const c = this.host.client;
    const fail = (e: Error): void => toast(e.message, true);
    if (r.learned) {
      askConfirm(`Bạn xác nhận thăng cấp: ${r.name}?`, () => {
        c.call<boolean>('skillLearnByClient', r.nextSid).then((ok) => ok && toast(`Đã thăng cấp ${r.name}`), fail);
      });
      return;
    }
    askConfirm(`Bạn xác nhận học: ${r.name}?`, () => {
      if (book) void c.call('useItem', 1, -1, book.id).then(() => this.load(), fail);
      else c.call('addTrainingSkill', r.sid).catch(fail);
    });
  }
}
