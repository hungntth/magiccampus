# NPC Shop (view only) — Implementation Plan

**Date**: 2026-11-03 · **Status**: Approved
**Goal**: clicking a shop NPC (or the "Shop" button in its Đối thoại dialog) opens the legacy "Shop" window with
the real slot list: icon, coloured name, price + currency icon, 12 (or 9) slots per page with "< 1 / N >" paging,
the Ctrl-sell hint and the Mua / Sửa / Sửa hết / Sửa hết (pet) buttons. Today the Shop button only toasts
"Tính năng đang phát triển". There is no bag, wallet or buying yet: all action buttons stay placeholders.

Research base (legacy repo is at `E:\mcgame`):
- `E:\mcgame\docs\memory\shop-system.md` — `onOpenShop` (TBL_SHOP/TBL_SHOP_SLOT) vs `openShopById` (TBL_CREDIT) routing.
- Go `internal/presentation/rtmp/handlers/npc/npc_click.go:26-69, 802-812`, `npc_interaction.go:72-182`,
  `npc/shop_routing.go:8-16` — when the shop opens and the push args.
- Go `internal/application/shop/service.go:122-177` — slot type → template table, price/currency priority.
- Flash `docs/client/view/view/compDragable/ShopPanel.as`, `view/view/comp/ShopSlot.as`,
  `view/view/compDragable/NpcFuncPanel.as:436-476`, `config/Language.as` (SHOPPANEL_S / SHOPPANEL_U).
- Seed check (Mongo): `data_tbl_shop` 121 rows (`type` 1 = 83, 2 = 38), `data_tbl_shop_slot` 2544 rows, slot `type`
  only 19 and 29; NPC 280 "Tiệm Pet Tôn Lệ" → `shop_id` 43 (map 9), NPC 41 "Thương Nhân Đạo Cụ" → shop 5 (map 15).

## 1. Confirmed mechanics

- **Opening (Go + Flash)**: `clickNpc(npcId)`: if `data_tbl_npc.shop_id > 0` and the NPC has **no quest rows**, the
  server pushes `onOpenShop` and **no** `npcFuncInit`. If it has quests, `npcFuncInit` is sent with `npcType` forced to
  Shop (2), and the dialog's function button sends `npcFuncClick(npcId)` (Flash `NpcFuncPanel.as:436-476`, 1100 ms
  throttle), which pushes `onOpenShop` when `shop_id > 0` (Go `npc_click.go:61-68`). No distance check in Go.
- Legacy `onOpenShop` carries only `shopId`; the Flash client reads its own TBL_SHOP / TBL_SHOP_SLOT. The H5 client has
  no static tables, so **our payload carries the resolved slot list** (payload is ours to shape; name kept).
- Slots: `data_tbl_shop_slot` where `sid = shopId`, sorted by `position` (numeric) then `id`. Flash ShopPanel does
  not filter `st`; H5 hides `st` 5 and -1 (hidden / removed mall rows).
- Page size: `data_tbl_shop.type == 1` → 12 per page (3 × 4, cell 120 × 41); otherwise 9 (3 × 3, cell 60 high,
  two price lines). Panel 460 × 310 (`ShopPanel.as:73-74, 430-436`).
- Template: slot `type` 19 → `data_tbl_equipt_template`, anything else → `data_tbl_item_template`, by `item_id`
  (checked: shop 43 item ids 1724/1154/1533 exist in the item table). Missing template → name `#<itemId>`, no icon.
- Name colour (`ShopSlot.as:772-782`): index `c = ceil(slot.quality / 5)`, replaced by `template.color` when
  `template.color >= 0`; palette (`GamePredef.as:757`) `[#FFFFFF, #00FF00, #0066FF, #FF33FF, #FA5B05, #FF0000,
  #33CCAA, #33CCAA, #FFAE17]` (indices 0..8; clamp out-of-range to 0).
- Price, shop type 1 (`ShopSlot.as:598-646`), first match wins:
  `gold > 0` → (`gt == 1` ? gold : goldAll, gold); `money > 0` → (`gt == 1` ? money : moneyAll, money);
  `point > 0` → exPoint; else template fallback: `gold > 0` → goldAll, `honor > 0` → honor, `price > 0` → moneyAll.
- Price, shop type 2 (`ShopSlot.as:353-597`): line 1 = `p_type1` / `p_num1`, line 2 = `p_type2` / `p_num2` when
  `p_type2 > 0 && p_num2 >= 0`; currency ids are `GamePredef.CURRENCY_*` codes (names not resolved yet → Non-goals).
  If `p_type1 <= 0` fall back to the type-1 rule.
