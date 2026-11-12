# M13 phase F research: Mật Bảo + Lò luyện thần bí (13.6a), Năng Lượng Tự Nhiên (13.6d)

Date: 2026-11-12. Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (§2.6 a / d, phase F). Two-source rule: every contract line below was read in the Go
server (`E:\mcgame\internal/...`, legacy memory `docs/memory/mystery-treasure.md`, `astrology-system.md`) AND the decompiled Flash client
(`E:\mcgame\docs\client\view\view\compDragable\{DecoratePanel,MysteryFurnace,AstrologicPanel}.as`, `config\Language.as`). Mongo counts were measured on this repo.

## 1. Mật Bảo RPCs (Go `handlers/mysterytreasure/*`, Flash `DecoratePanel.as`)

| RPC | Args | Reply / pushes | Flash call site |
|---|---|---|---|
| `onGetMysBookData` | none | `{kind:{mysId:mysId}}` (Thu Thập codex) | `:4228` Responder |
| `onGetMysMakeData` | none | `{learnedRec:{id:id}, skiLvl, skiPt}` | `:4229` |
| `onGetMakeLimitTimes` | none | `{n, t}` (n = crafts left today) | `:4230` |
| `onGetMysBagData` | none | `{slot(>=1):{mid,num}}` | `:4231` |
| `onGetChipBagData` | none | rune chip bag (RuneChipBag, shared with 13.5a) | `:4232` |
| `getMysTreBuffByKind` | kind 1..11 | `{idx:{t, propVal}}` totals of the collected rows of that kind | `MysTreShow` |
| `getMysTreBuffSimpleData` | none | `{hp, attack, mAttack, speed, hit, dodge, critical}` (only non-zero keys) | `:8187` |
| `onGetMysAddTimes` | none | `{n, t}` purchases today (`t` = day stamp) | `:8283` -> confirm `DECORATE_PANEL[64]` / `[65]` |
| `addLimitMakeTimes` | none | `{n, t}` after the gold purchase | `:10168` |
| `makeMysTre` | `(recipeId, {slot:{idx:instanceId}}, {slot:stackNum})`, null responder | pushes only | `:10233` |
| `mysTreObjResolve` | `({slot:{mid,num}})`, null responder | pushes only | `:8878` |

Pushes (Go `make_feedback.go`, `collection_push.go`, `resolve.go`): craft = `updateMysTreMakeTimes(n)`, `updateMysTreBag(bag)`, `updateMysTreMakeData(data)`, then for a NEW
collection entry `updateMysTreBook(book)`, `onActiveMysBookInfo {t:123, id}` and the stat refresh (`onUPP`); resolve = `updateRuneChipBag`, `onAddMoney decoSilver`, `updateMysTreBag`.
`updateMysTreMakeData` is a Go-only push (read from the client bytecode, not the decompiled `CallBack.as`); the H5 client is ours so it is used.

## 2. Rules (owner rules in the Go memory; constants marked Go-invented stay)
- Tables: `data_tbl_mystre` 720 rows (kind 1..11, level 1..6, star 1..3, `prop_type` 1/4/5/11, `prop_num`, `mys_sil`; `per` is 0), `data_tbl_mystre_recipe` 66 rows
  (id = (level-1)*11 + family 1..11, `st` = `16-<level>-<kind>`, materials `t1..t6` / `n1..n6` / `q1..q6` = item template, count, colour).
- 11 level-1 recipes are free. Levels 2..6 by books type 516, ids 5042..5107: `recipe = id - 5042 + 1`. Level-1 books answer "already learned" and are kept. A book of any level
  may be learned early (Go fix 2026-11-08); crafting still requires `skiLvl >= recipe.level`.
- Skill: `MYS_TRE_NEED_SKIPT {1:100,2:250,3:700,4:1000,5:2000}` (Flash `DecoratePanel:98`), +2 skill points per craft (owner 2026-10-31), excess carries, max level 6.
- Output: random row of the recipe kind + level; star weights 70 / 25 / 5 over the stars present (Go-invented, `per` is 0). First free bag key >= 1 (the client draws 1..30 per page).
- Collection: every `mystre` row ever owned counts once (bag rows are back-filled into the codex); flat stats `Σ prop_num` by `prop_type` through the equipment prop table. Decompose never un-collects.
- Daily limit: 50 + `addLimitMakeTimes` purchases (+1 each; gold tiers `[[5,20],[10,30],[15,40],[20,50],[25,60],[40,70]]` = (purchases below N) -> price, max 40) + VIP right 28 ("Tăng lượt chế tạo Mật Bảo", VIP2 +5 .. VIP9 +40).
  Day boundary UTC+7 (Go fix 2026-10-27). Go refilled the remaining count on purchase; H5 stores `made` and derives `left = cap - made` so a purchase is exactly +1 (deviation, safer).
- Resolve: Bí Ngân (`decoSilver` 216) = `mys_sil × num` (owner 2026-10-31) AND per unit 10 % one level-1 rune + 30 % one rune chip (owner 2026-11-06, game_tuning knobs in Go; H5 constants): quality by Mật Bảo level
  (1-2 green, 3-4 blue, 5 purple, 6 orange), chips only exist for purple (levels 1-5) / orange (level 6) runes, rare rune families never drop (`isRareRuneType`, shared with 13.5a). Order: consume the bag first, then credit.
  A stale selection (slot gone / fewer units) consumes nothing, pushes the current bag + a note (Go `resolve_stale.go`).
