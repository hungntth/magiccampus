# Bag (Túi đồ) + NPC Shop Buy / Sell — Implementation Plan

**Date**: 2026-11-03 · **Status**: Approved
**Goal**: the player has a persistent 30-slot bag shown in a "Túi đồ" panel (HUD bag button / B key, auto-opened next
to a shop). In an NPC shop, "Mua" (or double-click) asks for an amount and buys the selected slot with silver
(Bạc khóa by default, Bạc for `gt = 1` slots) or gold; the item lands in the bag (stacking like legacy). Ctrl +
double-click on a bag item while a shop is open sells it for `price / 4` per unit. Today the shop is view-only
(`docs/plans/2026-11-03_04_NPC_SHOP_VIEW.md`) and there is no inventory at all.

Research base (legacy repo `E:\mcgame`, paths under `internal/` unless noted):
- `E:\mcgame\docs\memory\item-inventory.md`, `shop-system.md`, `h5-client.md` (bag/shop sections).
- Storage: `supabase/migrations/20260328184527_baseline_mcgame_schema.sql:2180` (`player.character_items`),
  `domain/item/item.go:20-37, 183-322` (item/slot types, DTO, sid), `domain/character/character.go:108, 490-493`.
- Login: `presentation/rtmp/handlers/item/equip.go:40-86` (`getInitSlot`).
- Buy: `presentation/rtmp/handlers/shop/purchase.go:15-76`, `application/shop/service.go:90-305`,
  `purchase_guard.go:9-21`, `resolve.go:13-45`, `application/item/service.go:1664-1820` (stacking),
  `application/item/reward_capacity.go:31`; Flash `ShopPanel.as:845-883, 1268`, `NumPanel.as:256-322, 400-403`.
- Sell: `handlers/shop/purchase.go:109-130`, `application/shop/sell.go:19-77`; Flash `ShopPanel.as:592, 762-800`.

## 1. Confirmed mechanics

- **Storage** (legacy `character_items`): id, character id, template id, `item_type` (1 consumable/item, 2 equipment),
  `slot_type` (0 bag; 1 equipped, 2 bank, 3 temp, 4 quest bag, 5 pet bag — not used here), `slot_index`,
  `stack_count`, `is_bound`, `durability`, `max_durability`, `color_code`. Unique (char, slot_type, slot_index).
- **Capacity**: 30 slots per page, a new character has 1 page (`BagSlotNum = 1`) → 30. Free slot = lowest unused
  `slot_index` in [0, 30).
- **sid** shown to the client: bag `2101 + slotIndex`.
- **Login**: RPC `getInitSlot()` returns `{ "<itemId>": dto }`.
- **DTO** (`item.go:183-260`): `id`, `sid`, `tid` (template id), `type` 28 item / 18 equipment (instance tables;
  template tables are 29 / 19), `itemType` 1/2, `stackNum`, `binded`, `slotType`, `slotIndex`, `color`,
  `durability`, `maxDurability`.
- **Pushes**: `onAddCharactorSlot(dto)` once per changed slot (a top-up re-sends the full dto),
  `onDelCharactorSlot(itemId, sid)`, `onAddItem({i, q, t, n, …})` "got item" notice, `onUPP({key: total})`,
  `onAddMoney(charId, key, delta, total)` (sell only), `onBlueMsg(text)`, `onRedMsg(text)`.
- **Buy** RPC `buyAmountItemClient(shopSlotId, amount)` (Flash NumPanel, the one ShopPanel uses):
  - amount integer 1..99999 else "số lượng không hợp lệ"; slot must exist and `st != 5`.
  - template: slot `type` 19 → equip template (itemType 2), else item template (itemType 1).
  - price: slot `gold`/`money`; both 0 → template `gold` / `price`. `gold > 0` → currency `gt == 1` ? gold (4) :
    selected gold type (default goldBind 3); else `money > 0` → `gt == 1` ? money (2) : selected money type
    (default **moneyBind 1**); else "item has no price defined". `p_type1 > 0` special currency → out of scope.
  - cost = unit × amount; insufficient → "Không đủ bạc" / "Không đủ vàng". Keys: 1 moneyBind, 2 money,
    3 goldBind, 4 gold. Names "Bạc khóa", "Bạc", "Vàng khóa", "Vàng".
  - bound = paid with moneyBind or goldBind. colour = `ceil(slot.quality / 5)` (equipment: template `color_code`
    when the slot gives 0).
  - stacking: `maxStack = single_flag > 0 || stack_max <= 0 ? 1 : stack_max`. Fill existing bag stacks with same
    template + itemType, same bound, same colour, in slot order; remainder → new slots of `min(rest, maxStack)` at the
    lowest free index. Equipment: `durability = maxDurability = endure_max`.
  - capacity is checked **before** charging (free slots ≥ `ceil(rest after top-ups / maxStack)`), else
    "inventory full" and nothing is charged.
  - success pushes: `onBlueMsg "Mua thành công x{amount}! Mất {cost} {currencyName}."`, `onUPP({key: total})`,
    `onAddItem`, `onAddCharactorSlot` per changed slot. Flash `onShopItemBuy(n)` stores the result as the slot's
    remaining stock (−1 = unlimited).
  - Legacy failure = `onRedMsg "Mua thất bại: <msg>"` + no reply value.
