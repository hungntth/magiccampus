# Trade (giao dịch)

Plan: `docs/plans/2026-11-04_04_MULTIPLAYER.md` (phase E; see its implementation notes). Implemented 2026-11-04.

## Contract (shared `trade.ts`)
- RPCs, none quiet:
  - `newTrade(cid)`, `tradeLock({money, gold, items})`, `tradeConfirm(code)`: each returns `TradeReply {flag, info}` and is `forbidInBattle`.
  - `stopTrade()`: a no-op when no trade is running.
- Pushes:
  - `onRequestTrade(cid, name)`: the target's panel opens; there is no accept step.
  - `onTargetLock({money, gold, itemList, petIds: []})`.
  - `onTargetConfirm()`.
  - `onTradeSuccess()`, `onTradeFail(msg)`, `onStopTrade()`.

## Rules (`modules/trade/`)
- `newTrade`: both online, same map, not in a battle, not already trading.
- `tradeLock` (validated by `trade-rules.ts`):
  - ≤ 5 items, owned, unbound, in the bag;
  - money/gold ≤ the unbound balances;
  - re-lock is allowed until execution and resets both confirmations.
- `tradeConfirm`: the code is ignored (no secondary password). Both must be locked; the second confirm executes.
- Swap (`trade-swap.service.ts`):
  - It holds `withCharLock` on both characters in ascending id order. The saga is debits → row moves (conditional updates of `characterId`/`slotIndex`; items keep their id) → credits, with reverse undo on failure.
  - It does not use Mongo transactions (the server is standalone, no replica set).
  - Bag space counts only currently empty slots.
- Success pushes, per side:
  1. `onDelCharactorSlot` (given);
  2. `onAddCharactorSlot` (received);
  3. `onAddMoney` (only for received Bạc);
  4. `onUPP {money, gold}`;
  5. `onTradeSuccess`.
- Map change, battle start, back to character select and disconnect all end the trade.

## Client
`game/TradeController.ts`, `ui/tradePanel.ts` + `.css`. Bag double-click feeds the open trade (`BagController.tradeHook`). Player menu "Giao dịch".
Not verified: dragging from the bag onto the panel, Esc, two real browser tabs (only one tab plus a scripted peer).

## Deferred
Pets, the protection code, the `tradable` template column (not checked by Go either).
Quiet the trade RPCs after the user confirms.
