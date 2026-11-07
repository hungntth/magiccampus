// "Chi tiết" window (legacy DetailPropPanel, M9 phase F): the 26 secondary rates, labels and order as the Flash panel.
// Values come from getCharDetailData (character) or the H5 helper getPetDetailData (active pet); finalPraDef / finalPraMagDef are
// then replaced by getFinalPraDef / finalPraMagDef (pets: the *Pet variants), whose {key, value} reply rewrites that row.

import type { CharDetailData, FinalRateReply } from '@mc/shared';
import type { GameClient } from '../net/client';
import { el, openActWindow, type ActWindow } from './actWindow';
import { toast } from './screens';
import './detailPropPanel.css';

// [key, label]: left column then right column, in the Flash layout order (labels verbatim, double space included).
const ROWS: readonly (readonly [string, string])[] = [
  ['finalCombo', 'Liên Kích'], ['finalCounter', 'Phản Kích'], ['finalRebornRate', 'Miễn Tử'], ['finalBreakReborn', 'Phá Kích'],
  ['finalDefy', 'XPN'], ['finalResiDefy', 'Kháng XPN'], ['finalResiCritical', 'Kháng Bạo Kích'],
  ['finalCriticalDamage', 'Tỉ Lệ Bạo Kích'], ['finalReduceHurt1', 'Miễn Giảm VL'], ['finalReduceHurt2', 'Miễn Giảm  MP'],
  ['finalEnhPhyHurt', 'Tăng STVL Cuối'], ['finalEnhMagicHurt', 'Tăng STMP Cuối'], ['finalPraDef', 'Giảm STVL Cuối'],
  ['finalPraMagDef', 'Giảm STMP Cuối'],
  ['finalDizzy', 'Choáng chính xác'], ['finalConfusion', 'Hỗn Loạn chính xác'], ['finalLight', 'Thạch Hóa chính xác'],
  ['finalSleep', 'Hôn Mê chính xác'], ['finalPoison', 'Trúng Độc chính xác'], ['finalRage', 'Trào Phúng chính xác'],
  ['finalResiDizzy', 'Kháng Choáng'], ['finalResiConfusion', 'Kháng Hỗn Loạn'], ['finalResiLight', 'Kháng Thạch Hóa '],
  ['finalResiSleep', 'Kháng Hôn Mê'], ['finalResiPoison', 'Kháng Trúng Độc'], ['finalResiRage', 'Kháng Trào Phúng'],
];
const LEFT_ROWS = 14;
// PROP_PER_KEY_ARR: shown as "x.xx%"; the rest (PROP_INT_KEY_ARR) as "x.xx".
const PERCENT_KEYS: ReadonlySet<string> = new Set([
  'finalReduceHurt1', 'finalReduceHurt2', 'finalEnhPhyHurt', 'finalEnhMagicHurt', 'finalPraDef', 'finalPraMagDef', 'finalCriticalDamage',
]);

export type DetailOwner = 'char' | 'pet';

export class DetailPropPanel {
  private win: ActWindow | null = null;
  private attached: HTMLElement | null = null;
  private attachedAnchor: HTMLElement | null = null;
  private attachedClose: (() => void) | null = null;
  private owner: DetailOwner = 'char';
  private readonly values = new Map<string, HTMLElement>();

  constructor(private readonly client: GameClient) {}

  toggle(owner: DetailOwner): void {
    this.closeAttached();
    if (this.win && this.owner === owner) return this.close();
    this.open(owner);
  }

  /** Attaches the character detail panel to its source so both panels move as one unit. */
  toggleAttached(anchor: HTMLElement, onClose: () => void): boolean {
    if (this.attached) {
      this.closeAttached();
      return false;
    }
    this.win?.dispose();
    this.win = null;
    this.owner = 'char';
    this.values.clear();
    const root = el('char-detail-panel');
    const head = el('char-detail-head');
    head.appendChild(el('char-detail-title', 'Chi tiết'));
    const x = el('char-detail-close', '×', 'button');
    x.title = 'Đóng';
    x.onclick = () => this.closeAttached();
    const body = el('char-detail-body');
    root.append(head, x, body);
    anchor.appendChild(root);
    this.attached = root;
    this.attachedAnchor = anchor;
    this.attachedClose = onClose;
    this.renderRows(body);
    void this.load();
    return true;
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
    this.closeAttached();
  }

  private open(owner: DetailOwner): void {
    this.owner = owner;
    this.win ??= openActWindow('Chi tiết', 'detail-win', () => this.close());
    this.values.clear();
    this.renderRows(this.win.body);
    void this.load();
  }

  private closeAttached(): void {
    if (!this.attached) return;
    this.attached.remove();
    this.attached = null;
    this.attachedAnchor?.classList.remove('detail-open');
    this.attachedAnchor = null;
    const onClose = this.attachedClose;
    this.attachedClose = null;
    onClose?.();
  }

  private renderRows(body: HTMLElement): void {
    const cols = [el('detail-col'), el('detail-col')];
    ROWS.forEach(([key, label], i) => {
      const row = el('detail-row');
      const v = el('detail-value', '0.00');
      row.append(el('detail-label', label), v);
      this.values.set(key, v);
      cols[i < LEFT_ROWS ? 0 : 1].appendChild(row);
    });
    const grid = el('detail-grid');
    grid.append(...cols);
    body.replaceChildren(grid);
  }

  private async load(): Promise<void> {
    const pet = this.owner === 'pet';
    try {
      const data = await this.client.call<CharDetailData>(pet ? 'getPetDetailData' : 'getCharDetailData');
      for (const [key] of ROWS) this.show(key, Number(data[key] ?? 0));
      const ask = (rpc: string, key: string): void => {
        this.client.call<FinalRateReply | number>(rpc, key, Number(data[key] ?? 0), 0)
          .then((r) => (typeof r === 'number' ? this.show(key, r) : this.show(r.key, r.value)))
          .catch(() => undefined);
      };
      ask(pet ? 'getFinalPraDefPet' : 'getFinalPraDef', 'finalPraDef');
      ask(pet ? 'finalPraMagDefPet' : 'finalPraMagDef', 'finalPraMagDef');
    } catch (e) {
      toast((e as Error).message, true);
      this.close();
    }
  }

  private show(key: string, value: number): void {
    const v = this.values.get(key);
    if (v) v.textContent = `${(Number.isFinite(value) ? value : 0).toFixed(2)}${PERCENT_KEYS.has(key) ? '%' : ''}`;
  }
}
