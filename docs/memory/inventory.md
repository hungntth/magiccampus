# Bag (Túi đồ) + shop buy / sell

Plan: `docs/plans/2026-11-03_05_BAG_SHOP_BUY_SELL.md`. Implemented 2026-11-03. Legacy notes: `E:\mcgame\docs\memory\item-inventory.md`, `shop-system.md`.

## Contract (shared `inventory.ts`, `protocol.ts`)
- `BagItem` (legacy item DTO subset + H5 extras `name, iconCode, info, sellPrice`), `GetInitSlotReply` (keyed by item id),
  `AddItemNotice`, `ItemKind`, `SlotType`, `BAG_SID_BASE = 2101`, `BAG_PAGE_SLOTS = 30`. `ShopSlotView.stackMax`,
  `PlayerData.goldBind`, `PlayerUpdate` accepts `goldBind`.
- RPCs (not quiet yet): `getInitSlot()`, `buyAmountItemClient(shopSlotId, amount)` -> -1, `sellItem(itemId)` -> true.
- Pushes: `onAddCharactorSlot(BagItem)` per changed slot, `onDelCharactorSlot(itemId, sid)`, `onAddItem({i,q,t,n})`,
  `onUPP`, `onAddMoney` (sell only), `onBlueMsg`, `onRedMsg`.
  Buy order: onBlueMsg, onUPP, onAddItem, onAddCharactorSlot*. Sell order: onDelCharactorSlot, onAddMoney, onUPP, onBlueMsg.
- Failure: `onRedMsg("Mua thất bại: <msg>")` / `"Bán thất bại: <msg>"` AND the call rejects (`RpcException`). The client
  ignores the rejection (the red toast is the display).

## Files
- server `modules/inventory/`: `character-item.schema.ts` (`character_items`, unique char+slotType+slotIndex, ids from
  counter `items`), `bag-rules.ts` (+test; maxStack, planAdd, sidOf, sellUnit), `bag-mapping.ts`, `inventory.service.ts`
  (list, canFit, add with compensation, removeForSale), `inventory.rpc.ts`, `inventory.module.ts`.
- server `modules/shop/`: `shop-buy.ts` (+test; resolvePrice, boughtColor), `shop.service.ts` (buy, sell), `shop.rpc.ts`.
- `CharacterService`: `paymentPrefs`, `spendMoney` (conditional `$inc`, null when short), `addMoney`.
  Character schema: `goldBind`, `selectedMoneyType` (1), `selectedGoldType` (3); no migration (defaults on read).
- `GameDataService`: `getShopSlot(id)`, `template(type, id)`; template projection now has stack_max, single_flag,
  endure_max, color_code.
- client: `game/BagController.ts`, `ui/bagPanel.ts` + `ui/bag.css` (also holds the amount-dialog CSS), `ui/amountDialog.ts`,
  `ui/shopPanel.ts` (`onBuy`, Mua / double-click), HUD bag button + B key (`systemBar.ts` -> `MainHud` `onBag`).

## Rules
- Storage: bag only (slotType 0), 30 slots, free slot = lowest unused index. Stacking: same template, itemType, bound,
  colour, in slot order; `maxStack = single_flag > 0 || stack_max <= 0 ? 1 : stack_max`.
- Buy: amount 1..99999; price slot gold/money, else template gold/price; `gt = 1` -> unbound currency, else selected type
  (default Bạc khóa / Vàng khóa); bound = paid with a bind currency; colour = ceil(quality/5) (equip: template color_code);
  equipment durability = endure_max. Order: capacity check -> charge -> add (refund on failure). H5 hardening: the slot's
  shop must belong to an NPC on `session.mapId`.
- Sell: whole stack, `floor(price/4)` per unit, bound -> moneyBind else money; item deleted before money is credited.
- Refused: special currency (`p_type1`) and point slots ("chưa hỗ trợ loại tiền này").

## UI
- Bag opens beside the shop (`.shop-panel.with-bag` shifts left, `.bag-panel.beside-shop`) when `onOpenShop` arrives; B / HUD
  button toggles it. Ctrl + double-click a bag slot sells only while the shop panel is open.
- `BagController` must be created after `QuestController` (its `onUPP` handler updates `player` first).

