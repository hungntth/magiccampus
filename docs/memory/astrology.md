# Năng Lượng Tự Nhiên (astrology) (M13 phase F, 2026-11-12)

Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (§2.6d, phase F). Research: `docs/research/2026-11-12_01_MYSTERY_ASTROLOGY_RESEARCH.md`. Sister note: `mystery-treasure.md` (the furnace converts npPnt).

## Contract (`packages/shared/src/astrology.ts`)
- `ASTRO` consts (12 free picks, 10 free refreshes, 3 lit candidates, keep 4 collected, elements 1..12, +12 npPnt per pick, refresh 5 gold, paid pick `5 + bought`, `FIRST_MULT 10`, noon reset, record feed 12), `ASTRO_AWARDS [90,90,140,140,195,195]`, `ASTRO_ELEMENTS`, `ASTRO_TEXT`.
- Pure + tested: `cycleKey(ms)` (UTC+7 date of `ms - 12 h`, flips at 12:00 UTC+7), `cycleEndMs`, `cycleFormulas(cycle)` (six formulas of lengths 2,2,3,3,4,4, distinct elements, deterministic: fnv1a -> mulberry32 -> Fisher-Yates; Go used fnv + `math/rand`, so the values differ from Go but are stable per cycle), `matchFormula` (tail in order, longest wins),
  `formulaAmount(aid, mult)` (`mult 1` -> `aid`, else `aid x (mult + 1)`; first completion = `aid x 11`), `lookFormulaCost` (180 / 280 / 380), `pickGoldCost`.
- Wire: `AstrologicData {award, award_record, buyPickCount, formula[6|null], pickCount, refreshCount, starsNow, starsToPick}` (counts = REMAINING free counts), `PickStarPush {buyTimes, leftTimes, newStars, refreshTimes, sid, result?{aid, fid:"<i>", formula, mult, stars}}`, `LookFormulaReply {id, formula}`.

## RPCs (all registered WITHOUT `quiet`; refresh / pick / look are `forbidInBattle`; a refusal = `onSystemMidMsgOrNote` + rejected call)
- `getAstrologicData()` -> null + push `onGetAstrologicData` (before the reply). `refreshStars()` -> null + `onAstrologicStarsRefresh(refreshLeft, [sid x3])`; a refusal (no gold) STILL pushes the current state first (Flash freezes on `state = 1` otherwise), then rejects.
- `pickStar(sid)` -> null; pushes `onAddMoney gold -cost` (paid), `onAddMoney npPnt +12`, `onAddMoney npPnt +award` (completion), `onPickStar`, then `onUPP {currencies}` (the H5 client reads balances from `onUPP`; `onAddMoney` is kept for Go parity and is ignored by the client). A sid that is not lit pushes `onGetAstrologicData` and rejects.
- `lookFormula(fid)` -> `{id, formula}`; free when already revealed; the paid peek sends `onUPP {gold}` + `onAddMoney gold`.

## Server (`modules/astrology/`)
- `astrology-state.ts` (feature key `astrology`: `cycle, pickUsed, refreshUsed, buyPickCount, starsCollected, starsToPick, revealed, completed`; Go's `magic_array` used the same field names), `astrology-rules.ts` (pure: `enterCycle`, `rollCandidates`, `planPick`, `planRefresh`, `planLook`, `dataOf`; state in, new state out),
  `astrology-records.ts` (in-memory Kỷ Lục feed, per cycle, oldest first, cap 12, lost on restart like Go), `astrology.service.ts` (under `withCharLock`: load + cycle reset -> plan -> conditional unbound `gold` spend -> write (gold refunded on failure) -> `npPnt` credit -> pushes; the first completion per player per cycle is announced with `onSystemSay` "<name> đã hoàn thành Công Thức Nguyên Tố hàng N, nhận được X Năng Lượng Tự Nhiên, thật là may mắn!" (plain text, the Go font tags are dropped)),
  `astrology.rpc.ts`, `astrology.module.ts` (Character + Progression).
- No server level gate (as Go). The strip shows the icon from the seed `data_tbl_activity` row 28 (type 2, flag 50 = level 50); the Flash help text still says level 70: owner to decide which one is right.

## Client (`game/AstrologyController.ts`, `ui/astrology/*`)
Strip icon 28 opens a FeatureWindow (tabs "Năng Lượng" / "Cách Chơi"): six formula rows (hidden ones show "?" tokens + "Xem" with a gold confirm), the 4 collected slots, the 3 lit elements (select, then "Thu thập"), "Làm Mới", free / paid labels, record feed (newest on top), result line, npPnt + gold balances. State follows `onGetAstrologicData`, `onAstrologicStarsRefresh`, `onPickStar`; `busy` guards double clicks; the window redraws on `onUPP`. Pure `astrologyRules.ts` (+ test, run from `server/`).

## Verification (2026-11-12)
- Unit: server `astrology-rules.test.ts` (9), shared `mystery.test.ts` (cycle key flip at 05:00 UTC, formula determinism / sizes, matching, awards), client `astrologyRules.test.ts`.
- ws smoke (two temporary accounts, removed): 12 / 10 free, 3 lit, hidden formulas, lookFormula 0 = 180 gold, free refresh (9 left), first completion (`fid 0, mult 10, aid 90`, npPnt +12 +12 +990 = 1014), observer got the `onSystemSay` announcement, record feed row + revealed formula + collected cleared, repeat completion `mult 1` (+12 +12 +90), paid pick (5 + 2 gold, gold push first), paid refresh 5 gold, bad sid (state pushed), no-gold refresh (state pushed, then refused), no-gold / bad-index look refused, relog keeps the revealed formula.
- Browser: strip icon 28, window renders the six formulas / lit elements / counters, a pick moves a star into the collected row, `Miễn phí Thu thập 11/12`, npPnt 5 -> 17.

## Deferred / values for the owner
- Level gate 50 (seed) vs 70 (Flash text). Formula values differ from Go (own PRNG). Record feed is not persisted. `MC_BIRTH_FLAG[101]` award-multiplier event of Go is not ported.
- Quiet the new RPCs only after the user confirms.
