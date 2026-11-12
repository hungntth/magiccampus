# Ấn Chương (medals) (M13 phase E2, 2026-11-09)

Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (§2.5c, phase E). Research: `docs/research/2026-11-09_04_MEDAL_SEAL_HEART_RESEARCH.md`. Sister notes: `stone-seal.md`, `monster-heart.md`.

## Contract (`packages/shared/src/medal.ts`)
- `MEDAL` consts (bag 1..600, pet 1001..1005 / engrave 1006, char 2001..2005 / engrave 2006, rare q 4), `MedalEntry {i, t, n}`, `MedalInfo {medalExp, medalBag (bag AND worn entries), petBuff {t}, charBuff {t}}`,
  `MoveMedalPush {type, joinTid, petJoinTid, del?, pa, ba}`, `MedalOpPush {medalExp, del?, ba}`, `MedalRow` (H5 catalog row), `MEDAL_TEXT`, `MEDAL_EXP_ITEMS`, pure `medalEngraveLine`, `medalPanelValue`.

## RPCs (all registered WITHOUT `quiet`; mutating ones `forbidInBattle`)
`getMedalInfo()`, `moveMedal(fromSid, toSid)` -> null + `onMoveMedal`, `arrangeMedalBag()` -> bag map, `upMedal(index)` and `breakMedal(index, count, breakType)` -> the op payload (also pushed as `onUpMedal` / `onBreakMedal`),
rare medal (q >= 4) -> the literal `"ban"` + note, H5 `getMedalCatalog()` -> `{medals: MedalRow[]}`. Grant push `updateMedalInBag {i, t, n}`. A refusal shows `onSystemMidMsgOrNote` and rejects.
Dev sources: `/grant medal <id> <n>`, `/grant medalexp <n>`; items 3816 (+25) / 5114 (+125) / 5275 (+2000) credit medal exp (`medal-items.service.ts`). No real income source in H5 yet.

## Server (`modules/medal/`)
- `medal-state.ts` (feature key `medal`, tolerant decode), `medal-rules.ts` (pure plans `planMove / planUp / planBreak / arrangeBag / addMedal / refreshEngrave`, diff-based push payload), `medal-stats.ts`
  (`wornRows`, `medalBonuses`), `medal-pets.service.ts` (PetStatProvider `medal`, owner-wide pet total, `refresh` = `onRefreshPetProp`), `medal.service.ts` (under `withCharLock`), `medal.rpc.ts`, `medal-items.service.ts`, `medal.module.ts`.
- Character side: `MedalBonusProvider` in `stats/growth-providers.ts`. Stats: panel value `prop_val / 100`, flat stats round after summing, rate stats fractional, preflag 1 on prop 1 = percent max HP; the engrave line row is added when
  five distinct basics are worn (stored `charBuff/petBuff` refreshed on every move and on `getMedalInfo`).
- Rules kept / fixed vs Go: slot kind (`row.sid == slot`) and `clevel` are enforced server-side, equip <-> equip refused, an unequip merges onto the same-template stack or the first free slot (never swaps a bag medal into a worn slot),
  equipping takes ONE unit and returns the old worn medal to the bag, level-up reads the next row by (basic id, level + 1) and refuses when the next row's `clevel` is above the character level, same-template stacks merge.

## Client (`game/MedalController.ts`, `ui/medal/*`)
Entry: character panel equipment page, button "Ấn chương" (second tool row). Window: 5 character + 5 pet slots, engrave lines, paged bag (32 x 19), detail box with Trang bị / Thăng cấp / Phân giải (count stepper, confirm for q >= 2) / Tháo, Sắp xếp (5 s throttle),
help tab. Local state follows the pushes and the replies of upMedal / breakMedal (idempotent).

## Verification (2026-11-09)
- Unit: server `medal-rules.test.ts` (9), shared `medal.test.ts` (3), client `medalRules.test.ts` (4, run from `server/`).
- ws e2e (temporary account, removed): catalog 573, refusals (empty slot, wrong slot, max level, rare "ban"), five-medal engrave set -> `joinTid` 296 on the fifth move, magic defence 74 -> 1287 (medal 351 = +1213), upMedal (exp 5000 -> 4500, next-level row),
  breakMedal, arrange, unequip clears the line, relog identical, medal exp items.
- Browser: window opens from the character panel with worn medals + icons, select -> detail, "Trang bị" moves a bag medal into slot 2001.

## Deferred / values for the owner
- Medal sources (boss drops, achievement rewards, shop) are other milestones; pet medals with combo / Miễn giảm / resist lines add nothing to pets (no pet key; Go rounded most of them to 0).
- Client prop names for ids 43..57 / 72 show as `#id`; the rules text of the help tab is a shortened rewrite.
- Quiet the new RPCs only after the user confirms.
