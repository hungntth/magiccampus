# NPC shop

> Buy / sell added 2026-11-03 (plan 05): see `docs/memory/inventory.md`. The "view only" notes below still hold for the view.

Plan: `docs/plans/2026-11-03_04_NPC_SHOP_VIEW.md`. Implemented 2026-11-03. Legacy notes: `E:\mcgame\docs\memory\shop-system.md`.

## Contract
- Push `onOpenShop` (`OpenShop` in shared: `shopId, npcId, shopType, slots: ShopSlotView[]`; prices as `ShopPrice`
  with `ShopCurrency` kinds). Legacy sends only `shopId`; ours carries the resolved slots (H5 has no static tables).
- Triggers: `clickNpc` on an NPC with `shop_id > 0` and no quests; `npcFuncClick(npcId)` (dialog function button).
  Both RPCs are not quiet yet. Unknown shop -> `notFound('shop')`.

## Files
- shared `protocol.ts`; server `modules/shop/{shop-mapping,shop.service,shop.module}.ts` + `shop-mapping.test.ts`;
  `GameDataService.getShop / shopSlots / templatesByIds` (shops + slots cached at `reload()`);
  `npc.rpc.ts`, `npc.service.ts` (npcType forced to 2 when `shop_id > 0`).
- client `ui/shopPanel.ts` + `ui/shop.css`, `ui/npcDialog.ts` (`onFunc`), `game/GameScene.ts` (`onOpenShop`, close rules).

## Rules
- Slots: `sid = shopId` ordered by position, id; `st` 5 / -1 hidden. Page 12 (shop type 1) else 9.
- Template table: slot type 19 -> equipt_template, else item_template. Name colour: ceil(quality/5) or template.color >= 0.
- Prices: type 1 gold > money > point > template (gold, honor, price); type 2 uses p_type/p_num pairs as `special`.
- Panel closes on scene change/destroy and when the player is > 300 px from the NPC.

## Deferred
Repair (buttons toast), special currency names beyond guild contribution, rich item tooltips, `[postfix]` suffix. Quiet the RPCs
only after the user confirms. (`shopClosePanel`, credit / guild / mall leftovers: see "M11 phase E" below.)

## Window behaviour (2026-11-03)
- `client/src/ui/panelBehavior.ts`: `makeDraggable(panel, handle)` (ShopPanel passes its 30 px `.shop-header` strip with
  the title: only it shows the move cursor and starts a drag; stage-scale aware, kept on screen) and
  `closeOnEscape(close)` (also when the chat input has focus, which is blurred). ShopPanel registers both in `show()`
  and disposes them in `close()`. Reuse them for other windows.

## M5 (2026-11-04)
Bank, bag pages, repair, payment radios and the mall are in `economy.md`; crafting and upgrades in `forge.md`.

## M11 phase E: shop leftovers (2026-11-05)
Plan: `docs/plans/2026-11-04_14_MAIL_AUCTION_BAGS.md` (phase E notes). Legacy: `E:\mcgame\docs\memory\shop-system.md`, Go `application/shop/credit.go`, `handlers/shop`, `handlers/npc/{credit_shop_npc,guild_shop_gate}.go`.