- **Sell** RPC `sellItem(itemId)` (2nd md5 arg ignored): item must belong to the character and be in the bag;
  unit = `floor(template.price / 4)` (equip template for itemType 2), ≤ 0 → "vật phẩm này không thể bán"; the whole
  stack is sold; bound → moneyBind else money. Pushes `onDelCharactorSlot(itemId, sid)`,
  `onAddMoney(charId, key, +gain, total)`, `onUPP({key: total})`,
  `onBlueMsg "Bán {name} x{count}, nhận {gain} {Bạc|Bạc khóa}."`; returns `true`. Failure
  `onRedMsg "Bán thất bại: <msg>"`, returns `false`.
- Legacy has **no** distance/shop-ownership check on buy (trusts the client).

## 2. Shared contract (`packages/shared/src/protocol.ts`, or a new `inventory.ts` re-exported from `index.ts`)

```ts
export const ItemKind = { ITEM: 1, EQUIP: 2 } as const;          // legacy item_type
export const SlotType = { BAG: 0 } as const;                     // other slot types not ported
export const BAG_SID_BASE = 2101;
export const BAG_PAGE_SLOTS = 30;

/** Bag slot as sent by getInitSlot / onAddCharactorSlot (legacy item DTO subset). */
export interface BagItem {
  id: number;          // instance id (counters 'items')
  sid: number;         // BAG_SID_BASE + slotIndex
  slotType: number;
  slotIndex: number;
  tid: number;         // template id
  type: number;        // 28 item / 18 equipment (instance table ids)
  itemType: number;    // ItemKind
  stackNum: number;
  binded: boolean;
  color: number;       // palette index (same NAME_COLORS as the shop)
  durability: number;  // 0 for items
  maxDurability: number;
  name: string;        // H5 extension: resolved template name
  iconCode: string;    // H5 extension: template icon_code
  info: string;        // H5 extension: tooltip text
  sellPrice: number;   // H5 extension: floor(price / 4) per unit, 0 = cannot sell
}

export type GetInitSlotReply = Record<string, BagItem>;

/** onAddItem "got item" notice (legacy keys). */
export interface AddItemNotice { i: number; q: number; t: number; n: string }

// ShopSlotView gains: stackMax: number (NumPanel max, template stack_max / single_flag rule)
// RPCs: buyAmountItemClient(shopSlotId, amount) -> number (remaining stock, -1 = unlimited)
//       sellItem(itemId) -> boolean
// Pushes: onAddCharactorSlot(BagItem) · onDelCharactorSlot(itemId, sid) · onAddItem(AddItemNotice)
//         onUPP(PlayerUpdate) · onAddMoney(charId, MoneyKey, delta, total) · onBlueMsg(text) · onRedMsg(text)
```

`PlayerUpdate` already covers `money`, `moneyBind`, `gold`; add `goldBind` to `PlayerData`/`PlayerUpdate` only if
the character schema gets the field (see 3.1).

## 3. Design

### 3.1 State
- New Mongoose schema `CharacterItem` (`server/src/modules/inventory/character-item.schema.ts`), collection
  `character_items`: `_id` number (counter `items`), `characterId`, `templateId`, `itemType`, `slotType` (0),
  `slotIndex`, `stackCount` (default 1), `isBound` (false), `colorCode` (0), `durability` (0), `maxDurability` (0),
  timestamps. Unique index `{characterId, slotType, slotIndex}`; index `{characterId}`.
