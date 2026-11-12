// Shared types of the Ma Tâm window: the view state (selected box / bag tab / heart), the actions the controller implements and the UI host.

import type { MonsterHeartState } from '@mc/shared';
import type { MhIndex } from './mhRules';

export interface MhView {
  box: number;
  bagType: number;
  /** Selected bag heart id (0 = none). */
  sel: number;
  fuseNum: number;
  resolveNum: number;
  useStone: boolean;
  byGold: boolean;
  status: string;
}

export const newMhView = (): MhView => ({ box: 1, bagType: 0, sel: 0, fuseNum: 2, resolveNum: 1, useStone: false, byGold: false, status: '' });

export interface MhActions {
  place(heartId: number, hole: number, box: number, type: number): void;
  remove(hole: number, box: number): void;
  openGold(box: number, hole: number): void;
  openDiamond(box: number, hole: number): void;
  upgradeBox(box: number): void;
  fuse(isAll: boolean): void;
  resolve(): void;
  render(): void;
}

export interface MhUiHost {
  state(): MonsterHeartState;
  index(): MhIndex;
  view: MhView;
  actions: MhActions;
  maNang(): number;
  stones(): number;
  gold(): number;
  /** Kim Cương owned of one colour code. */
  diamonds(color: number): number;
  /** True while the "Toàn bộ" cooldown runs. */
  allCooling(): boolean;
}
