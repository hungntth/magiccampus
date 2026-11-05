# Economy (M5): bank and bag pages, repair, payment, mall, transport, rename card

Plan: `docs/plans/2026-11-04_06_ECONOMY.md` (phases A, B and E; see the implementation notes). Implemented 2026-11-04.
Research: `docs/research/2026-11-04_09_ECONOMY_CLIENT_RESEARCH.md`, `..._10_ECONOMY_SERVER_RESEARCH.md`. Crafting and upgrades are in `forge.md`.

## Pages and bank (shared `economy.ts`)
- Sids: equip 1–22, bank 301–450 (5 pages × 30), bag 2101–2310 (7 pages), quest page 2311–2340, pet-item page 2341–2370.
  Helpers: `sidOf(slotType, slotIndex)` / `slotOf(sid)`.
- SlotTypes: BANK 2 (Go's number), QUEST_BAG 4, PET_BAG 5, PET_EQUIP 6.
- `bagSlotNum` (default 1, max 7) and `bankSlotNum` (default 1, max 5) are character fields sent at login.
  - Page books: item 325 opens a bag page, item 324 a bank page. They are an H5 rule (Go never implemented them) and go through `useItem`.
- Capacity is per character: `InventoryService.capacity(characterId)` covers every opened general page. Shop, loot, quest rewards, unequip, trade and pet gear all use it.
- Page rules:
  - The quest page takes item type 508 only; the pet page takes kind 9 only. Locked pages are refused with "Trang túi chưa mở.".
  - `moveItem`, `moveItemNum`, `moveItemToPage`, `dropItem` work over all sids. Merging across storages is allowed (Go refused).
  - Quest items on the quest page count for collect quests. Pet gear on the pet page can be equipped.
- Bank:
  - `npcFuncClick` on an NPC of type 7 sets `session.bankOpen` and pushes `initViewBankPanel`; `closeBank` and map changes clear it.
  - Bank moves are refused with "Hãy mở kho trước." while it is closed (H5).
  - While the bank is open, a bag double-click deposits (`bagToBank(sid, 1)`) and a bank double-click withdraws (`bagToBank(sid, 2)`), M11 phase C.
  - `bankSort()` (M11 phase C, needs the bank open): merges, orders and repacks the opened bank pages; pushes `onDelCharactorSlot(id, oldSid)` per merged-away row, then `onBankSort([{oldId, newId, stackNum}])` keyed by bank sid (same contract as `onItemSort`). The panel Sắp xếp button confirms ("Xác nhận sắp xếp kho?") and stays disabled 30 s. Details in `temp-bag.md`.
- Repair:
  - `repair(itemId, mode)` and `repairAll(mode)` cost `(max-cur)*10` unbound money. This is Go-invented; durability never drops anyway.
  - The code lives in `InventoryModule` (avoids a module cycle).
- `sellItem` ignores the password argument.

## Payment and mall (shared `payment.ts`)
- `changeMoneyType(1..4)` → `{flag, num}`; it persists `selectedMoneyType` / `selectedGoldType`, which are also sent at login.
  - Radios in the shop and bag panels stay in sync.
- `unlockMoney` → `true`: there is no money lock (H5).
- Mall:
  - `getSystemShop` (an H5 helper, because Flash reads the rows from static tables) and `buySystemItemClient(slotId, n)`.
  - Gold only, by the selected gold type; `gt == 1` forces unbound gold. Point rows are refused. No proximity check.
  - It uses the NPC buy pipeline (`ShopService.settle`).
  - Opened by the HUD "Shop" button.
- `getShopConfig`, `getLimitShopConfig`, `getRemainShopConfig` push `[0, "", []]`. `buySystemItemMulti` is registered since M11 phase E (below).

## Transport and rename (shared `transport.ts`, server `modules/transport/`)
- Signatures (Flash): `useTransport(mapId, flag)`, `useTransportGroup`, `useItemGold({tid, mid})`. `getTransportMaps` is an H5 helper.
- Allowed maps: those with `t > 0` (55 maps), not the current map. Arrival is at the safe point (`SceneTransportService.moveToMap`).
- Payment: the first owned scroll in Go's priority order. Otherwise 3 gold, or 5 for the senior scroll or a leader's group transport.
  - Group transport takes the followers; a non-leader member is refused.
- `changeNameByCard(name)` consumes item 2126. It updates the session name, re-pushes the party snapshot and sends `onScenePlayerRenamed(id, name)` to the room.
  A failure refunds the card.
- All four are `forbidInBattle`.

## Deferred
Limit-time / mystery shops (credit, guild and VIP shops are done: `shop.md`, `vip.md`), durability wear, money lock,
`useRedBag` / radar / seek / track, the "buy and use" gold panel, the bad-word list. Quiet the new RPCs after the user confirms.
- Mall UI (2026-11-04, `client/src/ui/mallPanel.ts` + `mallWallet.ts`): legacy SystemShopPanel layout, 566 px. Left
  vertical st tabs Hot / Sale / New / Limit / Dò tìm (default Hot), category tabs on top, 4x4 grid (16 per page) with an
  st ribbon per cell, search box (accent-insensitive name match) + Dò tìm / Nạp (not ready) / Mua, kim phiếu note, and
  the wallet column (original icons GoldBinded / 1663 / ExchangePoint from /ui/Panels_BagPanel; Kim phiếu / Vàng
  with the changeMoneyType 3 / 4 checkboxes, điểm thưởng = PlayerData.exPoint (Character.exPoint, default 0) with a
  not-ready "Đổi điểm thưởng" link; figures are plain text, refreshed on onUPP / onAddMoney). Shop, mall and VIP shop cells use the bag-style hover box (`itemTip.renderSlotTip`); `ShopSlotView`
  carries `tplType` (Loại line, 0 for equipment) and `reqLevel` for it.
- `Panels_BagPanel/ExchangePoint.png` was rendered with `swfui -match ExchangePoint` into a scratch dir and its index
  entry merged into `client/public/ui/index.json` by hand (swfui rewrites index.json with only what it rendered).

## Mall trolley and shop leftovers (M11 phase E, 2026-11-05)
- `buySystemItemMulti({shopSlotId: num})` (SystemShopTrolleyPanel; the Go list forms `[{shopSlotId, amount}]` / `[[id, n]]` are accepted, equal ids summed, 1..99999 per row, <= 100 rows) -> `{success, items: AddItemNotice[]}`. Server (`shop/mall-cart.service.ts`, under `withCharLock`): price every row like `buySystemItemClient` (gold only, `gt 1` unbound, point rows refused) -> whole-cart `canFitAll` -> one conditional spend per currency (undone on a short balance) -> add row by row; a failure part way refunds only the unadded remainder and answers `success: false` with the added items. Pushes: `onAddItem` per item, `onAddCharactorSlot` per slot, `onUPP{goldBind | gold}`; every refusal pushes `onRedMsg "Mua thất bại: ..."` and still answers `{success: false, items: []}` (Go's shape; Go sent no red message).
- Client (`ui/mallCart.ts`, owned by `MallPanel.cart`): `Thêm vào xe` (selected gold row + amount dialog; max 20 rows, no duplicate row, texts SYSTEMSHOPPANEL_U[36] / [37]), `Xe hàng (n)` opens the Xe hàng window (8 per page, Xóa per row, total), Mua warns about kim phiếu ([38]) then confirms the total ([40]) and calls the RPC; the cart empties on success (or drops the bought rows on a partial grant).
- `getShopAwardStr` -> "" (the trolley shows "Tạm thời không có"); `getLimitTimeShop` -> {} (no seed data); `buyLimitTimeItem` -> red note. `shopClosePanel`, `buyItemClient`, `openShopDirect` and the credit shops are in `shop.md`.
