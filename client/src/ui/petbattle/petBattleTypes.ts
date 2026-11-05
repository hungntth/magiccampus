// Contracts between the PPVE / arena windows (views) and their controllers (game/PpveController.ts, game/ArenaController.ts), which own
// the RPCs, the pushes and the state. Views never call the client directly.

import type {
  PetArenaFightPush, PetArenaPrevRank, PetArenaRankReply, PetArenaRow, PetArenaSysMsg, PetSkillInfo, PetView, PPVEConfig, PPVEData,
  PPVEKpData, PPVERank, PPVESlot,
} from '@mc/shared';

/** What the line-up dialog needs from the pet list. */
export interface PetSource {
  pets(): PetView[];
  skillInfo(id: number): PetSkillInfo | undefined;
}

export interface PpveLogLine {
  text: string;
  bid: string;
}

export interface PpveModel {
  kp: PPVEKpData | null;
  ppve: PPVEData | null;
  log: PpveLogLine[];
  rank: PPVERank | null;
  /** The challenge request is in flight (the "Đang khiêu chiến" overlay). */
  loading: boolean;
  autoWatch: boolean;
}

export interface PpveActions extends PetSource {
  refresh(): void;
  saveConf(conf: Record<string, PPVESlot>): Promise<boolean>;
  challenge(): void;
  buyTry(): void;
  exchange(): void;
  exchangeGold(): void;
  levelUp(part: number, icon: number): void;
  replay(bid: string): void;
  loadRank(): void;
  setAutoWatch(on: boolean): void;
}

export interface PpveHost {
  model(): PpveModel;
  actions: PpveActions;
  /** Gold of the player (price hints). */
  gold(): number;
}

/** The own row of onGetEnemies (header fields) and the list under it. */
export interface ArenaModel {
  loaded: boolean;
  /** Rows as pushed: the own row first when registered. */
  rows: PetArenaRow[];
  log: PetArenaFightPush[];
  /** Plain refusal lines (addArenaLog strings) shown in the log too. */
  notes: string[];
  sys: PetArenaSysMsg | null;
  rank: PetArenaRankReply | null;
  prev: PetArenaPrevRank | null;
  autoWatch: boolean;
}

export interface ArenaActions extends PetSource {
  refresh(): void;
  register(name: string, conf: Record<string, PPVESlot>): Promise<boolean>;
  loadConf(): Promise<Record<string, PPVESlot>>;
  fight(row: PetArenaRow): void;
  buyTurn(): void;
  clearCd(): void;
  loadRank(): void;
  loadPrev(): void;
  claimAward(): void;
  replay(bid: string): void;
  setAutoWatch(on: boolean): void;
}

export interface ArenaHost {
  model(): ArenaModel;
  actions: ArenaActions;
  playerId(): number;
  playerLevel(): number;
  /** Currency 19 (paPnt) of the player. */
  points(): number;
}

export type { PPVEConfig };
