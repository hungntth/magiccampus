# Equipment depth - Thăng hoa, Khắc chế, Kỳ Linh / Trùng Chú, jewel exchange (M13 phase D, 13.4, 2026-11-09)

Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (phase D, section 12 addendum). Research: `docs/research/2026-11-09_02_EQUIP_DEPTH_RESEARCH.md`
(contract, sources, Go-invented values). Forge basics: `forge.md`. Pet twin of Thăng hoa: `pet-depth.md`. Stats: `character-stats.md`.

## Contract (`packages/shared/src/equipDepth.ts`, `equipSublimeData.ts`)
- Instance state on `character_items.properties`: `sublime {lv, add, el}` (level 0..50, pity percent, element 0..6) and `qiling [{t, v, max} x3]`. Never the legacy `flag`
  string (pet gear still keeps its JSON in `flag`, wings use `properties.wing`). `BagItem.sublime {id, add, element}` (same wire shape as pet gear), `BagItem.qiling`,
  `BagItem.qilingSlot` (0..5 on gear that can take Kỳ Linh: level > 150, kind 1-4).
- Tables / helpers (pure, `equipDepth.test.ts`, 10 tests): `equipSublimeStep` (rate, dust, lines of a level from the generated `EQUIP_SUBLIME_ROWS`; regenerate with
  `pnpm --filter @mc/server exec tsx tools/gen-equip-sublime.ts`), `equipSublimeBlocker`, `equipDisplayColor`, `parseEquipSublime`, `equipSublimeFlag`;
  `QILING_PLANS / SUFFIX / LABELS / MAX / TIERS / COLORS`, `qilingSlotOf`, `qilingEligibleSlot`, `parseQilingLines`, `qilingSetBonusPercent`, `qilingStatValue`,
  `qilingLineText`; `JEWEL_EXCHANGE_GROUPS`, `JEWEL_EXCHANGE_GEMS`.
- RPCs (11, none quiet; mutating ones `forbidInBattle`): `sublimeEquip(equipId, dustId|NaN, autoBuy)`, `onValidateSublime(equipId, dustId)`, `restrainEquip(equipId, dustId|NaN,
  element, autoBuy)`, `onValidateRestrain(equipId, element)` -> `{itemId, flagStr, num}` or null after a refusal note; `getQiLingProp(equipId)` / `getChongZhuProp(equipId)` -> lines or
  `false`; `updateQiLingProp(equipId, "auto"|"")` / `updateChongZhu(equipId, "lock"|"" x3, "auto"|"")` -> `true` (+ push `onQiLingRes(lines)` / `onChongZhuRes({use, cz})`);
  `pmJewelExchage(sid, targetTid, tempBagFlag)` -> `{flag, finalNum, finalNme}`; `isEquSid(sid)` -> bool (coerced; worn item id or worn sid); `checkEquipEdit` -> null (dead in Go).
  Push `validateRestrain(equipId, element)` when the Bụi Ma Pháp is missing and autoBuy (the Yes answers `onValidateRestrain`).

## Server (`server/src/modules/forge/`)
- `equip-sublime.service.ts` + `equip-sublime.rpc.ts` (4 RPCs), `equip-sublime-rules.ts` (candidate / gate glue over the shared pet rules in `sublime-rules.ts`: `planSublime`,
  `rollSublime`, `restrainBlocker`, `planRestrain`), `qiling.service.ts` + `qiling.rpc.ts` (4 RPCs) + `qiling-rules.ts` (roll, reroll, stone plan, `qilingBonusOf`),
  jewel exchange in `mix.service.ts` (`exchangeJewel`), `isEquSid` / `pmJewelExchage` / `checkEquipEdit` in `forge.rpc.ts`. Shared helpers added to `forge-guard.ts`
  (`sendOut`, `flexBool`, `optionalId`), `ForgeMoneyService` mode `'gold'` (plain Vàng), `ForgeItemsService.stackLeft / isWornSid`.
