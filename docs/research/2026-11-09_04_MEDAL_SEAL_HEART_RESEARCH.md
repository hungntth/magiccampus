# M13 phase E2 research: Medals (Ấn Chương), Stone seal (Ấn Thạch), Monster heart (Ma Tâm) - 2026-11-09

Sources (two-source rule: Go application + handlers, Flash decompile; legacy memory `E:\mcgame\docs\memory\monster-heart.md`, `stat-feature-foundation.md`
§ Medal / Stone Seal, `currencies.md`). Go paths are under `E:\mcgame\internal\`, Flash under `E:\mcgame\docs\client\view\view\`.

## 1. Tables (all already in Mongo)

| Table | Rows | Notes |
|---|---|---|
| `medal` | 573 | `id, basic_tid, level 0..10, sid (equip slot 1001..1005 pet / 2001..2005 char; 1006 / 2006 = engrave LINE rows), clevel, exp (dissolve value), up_exp, q (quality, >= 4 rare), prop_type, prop_val (panel = / 100), preflag (1 = percent), join_tid (`|a|b|c|d|e|` basic ids of an engrave line)` |
| `creatureh_heart` | 1938 | `id, type 1..7, color 0..5, exp (Ma Năng on dissolve), heart_talent (10000 = key lv0), prop_type, propnum`; the next colour of a heart is id + 1 (same type and prop) |
| `creatureh_combine` | 1710 | `id = pid * 10 + colour`, `pid = box*1000 + group*100 + n`; `pid_combine` = hole numbers, `type_combine` = heart types (unordered), `prop_type1`, `p_num1` (props 2 / 3 unused), `max_num` (cap of the colour-1 row) |
| `creatureh_contain` | 30 | `id = box*10 + lev (1..6)`: `exp` Ma Năng, `gold_num`, `num` ratio (10000 = +0 %, 20000 = +100 %) |
| `creatureh_point` | 35 | `id = box*10 + hole` (5 x 7): `goldnum`, `num` Kim Cương (item 16), `quality` (colour code 0 / 1 / 6 / 11 / 16), `type` (-1 any); only 1-1 costs nothing |
| stone seal | none | the cost / bonus tables are client constants (`StoneSealBoreCanvas.as`, `StoneSealPanel.as`) |

Currencies: `mhjingshi` (Tâm Tinh Thạch) = Go **232** (added to `CURRENCY_IDS`); `monsterHeart` (Ma Năng) 231 and `stoneSealPoint` (Bụi Ấn Thạch) 239 were there.
Medal exp stays inside the medal state (Go `FeatureMedal.exp`).

## 2. Medals (Go `application/medal`, `handlers/medal`; Flash `MedalPanel.as`, `MedalSlot.as`)

- State `{exp, bag: {slot: {i, t, n}}, petBuff: {t}, charBuff: {t}, checkFlag}`; bag 1..600 (display <= 320), worn 1001..1005 / 2001..2005.
- `getMedalInfo` -> `{medalExp, medalBag (bag AND worn entries), petBuff, charBuff}`; `arrangeMedalBag` -> the bag map (compacts 1..n).
- `moveMedal(from, to)` -> push `onMoveMedal {type 1 char / 2 pet, joinTid, petJoinTid, del?, pa (worn), ba (bag)}`. Client gate (`MedalSlot.dragDropHandler`): medal.sid == target slot
  ("Vị trí không đúng"), player level >= clevel ("Cấp độ không đủ"), one side must be a bag slot. Equipping from a stack takes ONE unit; the old worn medal returns to the bag.
- `upMedal(index)` Responder -> `{medalExp, del?, ba}` (+ push `onUpMedal`): spends `up_exp` of the medal exp, one unit goes to the next level of the same `basic_tid`; client gate: next row `clevel` > player level
  refuses ("Cấp độ nhân vật không đủ"), exp short refuses ("Không đủ kinh nghiệm thăng cấp").
- `breakMedal(index, count, type)` Responder -> same payload (+ push `onBreakMedal`); credits `exp x count`; `q >= 4` answers the literal `"ban"` (client shows MEDAL_P[55]).
- Engrave line: five worn medals of a side with five DISTINCT basic ids, line level = lowest worn level (level 0 gives nothing), the `sid 1006/2006` row whose `join_tid` is exactly those five basics (lowest id wins).
  Go recomputed `charBuff/petBuff` on every move and in `getMedalInfo`.
- Stats (`statfeature/medal_stats.go`): worn medals + the line row; panel value `prop_val / 100`, preflag 1 on prop 1 = percent max HP; character via the BUFF prop ids, pet side shared by every pet.
- Go bugs fixed: `validateMoveBetweenSlots` did not check the slot kind or level (client only); an unequip onto an occupied bag slot swapped that medal INTO the worn slot; level-up probed `id + 1`.

## 3. Stone seal (Go `application/stoneseal`, `statfeature/stoneseal_*`; Flash `StoneSealPanel.as`, `StoneSealBoreCanvas.as`, `ItemSlotStoneSeal.as`)

- State `{stone: {equipSid 1..12: {lvl 0..5, data: {s1..s10}}}}`; hole absent = not bored, **0 = bored and empty**, > 0 = stone template (Go fix 2026-10-25; old -1 decodes to 0).
- All RPCs answer `{flag, data}` (`stoneSealGetData` adds `watch:false, equip:null, slot:null`) and push `onUPP`. Args: `SetStone(equipSid, sealIndex, itemId, tempBagFlag)`, `RemoveStone(equipSid, sealIndex)`,
  `RemoveAllStone(equipSid)`, `SwapStone(equipSid, i1, i2)`, `Bore(equipSid, sealIndex, payMode, diamondItemId)`, `Succinct(equipSid, payMode)`; payMode 1 gold, 2 bore dust + Kim Cương, 3 succinct dust.
- Costs by bored count: dust `[50,60,77,102,136,180,234,299,375,463]` + 1 Kim Cương of colour `[0,0,1,1,2,2,3,3,4,4]` (item 16), gold `[71,86,110,146,195,258,335,428,537,663]`; succinct by seal level: dust `[110,110,275,529,582]`, gold `[157,157,390,751,826]`.
- Stones are item type 503 (`ItemSlotStoneSeal.dragDropHandler`). Stats per hole of a WORN piece: the stone's own jewel line (weakened to 0 when the equipment gem of the same hole has the same prop, `STONE_SEAL_CONF_NEGATIVE` diagonal)
  + the add line `STONE_SEAL_CONF_EXTRA_PROPERTY[min][max]` = `[bonus prop, V]`: `n = V x (gemColour + stoneColour + 2) x STONE_SEAL_SUCCINCT_CONF[lvl]`, shown `n / 10000`.
- Go: gold, dust and the diamond type are checked before anything is consumed; occupied hole refused (the client asks "đổi bảo thạch" and then sends SetStone, so H5 replaces and hands the old stone back).

## 4. Monster heart (Go `application/monsterheart`; legacy `monster-heart.md` is owner-validated 2026-10-26/27)

- State `{ver 2, bag: {ren shou zhi ji mo lon te: {heartId: {itemId, n}}}, data: {hadActHole: {box: {hole: 0 | -1 | id}}, hadActCombine: {box: {pid: {color, talent}}}, heartBoxLev: {box: 1..6}}}`;
  a `ver < 2` document read every -1 hole as closed; only holes whose point costs nothing start open.
- Opener: type 550 item 5375-5697 / 5770-5841, `propl_num` = heart id -> bag of `type`; 5884 Tâm Tinh Thạch (+1 `mhjingshi`); 5877 / 5878 / 5879 Ma Năng stones (+5000 / 3000 / 1000).
  `oneKeyOpenAllMXTemp` opens every Ma Tâm row of the Ma Tâm temp bag.
- `monsterHeartSet(heartId, hole, box, type)` / `monsterHeartReMove(hole, box)` -> push `updateMonsterHeartPanel({bag, data})` then the stat refresh; combines are recomputed (group complete = every hole holds a heart,
  colour = lowest key colour + 1, talent = SUM of the keys' `heart_talent`).
- `openHoleMonsterHeart(box, hole)` pays the point `goldnum`; `openHoleMonsterHeartJingang(box, hole, itemKK)` consumes `num` Kim Cương of the exact colour code; both push `updateMonsterHeartBox(data)`.
- `upgradeMonsterHeartItem(isAll, giid, num 2..5, useStone, byGold)`: rate `MHUPMH_RATE[colour+1][num]` (client table); a failure destroys the `num` copies unless protected (1 `mhjingshi` per attempt, else 800 gold when `byGold`);
  `isAll` repeats (cap 1000) until fewer than `num` copies or no protection. Pushes `updateMonsterHeartBagByType(bag, type)` + `updateMonsterHeartAfterUp(isAll, n)`.
- `resolveMonsterHeart(giid, num[, md5pass])` -> `heart.exp x num` Ma Năng. `upgradeMonsterHeartBox(box)` -> `onUpgradeMonsterHeartBox(heartBoxLev)`: Ma Năng of the CURRENT row, else its `gold_num`.
- Stats (`monsterheart/stats.go`, client `setImageLineVis`): placed heart `propnum / scale` (59 60 62 63: `/100`); combine `ceil(talent/10000 x ratio x p_num)` per prop, the first line capped by the colour-1 `max_num`; ratio = container `num / 10000` (combines only).
  Worked example (owner doc): two white lv0 keys on 11011 -> Công VL 14.095 at box lv1 ... 28.19 at lv6.

## 5. H5 decisions and deviations

- Replies: Flash `Responder` RPCs of the medal panel (`upMedal`, `breakMedal`) reply with the payload AND push (Go replied null and pushed); refusals show `onSystemMidMsgOrNote` and reject, except the stone seal (Responder `{flag:false}`).
- Pushes use `onUPP` for the stat refresh (the H5 client has no `onInitViewProp`).
- Stone seal: stones only from the bag (the temp-bag flag is ignored), Kim Cương of a colour >= the hole's (forge dig rule), the hidden Hoàn Mỹ gem +1 % HP of Go is not ported (H5 gear gems do not have it).
- Medal pets: the pet dictionary is the pet rune one (pet talent keys + 14 / 34 / 71): combo / Miễn giảm / resist medal lines have no pet key and add nothing (Go rounded most to 0).
- Medal sources: none in H5 yet; `gmGrant medal <id> <n>`, `medalexp <n>`, `heart <id> <n>` are the dev sources (Ma Tâm items also through `/grant item`).
- Medal exp items 3816 (+25), 5114 (+125), 5275 (+2000) (amounts from the item descriptions, Go `effect_point_items.go`) credit the medal state exp: `medal/medal-items.service.ts`.
