# Item use — containers, awards, gift boxes (legacy research)

Date: 2026-11-07. Source: legacy Go server at `E:\mcgame` (read-only). Paths below are relative to
`E:\mcgame\internal\`; `item/` = `application/item/`.

## Dispatch (`item/service.go:1215-1251`)

id 719 noop → `use_type == 4` → `ErrCannotUseItem` → petGrowHandler → `templateHandlers[id]` → `typeHandlers[type]`
(508/509/550 → `questItemEffectHandler`) → `awardHandler.CanHandle` → fallbacks (box, wallet, buff, default).

The fallback chain is dead with current data: 508/509/550 never fall through, and every template whose type is not
in `typeHandlers` (243) is `use_type` 4 and refused earlier. Not worth porting.

## questItemEffectHandler (`item/effect_quest_item.go:41-183`)

About 25 hard-coded id-map handlers first, then: retired bags (5708 → "Túi quà này đã ngừng phát hành, không thể
mở.") → gacha-box config pools (`item/gacha_config.go`, `data_gacha_box*`) → choice chests (paid 5710/6665;
item/pet/feather/thần khí choice → GiftBox) → award rows → desc-title (title medal from description) → pet
GiftBox / pet bag → desc-bag opener (description parser, last).

## awardEffectHandler (`item/effect_award*.go`, `award_picker.go`)

- CanHandle: template has ≥1 `item_award` row (`effect_award.go:66-72`).
- Row filter: `payload.married` (`effect_award_married.go`), then `payload.class == char.ClassID`
  (`effect_award_class.go`); class-gated rows present but none match → refused.
- Gold cost = max `payload.costGold`; short of non-bound gold → `ErrGiftBagNeedsGold`, box kept.
- Picker: as `pickItemAwards` plus `payload.picks: N` = N distinct weighted draws (`award_picker.go:73-81`).
- Room check for all picked rows before any spend/grant (`effect_award.go:284-337`); pets check pet slots;
  currencies/titles/skills need none. Failure → `ErrInventoryFull` → "Không đủ ô trống."
- Spend cost, grant rows. First grant fails → refund, box kept; later grant fails → stop, box consumed (`:112-125`).
- Row types (`:134-250`): 12 pet (quality=`quality`), 19 equipment one by one (colorCode `(q+4)/5`, prefix attrs),
  29/default item, 30 basic currency by `award_id`, 31 exp, 32 buff, 33 title (duration from medal name/description,
  `effect_award_title.go`; expired event medal refused), 34 skill, 35 game currency, 36 medal, 37 dress material.
  Items/equipment inherit the bag's `IsBound`.
- Data in Mongo: types 29 (1069), 33 (355), 19 (251), 12 (81), 35 (21), 30 (10), 31 (3). Payload keys:
  `guaranteed` 1258, `class` 216, `costGold` 91, `mwVong` 10, `byClass` 10, `married` 2. Overlay `payload` is a JSON
  string.
- Messages: default "Đã mở %s."; title "%s nhận được danh hiệu %s!"; exp "Nhận được %d kinh nghiệm."

## Gift box / choose-one (`item/effect_gift_box.go`, `handlers/item/gift_box_pick.go`)

- CanHandle: type 508/550, `use_type` 1, folded name+description contains "chon nhan" | "tu chon" | "1 trong" |
  "mo chon nhan". Result `ConsumeItem=false`.
- Server push `itemMultitoSel({packItemList:{"0":{ti,ii,n,q},...}, packGetNum}, itemId)` (`gift_box_pick.go:72-75`);
  client calls `selMultiItemByIdx(itemId, idx)` (`MultiItemPanel.as:579`); reply int: -1 fail, 0 done, N>0 picks left.
- Pick order (`gift_box_pick.go:78-147`): room check ("Túi đồ không đủ chỗ trống!") → charge `costGold` ("Không đủ
  Vàng để mở túi này!") → consume box unit (on first pick) → grant + `onAddCharactorSlot` + `onAddItem` (or
  `onAddPet`) → `onUPP` if gold charged. Pending choice map is in memory only.
- Paid chests push first: "Chọn 1 vật phẩm để mở túi, sẽ trừ %d Vàng khi nhận."

## Small template handlers

- Money chest (`effect_money_chest.go`): 2271/2272/2273 → 100k/1M/10M; 1063/1132/2520 → 1k/100k/1M (1063 is also an
  equip id and equips first). Unbound → bạc (`money`), bound → ngân phiếu (`moneyBind`).
- Kim phiếu scroll (`effect_kimphieu_scroll.go:25-39`): 13 fixed ids credit goldBind (642 → 100 … 2791 → 80000).
  "Nhận được %d kim phiếu."
- Mystery key 1361 (`effect_mystery_key.go`): one item x1 uniform over `[4,125,158,261,264,267,9,10,11,12,13,14]`,
  inherits bind; room checked first.
- Paid chests 5710 (1500 gold) / 6665 (2120 gold) open the choice lists of 4785 / 4720.
- Desc-bag: Vietnamese description parser — port only as an explicit id → contents table.

## RPC and pushes (`handlers/item/use.go:21-200`)

- `useItem(targetType, targetId, slotId)`.
- Errors: insufficient level → note "Cấp độ không đủ!"; `useItemNotice` (`use_notices.go:29-54`):
  `ErrCannotUseItem` "Vật phẩm này hiện chưa sử dụng được.", `ErrGiftBagContentsUnknown` "Túi quà này hiện chưa mở
  được.", `ErrTimedItemExpired` "Vật phẩm này đã hết hạn sử dụng.", talent/rune/soul bag-full notes; others → RPC error.
- Success: character update → slot `onDelCharactorSlot(id, oldSid)` / `onAddCharactorSlot(item)` →
  `sendEffectCallbacks` (`use.go:336-384`): `onMidNote(message)` → per granted item `onAddCharactorSlot`,
  `onAddItem`, hidden-page note → `onAddFairy`, `onAddPet`, temp-bag offer, `onPutSoulToBag` → structured rewards
  (`reward_callbacks.go:23-110`): title, `upLongBuff`, `onAddMoney(charId, key, delta, total)`, skills,
  `updateMedalInBag`, `onUPP`.
- Consume after effect success; effect failing after a grant still consumes (`service.go:1163-1173`); GiftBox returns
  early without consuming.

## Counts (Mongo, 2026-11-07)

| | 550 | 508 | 509 |
|---|---|---|---|
| Templates | 3869 | 1088 | 103 |
| `use_type` 1 | 3756 | 155 | 97 |
| `use_type` 4 | 81 | 918 | 6 |
| With award rows (all tables) | 632 | 1 | 11 |
| With award rows (our overlay list) | 610 | 1 | 7 |
| Weighted gacha entries | 43 | 0 | 6 |
| Hard-coded money/kim phiếu/key/paid | 22 | 0 | 1 |
| Gift-box text match (approx.) | 168 | 3 | 0 |
| No award/gacha/hard-coded | 3173 | 1087 | 85 |

Go's own chest audit (`E:\mcgame\docs\research\2026-10-26_03_CHEST_AUDIT.md`): readable desc-bags 736 → 1235,
1524 unreadable.

## Reuse in this repo

- `server/src/modules/rewards/item-award.ts` `pickItemAwards`: reusable; lacks `picks`, `class`, `married`,
  `costGold`, `quality`/`pre_name_type`; `guaranteedOf` only reads `guaranteed`.
- `GrantService.unpack` always grants bound and handles only 29/19/30/35 (skips 12/31/33/34).
- `GrantService.fits` / `grant` / `AddSpec` cover room check and bag-add pushes; its `onAddItem` lacks `s`/`c`/`tt`.
- No `selMultiItemByIdx` / `itemMultitoSel` / `useMultiItem` yet.
- Overlay gaps (`server/src/modules/gamedata/overlays.ts:28-36`): missing `guild_happy_bags` (9), `pet_keys` (46),
  `bicanh_rank_bags` (30), `dragon_keys` (32) though they are in Mongo; `item_award_activity_chests` and
  `data_gacha_box_*activity_chests` are not imported at all (chests 3255-3259, use `picks` and type 37).

## Recommended order

1. Award-table bags (~632) with extended picker and room-check → spend → grant; fix overlay list first.
2. Money chests and kim phiếu scrolls.
3. Gift-box choice UI (`itemMultitoSel` / `selMultiItemByIdx`) driven by data lists.
4. Gacha-box config pools (49).
5. Mystery key 1361; `useMultiItem`.
6. Desc-bag bags only as an approved explicit id table.

## Unverified

Desc-bag readable counts; hard-coded pet/talent/rune/soul bag maps; `item/use_multi.go`; client index behaviour when
`GetNum` > 1 (all boxes found use 1).