- Every call: validate -> spend gold (conditional `$inc`, refunded when the stone consume fails) -> consume dust / stones by template -> write the state -> push, all under `withCharLock`.
  Dress / wing gear is refused by the existing gates (`equipRow`).
- Stats: `GearBonusProvider` adds the current Thăng hoa row lines per worn piece (`EquipEntry.sublime`, flat, not star-multiplied) and `qilingBonusOf` over every worn
  eligible piece (flat props rounded, rates as points via `BUFF_PROP`, scaled by the set bonus of the full lines). `TierService` keeps `sublime` / `qiling` through a tier upgrade (`keptProperties`).
- Tests: `qiling-rules.test.ts` (7), `equip-sublime-rules.test.ts` (5), `upgrade-rules.test.ts` (+1), `equip-stats.test.ts` (+1).

## Client
- Forge window ("Tạo"): group "Cải tạo" gained Thăng hoa, Khắc chế, Kỳ Linh, Trùng Chú (`ui/forge/equipSublimeTabs.ts`, `qilingTabs.ts`; they extend `PetGearView` with a
  `scope` parameter = bag + worn gear); group "Bảo thạch" gained "Đổi bảo thạch" (`jewelExchange.ts`). Activity strip icon 68 "Kỳ Linh" opens the Kỳ Linh tab
  (`ActivityId.QILING`, `ActivityController.openQiling`, one wiring line in `GameScene`).
- Tooltip (`ui/depthTip.ts`, called by `itemTip.ts`): name suffix "+N", the lines of the current Thăng hoa level, the three Kỳ Linh lines in the Flash colour bands.

## Decisions / deviations
- `equipt_suit` has no character-gear consumer (pet gear and wings only); the set bonus implemented is the Kỳ Linh one. Pet-gear suits are still not ported.
- Sublime element hurt up / down is stored and shown but not applied in combat (unit element numbering to confirm); `sublimeElementBonuses` in `sublime-rules.ts` is ready.
- Colour gate uses `equipDisplayColor` (ColorCode - 1 >= 4); owner to confirm the scale. Go-invented: pity 5 %, dust 10 gold, Kỳ Linh caps / tiers.
- Go's `sublimeEquipMulti` (clientpatch) is not ported (not one of the 11 RPCs).
- Not quiet yet: quiet the 11 RPCs only after the user confirms the feature works.

## Verification (2026-11-09)
- Gate: shared 312 tests, server 1426, swf 4; `pnpm -r lint` clean.
- ws e2e (`depth_smoke.mjs`, one temporary GM account, 52 checks, removed afterwards): surface (`checkEquipEdit` null, `isEquSid` junk false / worn id / worn sid / bag item), refusals
  (non-orange, unbound, missing dust, same / invalid element, all locks, ineligible piece, fashion gate), sublime +1 with the dust left in `num`, pity +5 % stored, gold auto-buy (10 per dust),
  `validateRestrain` confirm flow (5 gold), restrain with dust (1 consumed), Kỳ Linh (3 distinct slot props, stones consumed, 24 gold auto), Trùng Chú (props kept, locked value kept, 11 stones
  for 1 lock), wire view `sublime` / `qiling` / `qilingSlot`, stats (Thăng hoa lv10 = row prop, Kỳ Linh +100 attack, two full lines +2 %), jewel exchange (whole stack, bound, pushes, cross-group /
  same gem / temp bag refused).
- Browser (fresh GM account, removed afterwards): strip icon "Kỳ Linh" opens the tab, Kỳ Linh roll, Trùng Chú with a lock, Thăng hoa +4 (pity reset, toast), "Đổi bảo thạch" (3 gems swapped, chat
  notice), tooltip with "+4", Thăng hoa lines and coloured Kỳ Linh lines.
- Not verified: restrain tab and the "validateRestrain" dialog in the browser (server flow verified by ws), Thăng hoa multi-level (Go clientpatch only), element hurt in combat, tier upgrade
  carry-over end to end (unit test only), orange-line "(Đầy)" colour and the "new line" toast of Trùng Chú in the browser.
