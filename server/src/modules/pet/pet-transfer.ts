// Pure rule shared by mail / auction / trade: when a pet may leave its owner (Go domain/pet/transfer.go TransferBlock).
// Unbound, resting (not the battle pet, not following), wearing no pet gear. H5 mounts are a separate module that never
// uses a pet row, so no mounted check exists. Callers pick the refusal texts (they differ per feature).

import { PetState } from '@mc/shared';

export type PetTransferBlock = 'bound' | 'active' | 'equipped';

export interface PetTransferFacts {
  binded: number;
  state: number;
  following: boolean;
  equ: readonly number[];
}

/** First reason the pet cannot be transferred, or null when it can. Order follows Go: bound, active, equipped. */
export function petTransferBlock(p: PetTransferFacts): PetTransferBlock | null {
  if (p.binded > 0) return 'bound';
  if (p.following || p.state === PetState.BATTLE || p.state === PetState.FOLLOW) return 'active';
  if (p.state !== PetState.REST) return 'active';
  if (p.equ.some((id) => id > 0)) return 'equipped';
  return null;
}

export type PetTransferTexts = Readonly<Record<PetTransferBlock, string>>;

/** Refusal text of a block for one caller's wording, or null. */
export function petTransferNote(p: PetTransferFacts, texts: PetTransferTexts): string | null {
  const block = petTransferBlock(p);
  return block ? texts[block] : null;
}
