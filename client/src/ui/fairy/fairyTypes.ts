// Shared bits of the Tiểu Tinh Linh window tabs: the host interface game/FairyController.ts implements, the Flash labels that
// FAIRY_TEXT does not carry (Language.FAIRY_MANAGER_PANEL_U / _S) and the roster column every tab draws on its left.

import {
  FAIRY, FAIRY_TEXT, fairyColour, fairyGrowLevel, fairyLevel, type BagItem, type FairyInfo, type FairySkin,
} from '@mc/shared';
import { button, el } from '../feature/dom';
import type { ConfigDraft } from './fairyConfig';

export const FAIRY_TABS = ['Thuộc tính', 'Nuôi dưỡng', 'Cho ăn', 'Kỹ Năng', 'Thiết lập', 'Hoán đổi'] as const;
export const TAB = { INFO: 0, GROW: 1, FEED: 2, SKILL: 3, CONFIG: 4, SKIN: 5 } as const;

/** FAIRY_MANAGER_PANEL_U / _S labels used by the H5 window. */
export const FAIRY_UI = {
  COUNT: 'Số lượng tiểu tinh linh',
  STATE_TIP: 'Nhấp đổi trạng thái tiểu tinh linh (Thủ hộ/ Nghỉ)',
  EXP: 'Kinh Nghiệm',
  TALENT: 'Thiên chất',
  DOH: 'Độ no',
  GROWTH: 'tr.thành',
  GUARD_POWER: 'Lực bảo vệ',
  RELEASE: 'Thả',
  LEVEL: 'Cấp độ',
  GROW_POINTS: 'Điểm trưởng thành',
  GROW_NAMES: ['Nuôi dưỡng bình thường', 'Nuôi dưỡng cường hóa', 'Nuôi dưỡng cao cấp'],
  GROW_TIPS: [
    'Mỗi lần nuôi dưỡng phải tốn 100000 bạc và nhận được 1 lượng điểm trưởng thành nhất định, có cơ hội nhận thêm Tiểu Bạo Kích (10x điểm trưởng thành)',
    'Mỗi lần nuôi dưỡng phải tốn 39 vàng và nhận được 1 lượng điểm trưởng thành nhất định, có cơ hội nhận thêm Tiểu Bạo Kích (10x điểm trưởng thành), Đại Bạo Kích (cấp độ trưởng thành + 1)',
    'Dùng 780 vàng để có 20 lần nuôi dưỡng, có cơ hội nhận Tiểu Bạo Kích (10x điểm trưởng thành), Đại Bạo Kích (cấp độ trưởng thành + 1)',
  ],
  BATCH_CONFIRM: 'Xác nhận chọn Nuôi dưỡng cao cấp？(780 vàng cho 20 lần nuôi dưỡng)',
  CRIT: 'Bạo Kích',
  ATTR_HELP: 'Thuộc tính của Tinh Linh sẽ ảnh hưởng đến thuộc tính của nhân vật.',
  DOH_HELP: 'Độ no của Tinh Linh sẽ ảnh hưởng đến Lực Thủ Hộ. Có thể dùng cách Nuôi dưỡng hoặc nguyên liệu chế tạo để tăng Lực Thủ Hộ.',
  GROW_HELP: 'Tăng cấp độ trưởng thành của Tinh Linh có thể tăng được Thiên Chất cho Tinh Linh.',
  FEED_HELP: 'Tăng Độ no và thăng cấp kinh nghiệm cho Tiểu Tinh Linh.',
  RAISE_HINT: 'Có thể đặt nguyên liệu chế tạo để bổ sung',
  FRUIT_HINT: 'Có thể đặt Quả Tinh Linh vào',
  USE: 'Dùng',
  RAISE_CONFIRM: (name: string): string => `Xác nhận dùng (${name}) để bổ sung Độ no？`,
  LEARN: 'Học',
  LEARN_TITLE: 'Học skill',
  UPGRADE: 'Thăng cấp',
  SKILL_HELP: 'Hướng dẫn:\n1.Tinh linh có thiên chất tốt trở lên(cấp độ trưởng thành từ cấp 10 trở lên) có thể dùng Bí Kíp Tinh Linh để học kỹ năng.\n'
    + '2.Chỉ có thể dùng Bí Kíp Tinh Linh để học kỹ năng 1 lần，không thể thăng cấp，nhưng có thể dùng Sách Huấn Luyện Truyền Nhân để tiến hành thăng cấp。\n'
    + '3.Tỷ lệ học kỹ năng thành công là100%。',
  CONFIG_HELP: 'Hướng dẫn:\n1.Tinh linh học kỹ năng chủ động sẽ giúp chủ nhân trong chiến đấu gia tăng buff kỹ năng tương ứng.\n'
    + '2.Mỗi lượt trước khi ra đòn, dựa vào thứ tự mà sử dụng kỹ năng thi triển (Cùng 1 loại kỹ năng không thể đặt trong 1 danh sách, để trống là không sử dụng kỹ năng chủ động).\n'
    + '3.Kỹ năng đặt ở vị trí 1 sẽ được thi triển ở lượt 1, 6, 11, 16…, vị trí 2 sẽ được thi triển ở lượt 2, 7, 12, 17…, tương tự ở các vị trí sau.',
  ORDER: 'Thứ tự',
  USE_LIST: 'Dùng',
  NONE_ALL: 'Không dùng tất cả',
  SAVE: 'Lưu',
  UNSAVED: 'Đã sửa đổi thiết lập, nhưng chưa Lưu, xác nhận Lưu?',
  EMPTY: 'Chưa có tinh linh',
  EMPTY_HINT: 'Nhận nuôi Tiểu Tinh Linh ở Sứ Giả Tinh Linh Thủ Hộ (Map 10).',
  RELEASE_CONFIRM: (name: string): string => `Xác nhận thả ${name}？`,
  EXP_GOT: (name: string, exp: number): string => `${name} nhận ${exp} kinh nghiệm`,
  LEVEL_UP: (name: string, lv: number): string => `${name} tăng cấp độ đến cấp ${lv} !`,
  LOW_DOH: (name: string): string => `Độ no của tinh linh ${name} quá thấp！`,
  ATTR_TIPS: [
    'Ảnh hưởng đến điểm Nhẫn của Tinh Linh', 'Ảnh hưởng đến điểm Lực của Tinh Linh', 'Ảnh hưởng đến điểm Xảo của Tinh Linh',
    'Ảnh hưởng đến điểm Trí của Tinh Linh', 'Ảnh hưởng đến điểm Thần của Tinh Linh',
  ],
  GROW_LV: 'Cấp',
  EFFECT: 'Hiệu quả',
  BEFORE: 'Hiệu quả trước đó',
  AFTER: 'Hiệu quả sau',
  BIG_CRIT: 'Đại Bạo Kích，cấp độ trưởng thành + 1',
  NO_ITEMS: 'Không đủ vật phẩm',
  NO_BOOKS: 'Không có Bí Kíp Tinh Linh trong túi',
  SKILLS: 'Kỹ Năng',
  ACTIVE: 'Chủ động',
  PASSIVE: 'Bị động',
  PICK_HINT: 'Nhấp chọn kỹ năng để xem chi tiết',
  UP_NEED: (have: number, need: number): string => `Sách Huấn Luyện Truyền Nhân: ${have}/${need}`,
  LIST: (i: number): string => `Danh sách ${i + 1}`,
  PICK_SKILL: 'Chọn kỹ năng',
  NO_ACTIVE: 'Chưa học kỹ năng chủ động',
  SKIN_IN_USE: 'Đang dùng',
  SILVER: 'Bạc',
  GOLD: 'Vàng',
} as const;

