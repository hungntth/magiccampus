# Trade (giao dịch)

Plan: `docs/plans/2026-11-04_04_MULTIPLAYER.md` (phase E; see its implementation notes). Implemented 2026-11-04.

## Contract (shared `trade.ts`)
- RPCs, none quiet:
  - `newTrade(cid)`, `tradeLock({money, gold, items, pets})` (Flash `petIds` accepted too), `tradeConfirm(code)`: each returns `TradeReply {flag, info}` and is `forbidInBattle`.
  - `stopTrade()`: a no-op when no trade is running.
- Pushes:
  - `onRequestTrade(cid, name)`: the target's panel opens; there is no accept step.
  - `onTargetLock({money, gold, itemList, petIds (5 slots, -1 empty), petList: PetWrapper[]})`.
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
The protection code, the `tradable` template column (not checked by Go either).
Quiet the trade RPCs after the user confirms.

## M11 phase A
`TradeBook.isLocked(cid)` (TradeManager exported) lets mail / auction refuse goods moves while an offer is locked.

## Pets (M11 phase D)
- Offer: `TradeOffer.pets` (≤ `TRADE_MAX_PETS` 5 ids); `parseOffer` reads `pets` or Flash `petIds` (array or slot map, ids ≤ 0 dropped). `onTargetLock` carries `petIds` padded to 5 with -1 and `petList` wrappers for the panel.
- Lock rules (`trade-rules.ts validatePets`): ≤ 5, distinct, owned, `pet/pet-transfer.ts` (unbound, resting, not following, no gear), Go texts (`Pet giao dịch không tồn tại!`, `Không thể giao dịch pet đã khóa!`, `Pet đang xuất chiến, đi theo hoặc được cưỡi, ...`, `Pet đang mang trang bị, ...`, `Pet giao dịch bị trùng!`, `Chỉ có thể giao dịch tối đa 5 pet!`).
- Room: `pets + incoming - outgoing <= petMaxNum` per receiver (`hasTradePetRoom`), text `Không đủ Ô Pet!`. Checked at lock only once the peer has locked; always re-checked at execute time on live rows.
- Swap (`trade-pets.service.ts`, `trade-swap.ts`): debits -> pet moves -> item moves -> credits. A pet move is one conditional `updateOne` on `{_id, characterId: from, binded 0, state REST, not following, no escrowRef, no gear}` -> `characterId: to, following: false`; undo moves it back (`{_id, characterId: to}`). Pets keep their id.
- Success pushes per side: slots, then `onDelPet(id)` to the giver and `onAddPet(wrapper)` to the receiver, then `onAddMoney`, `onUPP`, `onTradeSuccess`.
- Not ported: Go guard-slot / pet-arena busy check (no such H5 feature), pet-lock while offered (a changed pet fails the swap cleanly), the Đã mất / Đã nhận chat summary.
- Client: `ui/tradePets.ts` (5 slots per side + picker of resting unbound gearless pets), `tradePanel.ts` Thêm pet button, double click a pet slot removes. Tests: `trade-rules.test.ts`, `trade-swap.test.ts`. Smoke: two ws bots (see the plan notes).