- `amount` −1 = unlimited; `sale`, `r` are not read by ShopPanel/ShopSlot.
- Strings: title `SHOPPANEL_U[3]` "Shop"; hint `SHOPPANEL_S[4]` "Giữ Ctrl rồi nhấp đôi vào vật phẩm để bán trực tiếp"
  with tooltip `SHOPPANEL_S[5]` "Giữ Ctrl rồi nhấp đôi vào vật phẩm trong túi đồ là có thể bán trực tiếp không cần xác
  nhận."; buttons "Mua", "Sửa" (tip "Sửa chữa(người/pet)"), "Sửa hết" (tip "Sửa chữa toàn bộ (người)"),
  "Sửa hết (pet)" (tip "Sửa chữa toàn bộ(pet)").
- Legacy action RPCs (NOT implemented here): `buyAmountItemClient` / `buyItemClient(slotId, amount)`, `sellItem`,
  `repair`, `repairAll(2)`, `repairPetEquAll(petId, 1)`, `shopClosePanel()`.

## 2. Shared contract (`packages/shared/src/protocol.ts`)

```ts
/** Currency a shop price is paid in (legacy Currency.TYPE_*; 'special' = GamePredef.CURRENCY_* id in `pType`). */
export const ShopCurrency = {
  MONEY: 'money',        // bạc only (gt = 1)
  MONEY_ALL: 'moneyAll', // bạc or bạc khóa
  GOLD: 'gold',          // vàng only (gt = 1)
  GOLD_ALL: 'goldAll',   // vàng or kim phiếu
  EX_POINT: 'exPoint',
  HONOR: 'honor',
  SPECIAL: 'special',
} as const;
export type ShopCurrencyKind = (typeof ShopCurrency)[keyof typeof ShopCurrency];

export interface ShopPrice {
  currency: ShopCurrencyKind;
  cost: number;
  pType?: number; // only for 'special'
}

export interface ShopSlotView {
  slotId: number;    // data_tbl_shop_slot.id (future buy arg)
  type: number;      // 19 equip / 29 item
  itemId: number;
  name: string;
  iconCode: string;  // template icon_code, '0' if none
  color: number;     // palette index 0..8
  info: string;      // template info / description for the tooltip ('' if none)
  amount: number;    // -1 unlimited
  st: number;        // 1 Hot, 2 Sale, 3 Limit, 4 New, else none
  prices: ShopPrice[]; // 0..2 entries
}

/** Push `onOpenShop` (to the caller). */
export interface OpenShop {
  shopId: number;
  npcId: number;     // -1 when not opened from an NPC
  shopType: number;  // data_tbl_shop.type: 1 = 12 per page, else 9
  slots: ShopSlotView[];
}
```

## 3. Design

### 3.1 State
None persisted. The client keeps the open panel + its `npcId` in memory.

### 3.2 Static data (`GameDataService`)
- Cache at `reload()`: `shopsById` (`data_tbl_shop`) and `shopSlotsBySid` (`data_tbl_shop_slot`, grouped by `sid`,
  already sorted by position, id). Accessors `getShop(id)`, `shopSlots(sid)`.
- `templatesByIds(type: number, ids: number[]): Promise<Map<number, Row>>` — one `$in` query on the table chosen
  by `type` (19 → equip, else item), projection `name, icon_code, color, info, description, gold, honor, price`.
  Reuse the same table selection in `templateName` (note it currently returns `#id` for types other than 19/29;
  keep that behaviour there).

### 3.3 Server
- New `server/src/modules/shop/`:
  - `shop-mapping.ts` — pure: `slotColor(quality, tplColor)`, `slotPrices(slot, tpl, shopType)`,
    `toShopSlotView(slot, tpl)`, `isVisibleSlot(st)`; constants with legacy citations. `shop-mapping.test.ts`.
  - `shop.service.ts` — `buildOpenShop(shopId, npcId): Promise<OpenShop | null>` (null if the shop row is unknown).
  - `shop.module.ts` exports `ShopService`; imported by `NpcModule`; registered in `app.module.ts` if needed.
- `npc.rpc.ts`:
  - `clickNpc`: after the existing checks, `shopId = Number(npc.shop_id ?? 0)`. If `shopId > 0` and the quest list
    is empty → push `onOpenShop` (from `buildOpenShop`) and return null; otherwise push `npcFuncInit` as today.
  - New `@Rpc('npcFuncClick', { requireCharacter: true })` (not quiet): same npcId validation and map check as
    `clickNpc`; `shop_id > 0` → push `onOpenShop`, return null; else `RpcException.notFound('shop')`.
  - If `buildOpenShop` returns null → `RpcException.notFound('shop')`.
- `npc.service.ts` `buildFuncInit`: `npcType` = `NpcType.SHOP` when `shop_id > 0` (Go `npc_interaction.go:171-173`),
  else the current rule.

