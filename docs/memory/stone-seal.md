# Ấn Thạch (stone seal) (M13 phase E2, 2026-11-09)

Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (§2.5d, phase E). Research: `docs/research/2026-11-09_04_MEDAL_SEAL_HEART_RESEARCH.md`. Sister notes: `medal.md`, `monster-heart.md`.

## Contract (`packages/shared/src/stoneSeal.ts`)
- `STONE_SEAL` consts, the client cost tables (`STONE_SEAL_BORE_DUST_COST` ...), `STONE_SEAL_SUCCINCT_CONF`, the 14 x 14 add table `STONE_SEAL_EXTRA` (verbatim `STONE_SEAL_CONF_EXTRA_PROPERTY`), pure `stoneSealBoreCost / SuccinctCost / DiamondColor / AddLine`.
- Wire: `StoneSealData {sid: {lvl, data: {s1..s10}}}` (hole absent = not bored, **0 = bored empty**, > 0 stone template), `StoneSealReply {flag, data, watch, equip, slot, view?}`;
  H5 extension `view: StoneSealEquipView[12]` (equip name / icon, level, bored count, per hole `open, stone, gem, weakened, add`).

## RPCs (all registered WITHOUT `quiet`; mutating ones `forbidInBattle`)
`stoneSealGetData()`, `stoneSealSetStone(equipSid, sealIndex, stoneItemId, tempBagFlag)`, `stoneSealRemoveStone(equipSid, sealIndex)`, `stoneSealRemoveAllStone(equipSid)`, `stoneSealSwapStone(equipSid, i1, i2)`,
`stoneSealBore(equipSid, sealIndex, payMode, diamondItemId)` (payMode 1 gold, 2 dust + Kim Cương), `stoneSealSuccinct(equipSid, payMode)` (1 gold, 3 dust). Every call answers `{flag, data, view}`; a refusal shows
`onSystemMidMsgOrNote` and answers `flag: false` (the Flash handlers check `flag`). Pushes: `onUPP` (stats, gold, currencies), bag slot pushes for stones / diamonds.

## Server (`modules/stoneseal/`)
- `stoneseal-state.ts` (feature key `stone_seal`, decode maps old -1 to 0), `stoneseal-rules.ts` (pure plans, costs), `stoneseal-stats.ts` (`holeFacts`, `sealViews`, `sealBonuses`), `stoneseal-loader.ts` (worn pieces of position 1..12 +
  item facts, models only), `stoneseal.service.ts` (`withCharLock`), `stoneseal.rpc.ts`, `stoneseal.module.ts`. Character stats: `StoneSealBonusProvider` in `stats/growth-providers.ts` (no pet side).
- Stats per hole of a WORN piece: the stone's own jewel line through `EQUIP_PROP` (0 when the gem of the same hole has the same prop) + the add line `V x (gemColour + stoneColour + 2) x succinct[lvl]` summed per prop, `/ 10000`, flat
  rounded after summing, rate props fractional (BUFF props). The hidden Hoàn Mỹ gem +1 % HP of Go is NOT ported (H5 gear gems do not have it).
- Order: validate (pure plan) -> conditional spend (gold `spendMoney('gold')`, dust `CurrencyService.spend('stoneSealPoint')`) -> Kim Cương / stone consumed via `ForgeItemsService.consume` -> save -> refund on a failed write; a stone returned to the bag
  (remove, replace) is room-checked first (`canFitAll`) and handed back after the state is saved.
- Fixes vs Go: replacing an occupied hole works (old stone back to the bag; the client's "Xác nhận đổi bảo thạch đang có?" flow), stones only from the bag (temp-bag flag ignored), the Kim Cương colour must be >= the hole's colour (forge dig rule;
  Go only checked the item type).

## Client (`game/StoneSealController.ts`, `ui/stoneseal/*`)
Entry: character panel button "Ấn thạch". Window: 12 equipment slots, ten hole rows (stone, gem, weakened / add line), bag stone picker, swap marks, inline Khai ấn / Kết ấn cost dialogs (gold / dust, diamond count owned), Gỡ bỏ nhanh, help.

## Verification (2026-11-09)
- Unit: server `stoneseal-rules.test.ts` (7), shared `stoneSeal.test.ts` (4), client `stonesealRules.test.ts` (4, run from `server/`).
- ws e2e (temporary account, removed): worn armour with two gems; refusals (unbored hole, bad pay mode, not a stone, already bored, wrong diamond colour, empty hole, unbored swap, dust short); bore gold (-71) and dust (-60 / -77 + one Kim Cương);
  set 52 -> stone line +4 HP and add line 19800.05 (prop 4, +2 attack); replace (old stone back), swap, remove, remove all; succinct 1..5 with dust 110 / 275 and gold 157 / 751 / 826; relog identical; stored state `{stone: {1: {lvl 5, data: {s1: 0, s2: 0, s3: 0}}}}`.
- Browser: window opens, 12 slots + hole rows render with icons, "Khai ấn" shows the cost dialog (dust 102 / gold 146 for the fourth hole).

## Deferred / values for the owner
- Stone tooltips / the real Flash help text (`STONE_SEAL_PANEL_U[30]`) are a short rewrite; stones have no income source in H5 (`/grant item`, pve drops of Bụi Ấn Thạch come with other milestones).
- Quiet the new RPCs only after the user confirms.