## Bag operations (M1, 2026-11-04, plan `2026-11-04_02_CHARACTER_CORE.md`)
- `getInitSlot` returns bag **and** equipped items (slotType 1, sid = position 1..22); the bag grid filters equipped ones out.
  `BagItem` gained `position`, `reqLevel`.
- RPCs (`inventory/bag-ops.rpc.ts` + `bag-ops.service.ts`, pure `bag-rules.ts` planMove/planSplit/planSort), none quiet:
  - `moveItem(fromSid, toSid)`, open-page bag sids only:
    - empty target: move, `onMoveItem`;
    - same template + bound + colour within the max stack: merge, `onAddCharactorSlot` + `onStackItemInto(from, to, srcId, destId, n)`;
    - otherwise: swap, `onSwapItem`.
    - Templates with `stack_max <= 1` swap instead of failing.
  - `moveItemNum(from, to, n)`, with `1 <= n < stack`: new row (keeps bound and colour) or merge. Pushes `onAddCharactorSlot`, then `onMoveItemNum(from, srcId, left)`.
  - `dropItem(itemId[, pass])`: bag items only; the password is ignored. Pushes `onDelCharactorSlot`.
  - `bagSort()`: sorts by (tid, itemType, unbound first, colour), merges, repacks from 0 (offset indexes because of the unique index).
    Pushes `onDelCharactorSlot` per merged-away row, then `onItemSort([{oldId: oldSid, newId: newSid, stackNum}])`.
- Client (`bagPanel.ts`, `BagController.ts`, `game/bagActions.ts`):
  - drag moves, Shift-drop splits (amount dialog, max stack−1);
  - double-click sends `useItem` (equip or drink);
  - toolbar Sắp xếp (confirm, 3 s throttle) and Vứt bỏ mode (confirm "Xác nhận hủy vật phẩm này?").
- Equip, potions, buffs: `character-stats.md`.

## Bag window look (2026-11-04)
- Rebuilt to match the legacy Flex BagPanel. The decompile of `compDragable/BagPanel.as` was aborted, so the layout comes
  from an original screenshot plus the `BAGPANEL_U` / `BAGPANEL_S` strings. 270 px wide, ~523 px tall, `top: 28px` so it
  fits the 570 px stage.
- Frame, title bar and orb, close button, tabs, slot boxes, slots, scrollbar and checkboxes are drawn in CSS (`bag.css`),
  copying the colours of the legacy Common_Components skins. Only icons are images: 17 swfui PNGs in
  `client/public/ui/Panels_BagPanel/` (the 6 tool buttons up/over, plus the currency icons SilverBinded, GoldBinded,
  11533 = silver ingot and 1663 = gold ingot). `1` and `1511` are generated but unused; they share the symbol name `1`,
  and their file names come from the id suffix. Regenerate (the MainStage_* set stays identical):
  `pnpm --filter @mc/swf-tools swfui -out ../../client/public/ui -xor 1,2,0 -match '_embed_css__style_MainStage_|Panels_BagPanel_swf_+(button_(use|Discarded|Resolution|repair|rpeair|Lock|sorting)_(up|over)_mc2|SilverBinded|GoldBinded|1)_' D:/mcgame/frontend/s/6a41a5ba5c0006ab4e0c1321a2b05027`
  (that file is the XOR-wrapped main client; there is no `.orig` copy under D:).
- Layout, top to bottom:
  - title and close button;
  - tabs 1 2 3 4 5 < > N.vụ Pet;
  - 6 x 5 grid plus a scrollbar (the thumb fills the track because there is one page);
  - 10 "P..." pet tabs and a 6 x 3 pet grid (`ui/bagPets.ts`, 2026-11-07): the player's pets from `petList` by id, 18 per
    page, tabs past `petMaxNum` disabled; cell = icon + level + state badge (C xuất chiến, T đi theo); hover = `ui/petTip.ts`, a port of Flash
    TipCre (259 x 328: 12 upgrade stars, Cấp / T.thành (loyalty `close`, H5 sends PET_MAX_LOYALTY 100) / Thọ / Điểm / N.tố,
    qLevel + class line, catchable line (`PetView.catchable`), Điểm = final attributes, Tư chất = round((apt + Ex + Evolution) x
    (growRate + growRateAdd + upgrade bonus 9:.1 10:.3 11:.35 12:.4)), stand frame of the model drawn on a canvas from the cached
    sheet atlas, P.Chất, SVG pentagon raw vs final (max 10000), skill tab 1 = skill1..5). Skin art (frames, star icons) is CSS. Redrawn by `BagController.petsChanged()` from `PetController.refreshAll`. No click / drag actions yet;
  - tool icons Sử dụng / Vứt bỏ / Tách rời / Sửa chữa / Khóa / Sắp xếp;
  - 2 x 2 currency fields (Ngân phiếu = moneyBind, Kim phiếu = goldBind, Bạc = money, Vàng = gold) with payment checkboxes.
