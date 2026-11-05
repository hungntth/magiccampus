// Pure rule shared by mail / auction / trade: when a pet may leave its owner (Go domain/pet/transfer.go TransferBlock).
// Unbound, resting (not the battle pet, not following), wearing no pet gear. H5 mounts are a separate module that never
// uses a pet row, so no mounted check exists. Callers pick the refusal texts (they differ per feature).

import { PetState } from '@mc/shared';

export type PetTransferBlock = 'bound' | 'active' | 'equipped' | 'guarded';

/** Refusal for a pet in a Chien Thu Ho Ve slot (PANEL_PETGUARD[21] 7: no trade, auction, mail, release, fusion). */
export const PET_GUARDED_TEXT = 'Pet đang ở vị trí Chiến Thú Hộ Vệ, hãy gỡ ra trước!';
/** Refusal for a pet saved in the PPVE line-up (release; trade / mail / auction already refuse it as a bound pet). */
export const PET_LINEUP_TEXT = 'Pet đang trong đội hình Không Gian Điêu Khắc hoặc Đấu pet, hãy gỡ ra trước!';

export interface PetTransferFacts {
  binded: number;
  state: number;
  following: boolean;
  equ: readonly number[];
  /** The pet sits in a guard slot; callers that know the guard state set it. */
  guarded?: boolean;
}

/** First reason the pet cannot be transferred, or null when it can. Order follows Go: bound, active, equipped; then the guard slot. */
export function petTransferBlock(p: PetTransferFacts): PetTransferBlock | null {
  if (p.binded > 0) return 'bound';
  if (p.following || p.state === PetState.BATTLE || p.state === PetState.FOLLOW) return 'active';
  if (p.state !== PetState.REST) return 'active';
  if (p.equ.some((id) => id > 0)) return 'equipped';
  if (p.guarded) return 'guarded';
  return null;
}

export type PetTransferTexts = Readonly<Record<PetTransferBlock, string>>;

/** Refusal text of a block for one caller's wording, or null. */
export function petTransferNote(p: PetTransferFacts, texts: PetTransferTexts): string | null {
  const block = petTransferBlock(p);
  return block ? texts[block] : null;
}
