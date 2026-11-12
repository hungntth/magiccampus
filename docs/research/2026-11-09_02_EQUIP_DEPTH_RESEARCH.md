# Equipment depth (M13 phase D, 13.4) - research

Date: 2026-11-09. Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (section 2.4, phase D). Legacy repo: `E:\mcgame` (the plan text says `D:\mcgame`),
read-only. Two-source rule: a binding fact is listed with Go (G) and Flash (F) refs; a single source is marked.

## 1. Sources read

- G: `docs/memory/equipment-sublimation.md`, `ky-linh.md`, `equipment-modifications.md`, `equipment-tooltip.md`;
  `internal/domain/item/{sublime,qiling,qiling_roll,qiling_rebuild}.go`, `internal/application/item/{sublime,qiling,equip_stats}.go`,
  `internal/presentation/rtmp/handlers/item/{sublime,qiling,jewel_exchange,misc}.go`, `internal/domain/character/equip_stats.go`.
- F: `docs/client/view/view/compDragable/QiLingPanel.as`, `JewelExchagePanel.as`, `predef/GamePredef.as`, `config/Language.as`
  (EquipFunc itself is not decompiled; its handlers come from the Go memory notes of the bytecode dump).

## 2. Contract (confirmed)

| RPC | Args | Reply | Pushes (self) | Sources |
|---|---|---|---|---|
| `sublimeEquip` | `equipId, dustSlotId or NaN, autoBuy` | `{itemId, flagStr, num}`; every refusal replies nil | stack changes, `onUPP` (gold, and worn-gear stats), refreshed item, note "Thăng hoa thành công, trang bị đạt +N" / "Thăng hoa thất bại, tỉ lệ thành công lần sau +N%" | G handlers/item/sublime.go; G equipment-sublimation.md (bytecode) |
| `onValidateSublime` | `equipId, dustSlotId` | same, autoBuy forced | same | G sublime.go |
| `restrainEquip` | `equipId, dustSlotId or NaN, element 1..6, autoBuy` | same shape; null when the confirm push was sent | `validateRestrain(equipId, element)` when the dust is missing and autoBuy | G sublime_restrain (memory) |
| `onValidateRestrain` | `equipId, element` | same | as sublime (5 gold) | G memory; F RESTRAIN_ITEM_PRICE 5 (GamePredef.as:6816) |
| `getQiLingProp` / `getChongZhuProp` | `equipId` | `{"0":{t,v,max},"1":..,"2":..}` or **false** (never nil) | none | G qiling.go + ky-linh.md (QA fix 2026-10-24) |
| `updateQiLingProp` | `equipId, "auto"` or `""` | `true` | stack changes, `onUPP`, item, then `onQiLingRes(lines)` | G qiling.go; F QiLingPanel.as:2148-2165 |
| `updateChongZhu` | `equipId, lock0, lock1, lock2, auto` (`"lock"`/`""`, `"auto"`/`""`) | `true` | same, then `onChongZhuRes({use, cz})` (Go sends the same lines in both; the panel shows `use` as old and `cz` as new, there is no accept call) | G; F QiLingPanel.as:3154-3189, 1800 |
| `pmJewelExchage` | `sid, targetTid, tempBagFlag` | `{flag, finalNum, finalNme}` / `{flag:false}` | `onDelCharactorSlot`, `onAddItem`, `onAddCharactorSlot` | G jewel_exchange.go; F JewelExchagePanel.as:696 |
| `isEquSid` | `sid` | bool | none | G misc.go:109 (item id first, then bag slot); F TipEquip.as:1291 |
| `checkEquipEdit` | `mode` | dead in Go (not registered); H5 answers null | none | plan 2.4, decision 11 |

## 3. Rules (confirmed unless marked)

- Thăng hoa gate: bound, template `req_level >= 50`, instance prefix tier `>= 5`, display colour `>= 4` (orange), not fashion / flyer (G `SublimeEligible`;
  G equipment-sublimation.md; F `SUBLIME_LEVEL 50` GamePredef.as:6812). Display colour = ColorCode - 1 (G item.go ToDTO); H5 forge scale keeps
  ColorCode 1..5 (orange 5, crafted quality q = (colorCode-1)*5+prefix), so H5 uses `equipDisplayColor(colorCode, quality)`.
- Table `data_tbl_sublimation` (50 rows, already imported): rate, `item_num1` (attack gear) / `item_num2` (defence gear), `prop1/2` or `prop3/4`, `element_num`.
  Attack positions `{3,6,7,8,9,11,50,51,52,56}` (G; F `EQUIP_FUNCTYPE` GamePredef.as:9836+). Stats = the current level's row, not a running sum (row 50 carries 2500).
