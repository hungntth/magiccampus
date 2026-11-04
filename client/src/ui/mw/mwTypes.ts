// Contracts between the Thần khí window tabs (mwTabs*.ts) and MagicWeaponController: the read-only context a tab draws from and the
// actions it can trigger. Tabs are plain functions that fill the window body.

import type { BagItem, MWPanelInfo, PlayerData } from '@mc/shared';

export interface MwActions {
  /** bindItem: the weapon must be locked before it can be upgraded / reset. */
  bind(): void;
  upgrade(): void;
  resolve(): void;
  /** One piece (the selected one) or every worn weapon. */
  repair(all: boolean): void;
  resetSkill(): void;
  trans(): void;
  resetProp(): void;
  activate(index: number): void;
}

export interface MwCtx {
  player: PlayerData;
  /** Every magic weapon in the bag and worn. */
  items: BagItem[];
  selId: number | null;
  sel: MWPanelInfo | null;
  /** Transfer target (tab "Chuyển thuộc tính"). */
  secondId: number | null;
  second: MWPanelInfo | null;
  /** queryMWResetPropMax of the selection. */
  resetMax: { n1: number; n2: number } | null;
  skillPos: number;
  busy: boolean;
  /** Result line of the last action. */
  note: string;
  pick(id: number): void;
  pickSecond(id: number): void;
  setSkillPos(pos: number): void;
  act: MwActions;
}

export const MW_TABS = ['Thăng cấp', 'Phân giải', 'Sửa chữa', 'Kỹ năng', 'Chuyển TT', 'Tái lập TT', 'Tẩy luyện'] as const;