export interface FairyUiHost {
  fairies(): FairyInfo[];
  current(): FairyInfo | null;
  select(id: number): void;
  page(): number;
  setPage(p: number): void;
  busy(): boolean;
  /** Result line of the last cultivation (growth points / crit), '' none. */
  growNote(): string;
  /** Bag items (not equipment) for the feed / skill pickers. */
  items(): BagItem[];
  count(tid: number): number;
  /** Silver of the selected money type and unbound gold. */
  silver(): number;
  gold(): number;
  grow(type: number): void;
  raise(item: BagItem): void;
  feed(item: BagItem): void;
  setGuard(f: FairyInfo, on: boolean): void;
  release(f: FairyInfo): void;
  feedTab(): number;
  setFeedTab(t: number): void;
  skillPick(): number;
  pickSkill(index: number): void;
  learn(book: BagItem): void;
  upgrade(index: number): void;
  draft(): ConfigDraft;
  editDraft(fn: (d: ConfigDraft) => void): void;
  draftDirty(): boolean;
  saveDraft(): void;
  skin(): FairySkin | null;
  showSkin(tid: number, show: boolean): void;
  unlockSkin(tid: number): void;
}

/** Name colour class of a fairy's talent band (white / green / blue / purple / orange). */
export const colourClass = (f: Pick<FairyInfo, 'gexp'>): string => `fy-c${fairyColour(fairyGrowLevel(f.gexp))}`;

/** Left column: the fairies of the current page (FairyManagerPanel PAGE_MAX_FAIRY_NUM 5), guard marks and the pager. */
export function rosterColumn(host: FairyUiHost): HTMLElement {
  const col = el('div', 'fy-roster');
  const all = host.fairies();
  col.appendChild(el('div', 'fy-count', `${FAIRY_UI.COUNT}: ${all.length}`));
  const pages = Math.max(1, Math.ceil(all.length / FAIRY.PAGE));
  const page = Math.min(host.page(), pages);
  const cur = host.current();
  for (const f of all.slice((page - 1) * FAIRY.PAGE, page * FAIRY.PAGE)) {
    const row = el('div', `fy-entry${cur?.id === f.id ? ' on' : ''}`);
    row.append(
      el('div', `fy-entry-name ${colourClass(f)}`, f.name),
      el('div', 'fy-entry-sub', `Cấp ${fairyLevel(f.exp)}  ${f.state === FAIRY.STATE.GUARD ? FAIRY_TEXT.GUARD : FAIRY_TEXT.REST}`),
    );
    if (f.state === FAIRY.STATE.GUARD) row.classList.add('guard');
    row.onclick = () => host.select(f.id);
    col.appendChild(row);
  }
  if (all.length === 0) col.append(el('div', 'ft-muted', FAIRY_UI.EMPTY), el('div', 'fy-help', FAIRY_UI.EMPTY_HINT));
  const pager = el('div', 'fy-pager');
  pager.append(
    button('<', () => host.setPage(page - 1), page <= 1),
    el('span', '', `${page}/${pages}`),
    button('>', () => host.setPage(page + 1), page >= pages),
  );
  col.appendChild(pager);
  return col;
}
