# Ma Tâm (monster heart) (M13 phase E2, 2026-11-09)

Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (§2.5e, phase E). Research: `docs/research/2026-11-09_04_MEDAL_SEAL_HEART_RESEARCH.md` (rules are the owner-validated ones of `E:\mcgame\docs\memory\monster-heart.md`). Sister notes: `medal.md`, `stone-seal.md`.

## Contract (`packages/shared/src/monsterHeart.ts`)
`MONSTER_HEART` consts, `MonsterHeartState {bag: {ren..te: {heartId: {itemId, n}}}, data: {hadActHole, hadActCombine, heartBoxLev}}`, rows (`HeartRow`, `CombineRow`, `PointRow`, `ContainRow`), compact `MonsterHeartCatalog`, `MHUPMH_RATE`,
pure rules `buildCombineGroups`, `recomputeCombines`, `heartStatLines`, `heartPropTotals`, `boxRatio`, `monsterHeartDiamondColor`. Holes: 0 closed, -1 open and empty, > 0 heart id. New currency `mhjingshi` (Go 232).

## RPCs (all registered WITHOUT `quiet`; mutating ones `forbidInBattle`)
`initMonsterHeartData()` -> state, `monsterHeartSet(heartId, hole, box, type)` / `monsterHeartReMove(hole, box)` -> null + `updateMonsterHeartPanel({bag, data})` + `onUPP`, `openHoleMonsterHeart(box, hole)` (point gold) /
`openHoleMonsterHeartJingang(box, hole, itemKK)` (point `num` Kim Cương of the exact colour; the stack argument is ignored) -> null + `updateMonsterHeartBox(data)`, `upgradeMonsterHeartItem(isAll, giid, num, useStone, byGold)` ->
`updateMonsterHeartBagByType(bag, type)` + `updateMonsterHeartAfterUp(isAll, n)`, `resolveMonsterHeart(giid, num[, md5pass ignored])` -> `updateMonsterHeartBagByType` + `onUPP {currencies}`, `upgradeMonsterHeartBox(box)` ->
`onUpgradeMonsterHeartBox(heartBoxLev)` + `onUPP`, H5 `getMonsterHeartCatalog()`. Item `oneKeyOpenAllMXTemp()` (temp bag RPC, reply = tBag, push `updateTempBags` + `updateMonsterHeartBagByOneKey(n)`). Refusals show a note and reject.
Dev sources: `/grant heart <id> <n>`, `/grant item <Ma Tâm item id>`, `/grant currency mhjingshi|monsterHeart <n>`.

## Server (`modules/monsterheart/`)
- `monsterheart-state.ts` (feature key `monster_heart`, `ver 2`, free holes opened on load), `monsterheart-rules.ts` (pure plans: set / remove / open / fuse / resolve / box, injectable rng), `monsterheart.service.ts`
  (`withCharLock`: validate -> conditional spend -> save -> credit -> pushes, refund on a failed write; `grantLocked` for lock-holding callers), `monsterheart-items.service.ts` (`ItemUseRegistry.addQuestItem`: Ma Tâm items 5375-5697 / 5770-5841 by `propl_num`,
  5884 Tâm Tinh Thạch +1 `mhjingshi`, 5877-5879 Ma Năng stones; `MxOpenRegistry` opener for the temp bag), `monsterheart.rpc.ts`, `monsterheart.module.ts`.
- Character stats: `MonsterHeartBonusProvider` (`stats/growth-providers.ts`): placed hearts `propnum / scale`, combines `ceil(talent/10000 x ratio x p_num)` (first line capped by `max_num`), flat rounded after summing. No pet side (as Go).
- Combine rule (owner doc): group complete = every hole holds a heart; colour = lowest key colour + 1; talent = SUM of `heart_talent`; one pid per group; ratio (container `num / 10000`) applies to combines only.
- Temp bag: `tempbag/mx-open.registry.ts` (new `MxOpenRegistry`, exported by TempBagModule; MonsterHeartModule registers the opener). `oneKeyOpenAllMXTemp` now opens every Ma Tâm row (templates 5375-5697 / 5770-5841) of the Ma Tâm temp bag in one go
  (rows removed first, restored when the hearts cannot be saved); with nothing to open it refuses.

## Client (`game/MonsterHeartController.ts`, `ui/monsterheart/*`)
Entry: character panel button "Ma tâm". Tab "Đặt Ma Tâm": box selector (level, ratio), 7 holes (open by gold / Kim Cương with owned count, place, remove), 7 type tabs of the heart bag, active combines and total stats, box upgrade.
Tab "Thăng cấp / Phân giải": fusion (count 2..5, rate, Tâm Tinh Thạch / 800 gold, "Toàn bộ" 30 s lock), resolve. Handles all six pushes; `updateMonsterHeartBagByOneKey` reloads the state.

## Verification (2026-11-09)
- Unit: shared `monsterHeart.test.ts` (5, incl. the owner worked example 14 / 28), server `monsterheart-rules.test.ts` (8), client `mhRules.test.ts` (3, run from `server/`).
- ws e2e (temporary account, removed): catalog, opener (5375 -> heart 1 + note), set / remove / closed-hole refusal, gold open (-2), Kim Cương open (10 consumed, `onDelCharactorSlot` + box push), combine on 11011 (attack +14 at box lv1, +17 lv2, +20 lv3, gone on remove),
  Ma Năng upgrade (15400 / 30800 + `onUpgradeMonsterHeartBox`), fusion (4 of 20 unprotected at 25 %, failures burn the copies; protected failure keeps them; stone then 800-gold fallback; "toàn bộ" run), resolve (+exp x num), refusals (count range, not enough, none to open),
  one-key open of two temp rows, 5884 (+1 stone) and 5878 (+3000 Ma Năng), relog identical.
- Browser: window opens (box levels, holes with gold / Kim Cương costs, bag tabs), placing two keys shows "Mũi Tên Kỵ Sĩ" with Công VL +19.73 at box lv3 (owner table 19.733).

## Deferred / values for the owner
- Ma Tâm sources (monster drops route to the Ma Tâm temp bag already; shop / activity rewards are other milestones); the Kim Cương "cấp" label is colour + 1 (the Flash `MONSTER_HEART[18]` call site was not found).
- Values needing owner confirmation (unchanged from Go): combine talent as the SUM and the `max_num` cap, per-attempt protection cost, all copies lost on an unprotected failure.
- Quiet the new RPCs only after the user confirms.
