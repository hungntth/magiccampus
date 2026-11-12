// IM window tab specs (legacy IMPanel): the pluggable tab model of the "Hảo hữu" window. Bạn bè / Kẻ thù / Sổ đen are list tabs
// with the actions below; Sư đồ and Kết bái start as plain read-only lists (their rows are written by the mentor / brotherhood
// features) and later phases replace them through FriendPanel.registerTab (same id) with a custom `renderBody`.

import { RelationLimits, RelationType, type InitViewImC, type RelationEntry, type RelationTypeId } from '@mc/shared';

export type ImLists = InitViewImC;

export interface ImRowAction {
  label: string;
  run(): void;
  disabled?: boolean;
}

/** What a tab's row actions can call (implemented by FriendController). */
export interface ImHost {
  whisper(entry: RelationEntry): void;
  privateChat(entry: RelationEntry): void;
  invite(entry: RelationEntry): void;
  remove(entry: RelationEntry): void;
}

export interface ImTabSpec {
  id: string;
  label(lists: ImLists): string;
  /** Rows of the default list body. */
  rows?(lists: ImLists): RelationEntry[];
  /** Custom body (mentor student grid, brother group...): replaces the list and the action bar. */
  renderBody?(body: HTMLElement, lists: ImLists, host: ImHost): void;
  /** Wire type the add box adds by name; the box is hidden when absent. */
  addType?: RelationTypeId;
  addPlaceholder?: string;
  actions?(entry: RelationEntry, host: ImHost): ImRowAction[];
  emptyText?: string;
  /** Show the intimacy number on the rows. */
  intimacy?: boolean;
}

const chatActions = (e: RelationEntry, h: ImHost): ImRowAction[] => [
  { label: 'Chat mật', run: () => h.whisper(e) },
  { label: 'Chat riêng', run: () => h.privateChat(e) },
  { label: 'Mời nhóm', run: () => h.invite(e), disabled: e.data === undefined },
];

export function defaultImTabs(): ImTabSpec[] {
  return [
    {
      id: 'friend', label: (l) => `Bạn bè (${l.friend.length}/${RelationLimits.FRIEND})`, rows: (l) => l.friend,
      addType: RelationType.FRIEND, addPlaceholder: 'Nhập tên nhân vật', intimacy: true,
      actions: (e, h) => [...chatActions(e, h), { label: 'Xóa', run: () => h.remove(e) }],
    },
    {
      id: 'enemy', label: (l) => `Kẻ thù (${l.enemy.length}/${RelationLimits.ENEMY})`, rows: (l) => l.enemy,
      addType: RelationType.ENEMY, addPlaceholder: 'Tên kẻ thù', emptyText: 'Chưa có kẻ thù',
      actions: (e, h) => [{ label: 'Chat mật', run: () => h.whisper(e) }, { label: 'Xóa', run: () => h.remove(e) }],
    },
    {
      id: 'black', label: (l) => `Sổ đen (${l.black.length}/${RelationLimits.BLACK})`, rows: (l) => l.black,
      addType: RelationType.BLACK, addPlaceholder: 'Nhập tên nhân vật',
      actions: (e, h) => [{ label: 'Xóa', run: () => h.remove(e) }],
    },
    {
      id: 'tutor', label: (l) => `Sư đồ (${l.tutor.length})`, rows: (l) => l.tutor, intimacy: true, emptyText: 'Chưa có sư phụ hay đồ đệ',
      actions: (e, h) => chatActions(e, h),
    },
    {
      id: 'brother', label: (l) => `Kết bái (${l.brother.length})`, rows: (l) => l.brother, intimacy: true, emptyText: 'Chưa kết bái',
      actions: (e, h) => chatActions(e, h),
    },
  ];
}