- Character schema: add `goldBind` (default 0) **and** `selectedMoneyType` (default 1) / `selectedGoldType`
  (default 3). No UI to change them yet (payment radios are a non-goal), so buys use Bạc khóa / Vàng khóa unless
  `gt = 1`. Existing documents get the defaults on read — no migration script.
- Writes: buy = charge character with a conditional `$inc` (`{ _id, [key]: { $gte: cost } }`, fails → "Không đủ …")
  then insert/update items; if an item write fails, refund with `$inc` and rethrow. Sell = delete the item
  (`deleteOne({ _id, characterId, slotType: 0 })`, 0 deleted → fail) then `$inc` money. This keeps double-clicks
  from double-spending without transactions (Mongo in docker is standalone).

### 3.2 Static data
- `GameDataService`: `getShopSlot(id)` (index by id next to `shopSlotsBySid`), `itemTemplate(id)` /
  `equipTemplate(id)` (on-demand `findOne`, or reuse `templatesByIds`). Template fields used: `name`, `icon_code`,
  `color`, `color_code`, `info`, `description`, `price`, `gold`, `stack_max`, `single_flag`, `endure_max`.
- `ShopSlotView.stackMax` filled in `toShopSlotView` (needs `stack_max`, `single_flag` in the projection).

### 3.3 Server
- New `server/src/modules/inventory/`:
  - `bag-rules.ts` (pure, unit-tested): `maxStack(tpl)`, `planAdd(bag, {templateId, itemType, bound, color, amount,
    maxStack}, capacity)` → `{ topUps: [{id, add}], newStacks: [{slotIndex, count}] } | null` (null = no room),
    `sidOf(slotIndex)`, `sellUnit(tpl)`.
  - `inventory.service.ts`: `list(charId)`, `toBagItem(doc, tpl)`, `add(charId, …)` (applies `planAdd`, returns
    changed `BagItem`s), `removeForSell(charId, itemId)`.
  - `inventory.rpc.ts`: `@Rpc('getInitSlot', { requireCharacter: true })` → `GetInitSlotReply`.
  - `inventory.module.ts` (exports `InventoryService`), registered in `app.module.ts`.
- `server/src/modules/shop/`:
  - `shop-buy.ts` (pure, unit-tested): `resolvePrice(slot, tpl, selectedMoney, selectedGold)` →
    `{ key: MoneyKey, unit, currencyName, bound } | error message`.
  - `shop.rpc.ts`: `@Rpc('buyAmountItemClient', { requireCharacter: true })` and
    `@Rpc('sellItem', { requireCharacter: true })`, not quiet. H5 hardening on buy: the slot's `sid` must be the
    `shop_id` of an NPC on `session.mapId` (else "Mua thất bại: …"). Validation of args with `Number(...)` +
    `Number.isInteger`.
  - Errors: push `onRedMsg("Mua thất bại: <msg>")` / `onRedMsg("Bán thất bại: <msg>")` **and** throw
    `RpcException` (`invalidArgs` / `forbidden` with the same message) so the awaiting client gets a rejection
    (CLAUDE.md: never a silent return). Success: buy returns the slot `amount` (−1); sell returns `true`.
  - Push order exactly as §1.
- `ShopModule` imports `InventoryModule` and the character model (or a narrow `CharacterService` method for the
  conditional `$inc` — prefer adding `spendMoney(charId, key, cost)` / `addMoney(charId, key, n)` to
  `CharacterService` returning the new total).

### 3.4 Client
- `client/src/game/BagController.ts` (like `QuestController`): owns the bag map (`id → BagItem`), loads
  `getInitSlot` on scene enter, handles `onAddCharactorSlot`, `onDelCharactorSlot`, `onAddItem` (chat system line
  "Nhận được {n} x{q}"), `onBlueMsg` (toast), `onRedMsg` (toast danger), and re-renders money after
  `playerChanged` / `onUPP` (QuestController already applies `onUPP` to `host.player`; just re-render).
- `client/src/ui/bagPanel.ts` + `bag.css`: "Túi đồ" window, same visual language as shop/NPC dialog, ~278 px wide:
  6 × 5 grid of 34 px slots (icon, stack number bottom-right when > 1, lock mark when bound, tooltip name / info /
  "Đã khóa" / "Giá bán ra: N"), money rows: Bạc khóa (moneyBind), Bạc (money), Vàng (gold) with CSS coins, close ×.
  Toggled by the HUD bag button and the B key (`systemBar.ts` already declares `key: 'b'`); opened automatically
  next to the shop (shop left, bag right) when `onOpenShop` arrives.
