// Trade wire contract (multiplayer phase E, pets M11 phase D): RPCs newTrade / tradeLock / tradeConfirm / stopTrade and the pushes
// onRequestTrade(cid, name), onTargetLock(TargetLock), onTargetConfirm(), onTradeSuccess(), onTradeFail(msg), onStopTrade().
// On success the giver gets onDelPet(id) and the receiver onAddPet(PetWrapper) per traded pet, before onUPP / onTradeSuccess.

import type { BagItem } from './inventory.js';
import type { PetWrapper } from './pet.js';

/** Items per side (Flash TradePanel slots item1..5). */
export const TRADE_MAX_ITEMS = 5;

/** Pets per side (Flash tradeLock `petIds` carries 5 slots, -1 = empty). */
export const TRADE_MAX_PETS = 5;

/**
 * tradeLock argument: the whole offer of the caller (items are bag item instance ids, pets are pet ids). The Flash client sends
 * `petIds` (5 slots, -1 = empty); the server normalises it into `pets`.
 */
export interface TradeOffer {
  money: number;
  gold: number;
  items: number[];
  pets: number[];
}

/** Reply of newTrade / tradeLock / tradeConfirm; `info` is the player-visible reason when `flag` is false. */
export interface TradeReply {
  flag: boolean;
  info: string;
}

/** onTargetLock payload: what the other side locked (`petList` carries the display wrappers of `petIds`, H5 extra). */
export interface TargetLock {
  money: number;
  gold: number;
  itemList: BagItem[];
  petIds: number[];
  petList: PetWrapper[];
}