- One try: need dust (4841), success rate `min(100, row.rate + add)`, success level+1 / add 0 / first success rolls element 1..6, failure add += 5.
  **Go-invented** (the client carries neither): pity 5 %, dust price 10 gold each. Gold is plain Vàng, never Kim phiếu (G gold_only.go).
- Restrain: needs level > 0, element 1..6 different from the current one, 1 x Bụi Ma Pháp 4842 or 5 gold (F RESTRAIN_ITEMID / NUM / PRICE).
- Kỳ Linh: template `req_level > 150`, kind 1-4, slot index by kind / type (F `getQiLingIndex`, QiLingPanel.as:1387; G `QiLingSlotIndex`, identical).
  Candidate plans per slot copied from F `qiLingPlan` (QiLingPanel.as:1093) - **verified identical to Go `qiLingPlans`** by a script diff.
  Suffix table = F `PROP_SUFFIX` (GamePredef.as:8087) = Go `qiLingSuffix`. Labels = F `TIP_QILING_H` (Language.as:8748). Colour bands = F `QILING_COLOR`
  `[100,41,24,11,0]` (GamePredef.as:8113). Stone 5974 (F `QI_LING_ITEM`).
- Cost: Kỳ Linh 4 stones; Trùng Chú `6 + 5 x locks` (client lockEventChange, G ky-linh.md); "auto" buys the shortfall at 6 gold each (F QILING_PANEL[10], plain gold).
- Trùng Chú keeps every prop and rerolls only the values of unlocked lines (owner rule 2026-10-24, G qiling_rebuild.go); all three locked is refused.
- Set bonus: full lines (`v >= max`) over every worn Kỳ Linh piece, `{2:2%, 4:5%, 6:8%, 8:12%, 10:16%, 12:20%}` multiplies every line value (F QILING_PANEL[15-20];
  G `aggregateQiLingStats`). The "max 2 worn" text (QILING_PANEL[22]) is not enforced (owner decisions 2026-10-22 and 2026-11-09).
- **Go-invented**: per-prop caps (`qiLingMax`, HP / speed / crit rate raised by the owner 2026-11-04), value tier weights `20/130/250/400/200`. Values roll in `[max/10, max]`.
- Qiling props are the common-feature ids (`NormalizeCharacterPropType` = `CommonFeaturePropToStat`) = H5 `BUFF_PROP`. Props 32 / 58 (debuff hit / resist) have no
  H5 stat and add nothing (shown only).
- Jewel exchange: groups `[55..59]` and `[60..64]` (G jewel_exchange.go = F JewelExchagePanel.as:278-279); same group, different gem, whole stack, result bound,
  free. Go removes the source before the add (stack lost on failure): H5 adds first.
- Tier upgrade keeps Thăng hoa and Kỳ Linh (G `carryOverChangeLevel`, equipment-sublimation.md 2026-10-29): H5 `tierResetFields` now keeps `sublime` / `qiling`.

## 4. `equipt_suit`

`data_tbl_equipt_suit` (250 rows) has **no character-gear consumer**: every template with `suit_id > 0` is pet gear (kind 9, positions 50-57) or a wing
(kind 13, all `suit_id 1`, no counted pieces). Go uses it only for pet gear (`application/pet/equipment.go`, `skill_tier_display.go`) and the pet-gear suit
bonus is not ported in H5 (M12 stopped at lines + Thăng hoa). The "set bonus" of 13.4 is therefore the Kỳ Linh set bonus above. Pet-gear suits stay open.

## 5. Combat element effect

`Σ element_num` per element gives `ElementHurtUp` (attack gear) / `ElementHurtDown` (defence gear) in Go combat. H5 stores and shows the element; it is **not applied
in combat** (plan risk 4). Open question: Go indexes the sublime element 1..6 directly against the unit element ids, while the Flash labels for sublime
(1 Quang, 2 Ám, 3 Phong, 4 Địa, 5 Thủy, 6 Hỏa) differ from `ELEMENT_NAMES` of units; the numbering has to be confirmed before wiring `damage.ts`.

## 6. Values that need owner confirmation

- Colour gate scale (display 4 = ColorCode 5).
- Pity 5 %, dust price 10 gold, Kỳ Linh caps and tier weights (kept as Go, marked `Go-invented`).
- Element numbering for combat.