- Selling: Ctrl + double-click a bag slot while the shop panel is open → `sellItem(id)` (no confirm, per
  `SHOPPANEL_S[5]`). Without a shop open, Ctrl + double-click does nothing.
- Buying (`shopPanel.ts`): "Mua" / double-click a cell → small amount dialog (NumPanel): number input 1..stackMax
  (default 1), shows unit price × amount, "Đồng ý" / "Hủy" → `buyAmountItemClient(slotId, amount)`; errors → toast.
  Buttons Sửa / Sửa hết / Sửa hết (pet) stay placeholders.
- `GameScene.ts` (already > 300 lines): only construct `BagController`, pass it the shop open/close events; all bag
  logic stays in `BagController`.

### 3.5 Touch points

| File | Change |
|---|---|
| `packages/shared/src/protocol.ts` (or `inventory.ts` + `index.ts`) | `ItemKind`, `SlotType`, `BAG_*`, `BagItem`, `GetInitSlotReply`, `AddItemNotice`; `ShopSlotView.stackMax`; `goldBind` in `PlayerData`/`PlayerUpdate` |
| `server/src/modules/character/character.schema.ts`, `character.service.ts` | `goldBind`, `selectedMoneyType`, `selectedGoldType`; `spendMoney` / `addMoney` |
| `server/src/modules/inventory/*` | new module: schema, bag-rules (+test), service, rpc |
| `server/src/modules/shop/shop-buy.ts` (+test), `shop.rpc.ts`, `shop.module.ts`, `shop-mapping.ts` | buy/sell, `stackMax` |
| `server/src/modules/gamedata/gamedata.service.ts` | `getShopSlot`, template lookups |
| `server/src/app.module.ts` | `InventoryModule` |
| `client/src/game/BagController.ts`, `client/src/ui/bagPanel.ts`, `client/src/ui/bag.css` | new |
| `client/src/ui/shopPanel.ts`, `shop.css` | amount dialog + buy call |
| `client/src/ui/hud/systemBar.ts` (or wherever the bag button handler lives) | open bag |
| `client/src/game/GameScene.ts` | wire `BagController` |
| `docs/memory/inventory.md` (new + index line), `docs/memory/shop.md` | record |

## 4. Non-goals

- Repair (`repair`, `repairAll`, `repairPetEquAll`): needs equipped items + durability loss; buttons stay toasts.
- Payment radios / `ChangeMoneyType`, wallet lock / second password, extra bag pages, quest/pet/temp bags, bank,
  item use / drop / split / sort / drag & drop, equipping. Bag UI shows one page only.
- Special-currency (`p_type1/2`) and point (`point`) slots: buy refuses with "Mua thất bại: chưa hỗ trợ loại tiền này".
- Stock limits (`amount` ≥ 0): every NPC shop row in the seed is −1; buy returns −1.
- Quest "item in bag" requirements (`quest.rules.ts` kind-1 pre rows) still block — wiring them to the bag is a
  separate change.
- Equipment random properties / prefix rolls (`populateEquipmentProperties`).

## 5. Verification

1. Unit tests: `bag-rules.test.ts` (stack_max 99999 tops up one stack; single_flag → one slot per unit; different
   bound/colour → new slot; full bag → null; lowest free index reused); `shop-buy.test.ts` (money gt 0 →
   moneyBind + bound; gt 1 → money + unbound; gold gt 0 → goldBind; zero slot price → template price; special
   currency refused); sell unit `floor(price/4)`.
2. `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test` — all green.
3. Smoke (server restarted): character with Bạc khóa (e.g. "Phương Nguyên", moneyBind 750 after quests) at map 15
   NPC 41 → shop opens with the bag beside it → buy 1 item of 50.000 fails "Không đủ bạc"; map 1 NPC 233 "Tiệm Thuốc Ông Vương" (shop 2)
   → buy 5 "Thuốc Viên Bổ Máu" → bag shows one slot ×5, Bạc khóa −200, chat "Nhận được …";
   buy 5 more → same slot ×10. Ctrl + double-click it → sold for `floor(40/4) × 10 = 100` Bạc khóa, slot gone.
   Relog → bag persists. Server log shows `getInitSlot`, `buyAmountItemClient`, `sellItem`.
4. Docs: `docs/memory/inventory.md` + index line; update `docs/memory/shop.md`.