### Contract (shared `creditShop.ts`, `payment.ts`; `PlayerUpdate` gains `guildContrib` / `donateContrib`)
- Credit point shops (TBL_CREDIT `data_tbl_credit`, shops 1-9): push `openShopById(OpenCreditShop)` (rows resolved server side: name, icon, colour, tooltip text, cost, limit; `balance`, `tabs`, `score` / `unit` strings of NPCSHOP_CONFIG). RPCs `updateLimit()` -> `{dayDict, weekDict, monthDict, totalDict}` and `exchangeItem(creditId, num)` -> counter dict of the credit's limit type (`{}` when unlimited). Push order after an exchange: `onAddMoney(cid, key, -cost, total)`, `onUPP{currencies}`, `onAddItem`, `onAddCharactorSlot` per slot, `onBlueMsg`; a refusal pushes `onRedMsg "Đổi thất bại: ..."` and the call rejects.
- Openers: `clickNpc` / `npcFuncClick` on NPC 2318 (`CREDIT_SHOP_NPCS`, shop 2) and `openTXKCShop` (shop 7). Go's other openers (`trade_func`, `exchange_pet_equip`, `park_shop_*` script funcs, Halloween / XCDS handlers) have no H5 feature yet.
- Guild shop 83 (NPC 1117, map 49): gate on open and on buy = member of a guild of level >= 3, else `onSystemMidMsgOrNote` with the Go texts (Go used the `a` callback, which the H5 client has no handler for). Prices p_type 20 / 21 (normal / donate contribution) spend BOTH wallets of the slot (300 + 5000) with one conditional update on the guild member row; the item is not bound. Push `onUPP{guildContrib, donateContrib}` (GuildController mirrors it into the member row). Any other special p_type stays refused ("chưa hỗ trợ loại tiền này").
- `buyItemClient(slotId, num)`: same purchase as `buyAmountItemClient`, replies null, same pushes (`onBlueMsg`, `onUPP`, `onAddItem`, slots). `shopClosePanel` null (the client calls it when an NPC shop closes). `openShopDirect(shopId)` whitelists 98 / 115 (`SHOP_DIRECT_IDS`) and pushes `onOpenShop` with npcId -1 (view only: their price type 19 is refused on buy; the NPC-proximity check is skipped for them).
- Mall: `buySystemItemMulti({slotId: num})` -> `{success, items}`; stubs `getShopAwardStr` -> "", `getLimitTimeShop` -> {}, `buyLimitTimeItem` -> `onRedMsg "Mua thất bại: đợt bán đã kết thúc"`. Details in `economy.md`.

### Rules
- Exchange order (Go): equipment rows always 1 unit; bag fits the whole amount -> balances checked -> limit reserved (conditional upsert on `character_credit_limits`, unique `{characterId, creditId, period}`, filter `count <= limit - n`) -> points spent (`CurrencyService.spend`) -> item granted; a failure credits the points back and releases the limit. One exchange at a time per character (`withCharLock`). Bound per `bind`, colour `ceil(quality / 5)`. `is_sell = 0` rows are hidden in the panel (Flash filter) but, as in Go, not refused by the server.
- Period buckets reuse `dayKey / weekKey / monthKey` (UTC+7, Monday-first week): `creditPeriodKey`. The data has week (21 rows) and month (135 rows) limits only, no day limits.
- Balances are `Character.currencies` (reality, not the plan's `points` map): `CURRENCY_IDS` gained `wisdonCrystal`, `heroScore2507`, `anni2017`, `xmCandy24`, `xcds2403p` (couragePoint and txkc2508p existed, so the corridor / TXKC rewards already feed shops 2 and 7). Shops 8 / 9 (`dmbk2509p`, `tkyyhpointV2`) have no balance (Go refuses them too): browsable, exchange refused with "loại điểm 70 chưa được hỗ trợ". Balances start at 0, sources arrive with their features.

### Files
- shared: `creditShop.ts` (+test), `payment.ts`, `progression.ts`, `protocol.ts`.
- server `modules/shop/`: `credit-shop.{schema,service,rpc}.ts`, `credit-shop-rules.ts` (+test), `mall-cart.service.ts`, `shop-buy.ts` (+test), `shop.service.ts` (contribution charge, `BuyResult.update`), `shop.rpc.ts`, `mall.rpc.ts`, `mall-rules.ts` (+test); `guild/guild-shop.service.ts`; `npc/npc.rpc.ts`; `training/txkc.rpc.ts`; `GameDataService.creditRows / credit`.
- client: `ui/creditShopPanel.ts` + `creditShop.css`, `ui/mallCart.ts`, `ui/mallPanel.ts`, `ui/shopCell.ts` (guild price badges `CH` / `QG`, `isPayable`), `ui/shopPanel.ts` (`onClosed`), `game/NpcPanels.ts`, `game/MallController.ts`, `game/GuildController.ts`.

### Deferred
Limit-time shop engine (M16), credit point sources for shops 3-6, 8, 9, `buyItemClient` as the NumPanel TYPE_BUY path (the H5 shop panel still calls `buyAmountItemClient`). All new RPCs are NOT quiet: quiet them only after the user confirms.

- M14 H: `shop-buy.ts` `resolvePrice` returns a `PointPrice` for p_type 7 (Huy Chương Dũng Sĩ = currency 225 `threePvpPnt`, slot 4354 of shop 85, NPC 1520 on map 9); `ShopService.chargePoints` is one conditional `CurrencyService.spend` (refund = credit), the push is `onUPP {currencies}`. `slotPrices` now also lists a type-2 slot whose only price is `p_type2`. See `threepvp.md`.
