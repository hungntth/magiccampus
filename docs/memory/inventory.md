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

## Deferred
Repair buttons, payment radios / ChangeMoneyType, extra pages, quest/pet/temp bags, bank, item use / drop / split / sort /
drag, equipping, stock limits, quest "item in bag" requirements, equipment random properties. If `addMoney` fails after a
sale delete the item is lost (no transaction); acceptable for now. Quiet the RPCs only after the user confirms.
