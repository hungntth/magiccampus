// World boss ranking canvas (Flash WbRankCanvas, WB_RANK_CANVAS 19900): tabs "Xếp hạng nghề" (class, the default) and "Xếp hạng thế giới",
// rows rank / name / damage with its share of the boss HP, the own rank and damage, the gift preview strip (initWbView only) and a
// collapse arrow. Pure DOM; WorldBossController feeds it.

import { WB_TEXT, wbScoreText, type WbAwardItem, type WbClassRank, type WbGlobalRank } from '@mc/shared';
import { iconUrl } from '../../assets';
import { stageEl } from '../stage';
import './worldBoss.css';

const el = (cls: string, text = '', tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Item strip used by the rank canvas and the result window: icon + count, name as tooltip. */
export function awardStrip(items: readonly WbAwardItem[]): HTMLElement {
  const strip = el('wb-awards');
  for (const it of items) {
    const cell = el('wb-award');
    cell.title = it.name ?? `#${it.itemId}`;
    if (it.iconCode && it.iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(it.iconCode);
      img.alt = it.name ?? '';
      cell.appendChild(img);
    } else {
      cell.textContent = it.name ?? `#${it.itemId}`;
    }
    if (it.num > 1) cell.appendChild(el('wb-award-num', String(it.num)));
    strip.appendChild(cell);
  }
  return strip;
}

export class WbRank {
  private root: HTMLElement | null = null;
  private body!: HTMLElement;
  private info!: HTMLElement;
  private tabs: HTMLButtonElement[] = [];
  private awards!: HTMLElement;
  private tab: 0 | 1 = 0;
  private rank1: WbGlobalRank = { globalRank: [] };
  private rank2: WbClassRank = { classRank: [], myRank: -1 };
  private hurt = 0;
  private maxHp = 0;

  get visible(): boolean {
    return this.root !== null;
  }

  /** initWbView: also replaces the gift preview. */
  show(rank1: WbGlobalRank, rank2: WbClassRank, hurt: number, maxHp: number, awards: readonly WbAwardItem[] | null): void {
    this.build();
    this.maxHp = maxHp;
    if (awards) this.awards.replaceChildren(awardStrip(awards));
    this.update(rank1, rank2, hurt);
  }

  /** onUpdateWbRank. */
  update(rank1: WbGlobalRank, rank2: WbClassRank, hurt: number): void {
    this.rank1 = rank1;
    this.rank2 = rank2;
    this.hurt = hurt;
    this.render();
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }

  private build(): void {
    if (this.root) return;
    const root = el('wb-rank');
    const head = el('wb-rank-head');
    this.tabs = [WB_TEXT.RANK_TAB_CLASS, WB_TEXT.RANK_TAB_WORLD].map((label, i) => {
      const b = el('wb-tab', label, 'button') as HTMLButtonElement;
      b.onclick = () => {
        this.tab = i === 0 ? 0 : 1;
        this.render();
      };
      return b;
    });
    const fold = el('wb-fold', '▾', 'button');
    fold.onclick = () => {
      root.classList.toggle('folded');
      fold.textContent = root.classList.contains('folded') ? '▸' : '▾';
    };
    head.append(...this.tabs, fold);
    this.body = el('wb-rank-body');
    this.info = el('wb-rank-info');
    this.awards = el('wb-rank-awards');
    root.append(head, this.body, this.info, this.awards);
    stageEl().appendChild(root);
    this.root = root;
  }

  private render(): void {
    if (!this.root) return;
    this.tabs.forEach((b, i) => b.classList.toggle('on', i === this.tab));
    const rows = this.tab === 0 ? this.rank2.classRank : this.rank1.globalRank;
    const head = el('wb-row-r wb-row-head');
    head.append(el('wb-c-no', WB_TEXT.RANK), el('wb-c-name', WB_TEXT.NAME), el('wb-c-score', WB_TEXT.DAMAGE));
    const list = rows.map((r, i) => {
      const row = el('wb-row-r');
      row.append(el('wb-c-no', String(i + 1)), el('wb-c-name', r.name), el('wb-c-score', wbScoreText(r.score, this.maxHp)));
      return row;
    });
    this.body.replaceChildren(head, ...list);
    const mine = this.rank2.myRank !== -1 ? this.rank2.myRank + 1 : '';
    this.info.replaceChildren(el('wb-my-rank', WB_TEXT.MY_RANK(mine)), el('wb-my-hurt', WB_TEXT.MY_HURT(this.hurt)));
  }
}
