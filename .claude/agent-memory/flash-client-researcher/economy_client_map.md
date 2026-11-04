---
name: economy-client-map
description: Where bank/temp bag/repair/shops/forge/runes live in the decompiled client, and which parts are invisible (EquipFunc.as aborted)
metadata:
  type: reference
---

- **EquipFunc.as (`view/view/comp/`) is an aborted stub** and is the `equipChange` component of `EquiptFuncPanel`. All human-equipment
  forge RPCs (holeDig, jewelSet/Del, changeSoul/Bind/Prefix/Element/Level, changeName, equResolve, human star) have NO call site in
  the tree. Use Go (`handlers/item/*.go`) for arg shapes and `EQUIPTFUNCPANEL_S/U` (Language.as ~1135, ~3515) for UI rules.
  Visible forge RPCs: newMake, getMakeColor, materialMixOne/All, jewelUpdateOne/All, starOne/All (pet tab), getStarNum.
- Equipment crafting recipes = `TBL_EQUIPT_TEMPLATE` rows with `makable==1` + `requireItem1..3/requireNum1..3` (not TBL_RECIPE).
  Life-skill cook/medicine recipes = result item template `i1..i3/n1..n3` (LifeSkillPanel).
- Two different "temp bags": `TempBagSlot.as` = Túi tiện dụng + Ma Tâm bag (`getTBag`, sid 80..99, POP_TEMP_BAG_SLOT);
  `TemporaryBagPanel.as` = reward bag "Túi tạm thời" (sid 1101.., `addSingleItemToBag`/`addAllToBag`).
- sid map: bag pages 2100+30n (7 general, page 8 quest 2311-2340, page 9 pet-item 2341-2370), bank 300+30n (5 pages),
  `Player.bagSlotNum/bankSlotNum` = unlocked pages. Bank items ride in the `getInitSlot` reply; bank open push is `initViewBankPanel`.
- Bank/auction NPC: `npcFuncClick(npcId, md5Pass)`. Sell items with color>2 and gold/silver spends need secondary password
  (`unlockMoney(md5)` -> bool; lock flags live in the aborted BagPanel).
- Shop config pushes (`onGetShopConfig` etc.) are the only readable pushes besides CallBackGlobal; payload `[0,"",["N;obj.k='v';..."]]`.
- Tables: TBL_SHOP=53 (index name), TBL_SHOP_SLOT=51 (index sid, st), TBL_CREDIT=107 (index shopId), TBL_DECO_RUNE=119.
- `ToolKit`, `ResManager` are not decompiled; `Language.as` EQUIPTFUNCPANEL_S[102] is missing.
- Tooling tip: a bash awk helper that prints one AS function body by name (index "function NAME(") avoids paging through the
  thousands of Bindable getters/setters in MXML panels; grep `^\s+(public|private)... function` minus `function (get|set) ` first.
