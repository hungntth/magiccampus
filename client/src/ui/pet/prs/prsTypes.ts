// Host contract of the Chân Hồn Thần Thú window tabs (implemented by game/PrsController.ts) and the static-table lookups they share.

import { PRS_CHIP_ROWS, PRS_SHOW_ROWS, PRS_TREE_ROWS, type PrsChipRow, type PrsPanel, type PrsShowRow, type PrsTreeRow } from '@mc/shared';

export type PrsCollectKind = 'free' | 'gold' | 'six';

export interface PrsUiHost {
  panel(): PrsPanel | null;
  now(): number;
  stone(): number;
  crystal(): number;
  water(): number;
  gold(): number;
  busy(): boolean;
  /** Form sub-tab: 0 goddess forms (chips), 1 special forms (bag items). */
  formTab(): number;
  setFormTab(tab: number): void;
  chipPage(): number;
  setChipPage(page: number): void;
  itemCount(templateId: number): number;
  treeUp(): void;
  collect(kind: PrsCollectKind): void;
  activate(show: PrsShowRow): void;
  equip(showId: number): void;
  cancel(): void;
  move(from: number, to: number, direction: number): void;
  exchange(chipId: number): void;
  swap(all: boolean): void;
}

const TREE = new Map(PRS_TREE_ROWS.map((r) => [r.id, r]));
const SHOW = new Map(PRS_SHOW_ROWS.map((r) => [r.id, r]));
const CHIP = new Map(PRS_CHIP_ROWS.map((r) => [r.id, r]));

export const treeOf = (id: number): PrsTreeRow | undefined => TREE.get(id);
export const showOf = (id: number): PrsShowRow | undefined => SHOW.get(id);
export const chipOf = (id: number): PrsChipRow | undefined => CHIP.get(id);

/** Forms of a sub-tab in panel order (position, then id). */
export const formsOfTab = (tab: number): PrsShowRow[] =>
  PRS_SHOW_ROWS.filter((r) => r.tab === tab).sort((a, b) => a.position - b.position || a.id - b.id);

/** Icon of a form: the matching chip icon, else the res code as an ext-3 icon (same number). */
export function formIcon(show: PrsShowRow): string {
  const chip = PRS_CHIP_ROWS.find((c) => c.showId === show.id);
  return chip ? chip.iconCode : `3${show.resCode.slice(1)}`;
}
