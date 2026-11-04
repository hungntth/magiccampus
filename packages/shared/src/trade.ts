// Trade wire contract (multiplayer phase E): RPCs newTrade / tradeLock / tradeConfirm / stopTrade and the pushes
// onRequestTrade(cid, name), onTargetLock(TargetLock), onTargetConfirm(), onTradeSuccess(), onTradeFail(msg), onStopTrade().

import type { BagItem } from './inventory.js';

/** Items per side (Flash TradePanel slots item1..5). */
export const TRADE_MAX_ITEMS = 5;

/** tradeLock argument: the whole offer of the caller (items are bag item instance ids; pets are not supported). */
export interface TradeOffer {
  money: number;
  gold: number;
  items: number[];
}

/** Reply of newTrade / tradeLock / tradeConfirm; `info` is the player-visible reason when `flag` is false. */
export interface TradeReply {
  flag: boolean;
  info: string;
}

/** onTargetLock payload: what the other side locked (petIds is always empty in H5). */
export interface TargetLock {
  money: number;
  gold: number;
  itemList: BagItem[];
  petIds: number[];
}
