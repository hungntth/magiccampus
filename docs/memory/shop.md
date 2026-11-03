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
Repair (buttons toast), `shopClosePanel`, TBL_CREDIT / guild / mall shops, special currency names,
rich item tooltips, `[postfix]` suffix. Quiet the RPCs only after the user confirms.

## Window behaviour (2026-11-03)
- `client/src/ui/panelBehavior.ts`: `makeDraggable(panel, handle)` (ShopPanel passes its 30 px `.shop-header` strip with
  the title: only it shows the move cursor and starts a drag; stage-scale aware, kept on screen) and
  `closeOnEscape(close)` (also when the chat input has focus, which is blurred). ShopPanel registers both in `show()`
  and disposes them in `close()`. Reuse them for other windows.
