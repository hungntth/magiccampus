# M13 phase E1 research: Hồn Khí (deco) + Runes (Phù Văn) - 2026-11-09

Sources (two-source rule: Go handler/application + Flash decompile; legacy memory `E:\mcgame\docs\memory\dress-system.md`, `stat-feature-foundation.md`,
`currencies.md`, `mystery-treasure.md`). Go paths are under `E:\mcgame\internal\`, Flash under `E:\mcgame\docs\client\view\view\`.

## 1. Tables (all already imported in Mongo)

| Table | Rows | Columns that matter |
|---|---|---|
| `deco_hole` | 204 = 4 positions x levels 0..50 | `id, position, level, next_id, cost_num (Bí Ngân), cost_sil (silver), rate, prop_type1..4, prop_num1..4`; base ids per position 1..4 = 1, 2, 3, 4; lv0 `35 / 500 000 / 100 %`, lv49 -> 50 `530 / 25 000 000 / 30 %`; `prop_num*` of lv0 rows is 0 |
| `deco_show` | 20 = 5 suits x 4 positions | `id, position, suit_id, link_suit_id, name, active_gold (188..2188), t (minutes, 1 = permanent, all seeds 1), icon_code, prop_type1..4/prop_num1..4, res_code1..6` |
| `deco_rune` | 1520 = 19 prop families x kind 1/2 x 5 colours x lv1..10 | `id, kind (1 Nhân vật / 2 Pet), type (rare marker), level, qulity (colour), next_id (0 = max), exp (dissolve value), up_exp, prop_type, prop_num, name, icon_code, chip_id` |
| `rune_chip` | 76 | `id, kind, num (chips per rune), rid (-> deco_rune.id), name, icon_code` |

`res_code1..6` of a show = Lv1 main, Lv1 mask, Lv2 main, Lv2 mask, Lv3 main, Lv3 mask (`resCode(2*showLvl-1)` main, `2*showLvl` mask). Of the
67 distinct codes, 64 have a converted `effect/EFF_PLAYER_1020xx` sheet in `client/public/sheets` (measured 2026-11-09), so the look can be drawn.

## 2. Currencies

`decoSilver` (Bí Ngân) = Go currency **216**, `runeExp` (Exp phù văn / Tinh Hoa Phù Văn) = **217** (already `CURRENCY_IDS.runeExp`).
`decoSilver` is added to `CURRENCY_IDS`. Hole level-up silver: `moneyBind` (Ngân phiếu) or `money` when `selectedMoneyType == 2`
(`dress/deco_hole_level.go`; H5 `ForgeMoneyService` rules). Show activation: unbound `gold` only (`SpendGold`).

## 3. Hồn Khí RPCs (Flash `DecorateItem.as`, `DecoratePanel.as`; Go `handlers/dress/deco_*.go`, `application/dress/deco_*.go`)

All answer with the full `decoInfo` (Responder `updateDecoInfo`, replaces `player.decoInfo`). Args are ints.

| RPC | Args | Rule |
|---|---|---|
| `activeDecoShow` | `(id, position)` | show must exist and match `position`; already live = no-op; `active_gold <= 0` = event only; gold spend; `activeFlag.s[id] = due` (1 permanent, else now + t minutes in epoch ms); stats `onUPP` |
| `equipDecoShow` / `equipOffDecoShow` | `(id, position)` | equip needs a live activated show, sets `did = id`, `isShow = 1`; off clears `did` only if it equals id |
| `showDecoShow` / `hideDecoShow` | `(position)` | toggles `isShow` |
| `changeShowLvl` | `(showLvl, position)` | tier `1..max`, max = 1 below hole level 30, 2 below 50, 3 at 50 (`DecoratePanel` combo). Stored `showLvl` is clamped on load |
| `updateActiveDecoShow` | `(obj)` | client expiry timer; server drops every expired show by its own clock and unequips it |
| `addDecoHoleLevel` / `...TenTimes` | `(position)` | per attempt `cost_num` Bí Ngân + `cost_sil` silver, roll `rate`, success -> `hid = next_id`; failures pay; ten stops at max level or when funds run out; first attempt unaffordable = refusal ("Không đủ Bí Ngân!" / "Không đủ Ngân phiếu!") |
| `getDecoSuitProp` | `(suitId, linkSuitId, linkId)` | `{actName, suitIdObj, suitProp, actArr, actFlag, linkProp, linkFlag, actLinkSuitFlag, actLinkSuitName}`; `suitProp` entries `{t, propVal}` with `t` only 1/4/5 (client #1069 otherwise) |

Pushes: after equip / off / show / hide / showLvl / expiry, for the touched positions `onDeco{Head,Light,Foot,Bottom}Off` first, then `...On`
when `did > 0 && isShow == 1`, payload `{cid, decoInfo}` to self + scene (`deco_appearance.go`; positions 1 Head, 2 Light, 3 Foot, 4 Bottom;
Flash `haloOn / roundOn+roundMaskOn / footprintOn / tepeOn`). Money: `onAddMoney`; H5 uses `onUPP {gold|currencies}` like Tủ Đồ.

`activeFlag` = `{r:{0..15: 0|1}, s:{showId: due}}`; `r` opens the 16 rune slots by the Hồn Khí's own level: holePos 1-2 Lv5, 3-4 Lv10, 5-6 Lv15,
7-8 Lv20, 9-10 Lv25, 11-12 Lv30, 13-14 Lv40, 15-16 Lv50 (only source: `DECORATE_PANEL[66..73]` tooltips; Go-invented, kept).

**Stats** (`deco_bonus.go`, `deco_suit.go`): every position's current hole row props + every live activated show + full suit (4 pieces of one
`suit_id`: `floor(20 %)` of the summed HP / Công VL / Công MP) + link (two linked suits, ids 1-2 and 3-4, both full: `floor(10 %)` of both suits'
summed props, every type). 20 % / 10 % are Go-invented (no client table); kept and marked.

## 4. Rune RPCs (Flash `RuneBag.as`, `RuneSlot.as`, `RuneClickBag.as`, `RuneBagUpLvl.as`, `RuneChipBag.as`; Go `handlers/rune`, `application/rune`)

State `rune` = `{chaBag:{slot:{n,r}}, petBag:{slot:{n,r}}, upLvlHole:runeId}`; `rune_chip` = `{bag:{slot:{chipId:"id", num}}}` (chip keys from "1").
Bag keys are 0-based strings; capacity 100; `bagType` 0 = character bag, 1 = pet bag; kind 1 runes live in the character bag, kind 2 in the pet bag.

| RPC | Args -> reply | Rule |
|---|---|---|
| `getRuneBagData` | `(cid)` -> `{chaBag, petBag, upLvlHole}` | `cid` ignored (session) |
| `runeMove` | `(from, to, bagType)` -> null + push `onRuneBagUpdate` | `-1` = the up-level hole: hole -> bag[to] (stack on the same id, refuse an occupied other slot), bag[from] -> hole (hole must be empty, takes 1); both indexes >= 0 = move / swap inside the bag |
| `arrangeRuneBag` | `(cid, bagType)` -> null + push | dense-pack into keys 0..n-1 in key order |
| `runeSet` | `(bagPos, holePos, bagType, decoPosition)` -> decoInfo | rune kind must match `bagType`; holePos 1..16 (odd = character page, even = pet page; **H5 enforces the parity**, Go left it to the client); slot must be open (`activeFlag.r`) and empty; one rune per prop type per Hồn Khí and page (Go 2026-11-07); bag spent first, then the slot is written, refund on failure; pushes `onRuneBagUpdate` + stats (`onUPP` for the character page, `onRefreshPetProp` per pet for the pet page) |
| `runeRemove` | `(holePos, bagPos, bagType, decoPosition)` -> decoInfo | clears the slot, adds 1 to the bag at `bagPos` (stack / free slot, else the first free slot of the rune's kind bag); **H5 checks bag room first** (Go lost the rune on a full bag) |
| `runeUpLvl` | `()` -> rune bag | the staged rune goes to `next_id` for `up_exp` runeExp; `next_id <= 0` = max level; spend before the upgrade |
| `runeResolve` | `(runeObj{pos: runeId}, bagType)` -> null + push | every named slot dissolves into `exp x stack` runeExp; bag saved before the credit; slots whose id differs from the claimed id are skipped |
| `exchangeRune` | `()` -> null + push `updateRuneChipBag` (always), `onRuneBagUpdate` (when converted) | per chip `floor(num / rune_chip.num)` runes of `rid`, remainder stays; chips saved first; rare families never convert (below) |

Rare runes (owner 2026-11-08, Go `rare_runes.go`): `deco_rune.type` 14, 61 (Hủy Diệt) and 59, 60, 62, 63 (Hy Hữu) come only from rare chests; `exchangeRune`
keeps their chips and shows "Mảnh Vỡ Phù Văn Hủy Diệt / Hy Hữu không thể đổi thành phù văn. ..." (kept as Go has it; no chest exists in H5 yet, `/grant rune` is the source).

**Rune stats** (`deco_rune_bonus.go`, `pet_deco_rune.go`): per Hồn Khí, per page, walk N = 1..8, slot `2N-1` (character) / `2N` (pet), only OPEN slots, each rune gives
`props[prop_type] = prop_num / scale` (a later slot of the same type replaces the earlier one, no stacking); the four Hồn Khí add up. Panel scale (`TipDecoRune.as`):
types 1/4/5/6/7/11 raw, 8/9/13/14/31/32/58/61 `/10000`, 34/59/60/62/63/71 `/100`, others ignored. Character: flat props rounded after summing, rate props as floats.
Pet: the pet page is one owner-wide total applied to EVERY pet (like Chiến Hồn and the wing's pet feathers); 1/4/5/6/7/8/9/11/13/34 flat, 14 Xuyên PN, 71 sát thương bạo kích, 31/32/58/59..63 through the pet talent float keys.

## 5. Client (Flash `DecoratePanel`, tabs "Hồn Khí", "C.Hóa H.Khí", "Phù Văn", "Mật Bảo")

The Flash panel read `TBL_DECO_*` locally; H5 sends rows through catalog RPCs (`getDecoCatalog`, `getRuneCatalog`, like `getDressCatalog`). H5-only RPC
`getRuneChipBag` (the Flash chip bag came with the Mật Bảo login blobs, phase F). Strings: `DECORATE_PANEL` (Language.as:8122-8215) used verbatim; the Mật Bảo tab is not built (phase F).

## 6. Decisions / deviations from Go (all marked in code)

1. Feature keys `deco` (Go `deco_hole`) and `rune`, `rune_chip` as plan decision 5; `decode` tolerates the Go shapes (`r1..r16` columns, string `activeFlag`, 0-based vs 1-based rune keys).
2. Refusals toast through `onSystemMidMsgOrNote` and reject (Go answered `nil, nil` silently) - H5 convention.
3. Parity of rune slot vs bag, bag-room check on `runeRemove`, slot / bag validation before any write, everything under `withCharLock`, conditional spends.
4. Hole level-up: first attempt's cost is validated, later attempts stop silently when funds run out (as Go); every attempt that is paid is persisted before the roll result is applied (single save at the end, refund impossible mid-batch because spend precedes).
5. Mật Bảo and its chip sources are phase F: chips / runes enter through `/grant rune|runechip` only.
6. Go-invented, kept: suit 20 % / link 10 %, slot unlock levels, same-type restriction.