### 3.4 Client
- `client/src/ui/shopPanel.ts` (+ `client/src/ui/shop.css`, imported from the TS file like `hud.css`): `ShopPanel`
  with `show(data: OpenShop)`, `close()`, `get npcId()`. DOM in `stageEl()`, same visual language as `.npc-dialog`
  (navy gradient, gold frame, banner title "Shop", red round close "×" at the top right). Layout from the screenshot:
  - grid 3 columns; per page 12 (`shopType === 1`) or 9; each cell = framed 36 px icon slot (`iconUrl(iconCode)`,
    hide on error) + name (palette colour, ellipsis) + price lines (coin + number, `toLocaleString('vi-VN')`).
  - coin icons are pure CSS: silver coin for money/moneyAll, gold coin for gold/goldAll, small text badge for
    exPoint ("Đ"), honor ("V"), special ("#pType"); `title` names the currency (Bạc, Bạc/Bạc khóa, Vàng,
    Vàng/Kim phiếu, Điểm, Vinh dự, Tiền đặc biệt).
  - `st` badge 1..4 → small corner label Hot / Sale / Limit / New.
  - click selects a cell (highlight); `title` tooltip = name + info.
  - pager: "<" button, "page / pages" box, ">" button (disabled at the ends).
  - footer: hint text (with tooltip) + buttons Mua / Sửa / Sửa hết / Sửa hết (pet) with the tooltips above; all
    → `toast('Tính năng đang phát triển')`; double-click on a cell = Mua.
  - Empty slot list → still opens with an empty grid, "1 / 1".
- `NpcDialog.show(...)`: add an `onFunc: (npcType: number) => void` callback; the function button calls it.
- `GameScene.ts`: `client.on('onOpenShop', d => …)` closes the NPC dialog and quest panel and shows the shop;
  `onFunc` for `NpcType.SHOP` → `client.call('npcFuncClick', npcId)` (errors → toast), other types keep the
  placeholder toast. Close the shop on scene change/destroy and with the same > 300 px distance rule as the NPC
  dialog (`NPC_DIALOG_CLOSE_DIST`). `GameScene.ts` is already ~324 lines: keep the delta small (one handler + the
  shared proximity check); do not refactor unrelated code.

### 3.5 Touch points

| File | Change |
|---|---|
| `packages/shared/src/protocol.ts` | add `ShopCurrency`, `ShopCurrencyKind`, `ShopPrice`, `ShopSlotView`, `OpenShop` |
| `server/src/modules/gamedata/gamedata.service.ts` | cache shops + slots by sid; `getShop`, `shopSlots`, `templatesByIds` |
| `server/src/modules/shop/{shop-mapping,shop-mapping.test,shop.service,shop.module}.ts` | new |
| `server/src/modules/npc/npc.module.ts` | import `ShopModule` |
| `server/src/modules/npc/npc.rpc.ts` | direct shop on `clickNpc`; new `npcFuncClick` |
| `server/src/modules/npc/npc.service.ts` (+ test) | force `npcType` SHOP when `shop_id > 0` |
| `client/src/ui/shopPanel.ts`, `client/src/ui/shop.css` | new panel |
| `client/src/ui/npcDialog.ts` | `onFunc` callback |
| `client/src/game/GameScene.ts` | `onOpenShop` handler, `npcFuncClick`, close rules |
| `docs/memory/shop.md` (+ index line), `docs/memory/npc-dialog.md` | record |

## 4. Non-goals

- Buying, selling, repairing, stock counts, bag auto-open, `shopClosePanel`: no bag/wallet exists yet; buttons toast.
- `openShopById` / TBL_CREDIT point shops, guild shop (83) membership gate, mall (`SystemShopPanel`): separate systems.
- Names/icons of special currencies (`CURRENCY_*` ids): shown as "#id" until a currency table is ported.
- Rich TipItem/TipEquip tooltips: native `title` with name + info is enough for viewing.
- Original-material `[postfix]` suffix on names.

## 5. Verification

1. Unit tests (`shop-mapping.test.ts`): colour (quality 0 → 0, quality 7 → 2, template color 3 overrides);
   prices (money gt 0 → moneyAll; money gt 1 → money; gold beats money; all zero → template `price` moneyAll;
   type 2 with p_type1/p_num1 + p_type2/p_num2 → two special prices); `st` 5 / -1 hidden.
   `npc.service.test.ts`: `shop_id > 0` forces `npcType` 2.
2. `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test` — all green.
3. Smoke: log in, go to map 15 NPC 41 "Thương Nhân Đạo Cụ" (no quests) → click opens "Shop" directly with shop 5
   items, icons, prices; paging works; Mua/Sửa toast. Map 9 NPC 280 "Tiệm Pet Tôn Lệ" (has quests) → Đối thoại with
   "Shop" button → shop 43. Walk > 300 px away → panel closes. Server log shows `clickNpc` / `npcFuncClick`.
4. Docs: new `docs/memory/shop.md` + index line in `docs/PROJECT_KNOWLEDGE_BASE.md`; update `npc-dialog.md`.