- Craft validation (Go `make.go`): recipe exists, learned, level reached, allowance left, every non-empty `t/n/q` slot matched by an owned general-bag stack of that template and colour (`ColorCode == q`), two slots naming the same instance are summed; consume then credit; a vanished instance answers "Không đủ nguyên liệu, hãy bấm Tự động đặt nguyên liệu lại.".

## 3. Lò luyện thần bí (Go `handlers/mysteryexchange/*`, Flash `MysteryFurnace.as`)
- `MysteryExchangeItem({instanceId:true}, md5pass)` -> `{num, mysteryCrystal}`: whole stack, yield `recycling(type 1, item_id, color).value × stack` (`mysteryCrystal` 215). Items sold by an NPC shop for silver only
  (shop slot not `st 5`, not type 19, `p_type1 0`, no gold, silver price from the slot or the template) are refused with `NotRecyclableNotice` (2026-11-01 exploit). A row-less item rejects the whole request.
- `MysteryExchangeScore({type:count}, md5pass)` -> `{num}`: types 2..17 -> `stoneSealPoint, pvePoint, elementPnt, medalExp, npPnt, wisdonCrystal, realSoulStone, heiyaoshiPoint, warSprite, battleSprite, decoSilver, yijieElement, realSoulCrystal, starPnt, petguardout, petguardin`;
  yield `recycling(type = scoreType).value × count` (values 200/6/40/200/20/100/6/10/2/100/10/100/10/1/500/1); the stock client sends key `"0"` with count 0 for empty rows (skip). `medalExp` is the medal state exp (`onUPP {medalExp}`).
- Both: `md5pass` (secondary password) is ignored in H5 (plan decision 10). Counts are checked against the real balance; <= 256 entries; non-negative integers.
- Data (Mongo): `data_tbl_recycling` 322 rows (305 type 1 + types 2..18 one row each), `_extra` 137, `_jewels` 108, `_all` 6399 (all type 1, (item_id, color) keys). Template colour + a colour-0 alias exist for gems.

## 4. Năng Lượng Tự Nhiên (Go `handlers/astrology`, `application/astrology`, Flash `AstrologicPanel.as`, strip id 28 / panel 883)
- Calls: `getAstrologicData()` (null + push `onGetAstrologicData`), `refreshStars()` (null + `onAstrologicStarsRefresh(refreshLeft, [sid,sid,sid])`), `pickStar(sid)` (null + `onAddMoney`s + `onPickStar`),
  `lookFormula(fid)` -> `{id, formula}` (Responder, 180 / 280 / 380 gold for fid 0-1 / 2-3 / 4-5; free when already revealed).
- `onGetAstrologicData {award[6], award_record[], buyPickCount, formula[6] (null = hidden), pickCount, refreshCount, starsNow, starsToPick}`; pickCount / refreshCount are REMAINING free counts (12 / 10 per cycle).
- `onPickStar {buyTimes, leftTimes, newStars, refreshTimes, sid, result?{aid, fid:"<i>", formula, mult, stars}}`; client shows `aid` when `mult == 1` else `aid × (mult+1)`.
- Cycle = noon to noon UTC+7; reset clears collected stars, counters, revealed + completed; the 3 lit candidates stay. Formulas: 6 per cycle, lengths 2,2,3,3,4,4, distinct sids 1..12, server-wide, deterministic from the cycle key
  (Go: fnv + `math/rand`; H5: its own portable PRNG, the values are not observable across servers). Awards `[90,90,140,140,195,195]`. Match = last N collected equal the formula in order, longest wins, matched stars removed, keep at most 4.
- First completion of a formula per player per cycle: `mult = 10` (QA 2026-10-22: pays `aid × 11`) + announcement `ASTROLOGIC_PANEL_U[13]` on the system channel (`onSystemSay`); later completions `aid`. Every pick +12 npPnt (236). Paid pick `5 + buyPickCount` gold, paid refresh 5 gold, gold = unbound `gold`.
- Push order of a pick: `onAddMoney gold -cost` (paid), `onAddMoney npPnt +12`, `onAddMoney npPnt +award`, `onPickStar`. A failed paid refresh must still answer `onAstrologicStarsRefresh` (client `state = 1` freeze). A stale sid answers `onGetAstrologicData`.
- Record feed `award_record [{aid:"<fid>", cid, name}]`, oldest first, 12 entries, in memory per cycle.
- Entry: strip id 28 (`data_tbl_activity` flag 50 = level 50; the panel text says level 70). Lò luyện: strip id 51 (flag 50). Mật Bảo: page 4 of the Hồn Khí panel (`DECORATE_PANEL[1]` tab "Mật Bảo").

## 5. H5 decisions
- Feature keys `mystery_treasure` (bag, learnedRec, skiLvl, skiPt, mysBook, activeObj, make `{day, made, addTimes}`) and `astrology` (state above); tolerant decode; Go shapes (`makeLimitTimes`, `addTimes {N, T}`) are read and converted.
- Everything under `withCharLock`; spend (items, gold, balances) before credit; book handler writes the store directly inside the use lock (lock-free, like medal items).
- New H5 reads (client has no tables): `getMysCatalog`, `getFurnaceInfo`. Astrology gate: none on the server (as Go); the strip shows it from level 50 (seed), the help text keeps the Flash level 70 line.
