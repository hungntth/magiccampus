// Contracts of the "Luyện pet" window (legacy PetFuncPanel): the host the controller implements (data + RPC wrappers) and the
// tab interface each tab file builds against. Views never call the client directly; PetFuncController owns the RPCs.

import type { BagItem, PetGrowthReply, PetSkillInfo, PetView, PlayerData } from '@mc/shared';

export type PetFuncTabId = 'star' | 'join' | 'refine' | 'rebirth' | 'point' | 'skill' | 'eat' | 'element';

/** RPC wrappers: a refused / failed call resolves null (the server already pushed the refusal note). */
export interface PetFuncActions {
  star(petId: number, itemId: number, safeId: number | null): Promise<PetGrowthReply | null>;
  starClear(petId: number, itemId: number): Promise<PetGrowthReply | null>;
  join(main: number, subs: number[], senior: boolean): Promise<PetGrowthReply | null>;
  xsd(petId: number, itemId: number): Promise<PetGrowthReply | null>;
  pzXsd(petId: number, itemId: number): Promise<PetGrowthReply | null>;
  xd(petId: number, itemId: number): Promise<PetGrowthReply | null>;
  upSkill(petId: number, slot: number): Promise<boolean>;
  eat(main: number, sub: number, luckItem: number | null, luckNum: number, aptType: number): Promise<PetGrowthReply | null>;
  ensureEat(main: number): Promise<PetGrowthReply | null>;
  element(petId: number, element: number): Promise<PetGrowthReply | null>;
}

export interface PetFuncHost {
  actions: PetFuncActions;
  pets(): PetView[];
  /** Bag items of the general pages (main bag). */
  items(): BagItem[];
  player(): PlayerData;
  /** Pet the pet window had selected when the Luyện window opened (null = none). */
  initialPet(): PetView | null;
  skillInfo(id: number): PetSkillInfo | undefined;
}

export interface PetFuncTabView {
  /** Pets or bag changed (a push arrived): drop vanished seats and redraw. */
  refresh(): void;
  dispose(): void;
}

export interface PetFuncTab {
  id: PetFuncTabId;
  label: string;
  build(host: PetFuncHost, body: HTMLElement): PetFuncTabView;
}