- Working: page 1 and Sắp xếp. Sử dụng, Vứt bỏ and Tách rời are modes: click the tool, then click an item. Tách rời splits
  into the first free slot through the amount dialog.
- Disabled or display-only: pages 2–5, < >, N.vụ, Pet, Sửa chữa, Khóa and the
  checkboxes. The checkboxes show the server defaults Ngân phiếu / Kim phiếu; ChangeMoneyType is not ported.
- Art quirks: Sửa chữa is `button_repair_up` / `button_rpeair_over` (legacy typo). Sắp xếp only has an over state, which is
  also used for up.

## Deferred
Repair buttons, payment radios / ChangeMoneyType, extra pages, quest/pet/temp bags, bank, stock limits, quest "item in bag"
requirements, equipment random properties. If `addMoney` fails after a
sale delete the item is lost (no transaction); acceptable for now. Quiet the RPCs only after the user confirms.

## M5 (2026-11-04)
Bank, bag pages, repair, payment radios and the mall are in `economy.md`; crafting and upgrades in `forge.md`.

## Item hover tooltip (2026-11-04)
- `ui/itemTip.ts` + `itemTip.css`: one floating `.item-tip` box in #stage, shown on pointerenter of a filled slot (beside the
  cell, flipped left at the stage edge), hidden on leave / pointerdown / drag / keydown or when the cell leaves the DOM.
  Layout follows Flash `TipItem.as`: 32 px icon + name in `NAME_COLORS[color]` (quality), bind line green #3CFF00
  ("Đã khóa"/"Chưa khóa", TIPITEM_S[22/23]), description #FFEFBB, `Loại: <ITEM_TYPE_NAME[tplType]>` for items
  (`ui/itemTypeNames.ts`, generated from GamePredef/Language; unknown → "Khác"), stat lines, "Giá bán ra" or grey
  "Không thể bán" (TIPITEM_S[25]).
- `fillItemCell(cell, item, { level, equipped?, hint? }, from)` attaches it (bag, bank, character, trade, chaInfo).
  `itemTooltip()` stays as the plain-text version for chat item links.
- Equipment has no "Loại" line yet: the bag DTO sends `tplType = 0` for equipment (page gate relies on it).

## Temp bags and bank extras (M11 phase C)
`InventoryService.list` (getInitSlot) excludes slot types TEMP_BAG (3) and ESCROW (90): the Túi Tiện Dụng has its own payload (`tBag`) and its slot indexes would collide with bag sids. New RPCs on the bag side: `bankSort`, `bagToBank(sid, dir)`, `delBagItems(ids[, md5])` (Vứt bỏ multi-select: the tool click toggles picks, the next click on the tool confirms and deletes; owned bag / quest / pet-page rows only, one note "Đã xóa N vật phẩm."). `slot-writes.ts` gained `mergeInto` (delete the source, raise the target, restore on failure) and `applySortPlan` (shared by bagSort and bankSort). See `temp-bag.md`.

## Escrow (M11 phase A)
Rows parked by a mail / auction live at `characterId 0`, `slotType 90` (`SlotType.ESCROW`), `slotIndex = itemId`, with `escrowRef` (`mail:<id>`); every bag query filters by `characterId`, so they never show in a bag. See `memory/mail.md`.

## Item use extensions (item use D, 2026-11-07)
`UseItemService.usePet` (useItem targetType 2): blood bags and type 507 as before, every other item needs use_type 2 / 3 (else "Vật phẩm này pet không dùng được!") and goes through `addPetHandler` handlers (item-use module). `consumeCtx()` builds the shared `ItemConsumeCtx`. `BagItem` has `useType` / `reqClass` (items only) for the client gate. `useMultiItem` lives in the item-use module (`multi-use.*`). The inventory module still never imports item-use.
