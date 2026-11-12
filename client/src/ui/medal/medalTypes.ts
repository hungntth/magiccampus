// Shared types of the Ấn Chương window: the view state, the data the controller exposes (MedalUiHost) and the actions it accepts.

import type { MedalBagMap, MedalInfo, MedalRow } from '@mc/shared';
import type { MedalLookup } from './medalRules';

export interface MedalView {
  /** Selected slot (bag 1..600 or worn 1001.. / 2001..); 0 = none. */
  sel: number;
  page: number;
  breakCount: number;
}

export const newMedalView = (): MedalView => ({ sel: 0, page: 0, breakCount: 1 });

export interface MedalActions {
  equip(bagSlot: number, equipSid: number): void;
  unequip(equipSlot: number): void;
  upgrade(slot: number): void;
  dissolve(slot: number, count: number, row: MedalRow): void;
  arrange(): void;
  render(): void;
}

export interface MedalUiHost {
  info: () => Pick<MedalInfo, 'medalExp' | 'charBuff' | 'petBuff'>;
  bag: () => MedalBagMap;
  look: () => MedalLookup;
  /** Engrave line row by id. */
  row: (id: number) => MedalRow | undefined;
  charLevel: () => number;
  view: MedalView;
  actions: MedalActions;
}
