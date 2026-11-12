# Hồn Khí (deco) + Phù Văn (runes) (M13 phase E1, 2026-11-09)

Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (§2.2 deco part, §2.5a, phases B / E). Research: `docs/research/2026-11-09_03_RUNE_DECO_RESEARCH.md`.
Mật Bảo tab: built in phase F (see `mystery-treasure.md`): the 4th tab of this window, and its dissolve is the first real source of runes / chips / Bí Ngân. Out of scope / not built: rune chests (no source in H5 except `/grant`), medals, stone seal, monster heart.

## Contract (`packages/shared/src/{deco,decoText,rune}.ts`)
- `DecoInfo` = `{ "1".."4": DecoPositionInfo }` (`hid`, `did`, `isShow`, `showLvl`, derived `level`, `n`, `r: number[16]` rune ids by slot, `activeFlag {r: open flags, s: {showId: 1|expiry ms}}`).
  Deviation: arrays / objects instead of Flash's `r1..r16` string columns and string `activeFlag` (the client is ours).
- Constants: positions 1 Hoàng Quan / 2 Thánh Quang / 3 Ấn Tích / 4 Pháp Trận, tier unlock hole level 30 / 50, rune slot unlock levels (5,5,10,10,..,50,50), suit 20 % / link 10 %
  (Go-invented), `DECO_RATE_LIMIT_MS 500`. Pure helpers: `decoMaxShowLvl`, `decoRuneSlotOpen`, `decoShowArt`, `decoShowLive/Due`, `runePanelScale/StatValue/PanelText`, `isRareRuneType`, `runeBagOfKind`, `runeHoleBag`.
- Currency `decoSilver` (Bí Ngân, Go id 216) added to `CURRENCY_IDS`; `runeExp` (217) was there. `GrantKind` gained `rune`, `runechip`.
- `AvatarView.deco?: DecoLook[]` ({pos, res, mask}); pushes `onDeco{Head,Light,Foot,Bottom}{Off,On}` = `{cid, pos, decoInfo}` / `{cid, pos, res, mask, decoInfo}` (Off first, then On when equipped + visible).

## RPCs (all registered WITHOUT `quiet`; mutating ones `forbidInBattle`; refusal = `onSystemMidMsgOrNote` + rejected call)
Deco (reply = full `DecoInfo`): `activeDecoShow(id, position)`, `equipDecoShow(id, position)`, `equipOffDecoShow(id, position)`, `showDecoShow(position)`, `hideDecoShow(position)`,
`changeShowLvl(showLvl, position)`, `updateActiveDecoShow(obj)` (not battle-gated: expiry timer), `addDecoHoleLevel(position)`, `addDecoHoleLevelTenTimes(position)`;
`getDecoSuitProp(suitId, linkSuitId, linkId)` -> `{actName, suitIdObj, suitProp[{t,propVal}], actArr, actFlag, linkProp, linkFlag, actLinkSuitFlag, actLinkSuitName}`; H5 `getDecoCatalog`, `getDecoInfo`.
Rune: `getRuneBagData(cid)` -> `RuneBag`, `runeMove(from, to, bagType)` / `arrangeRuneBag(cid, bagType)` -> null + `onRuneBagUpdate`, `runeSet(bagPos, holePos, bagType, decoPosition)` /
`runeRemove(holePos, bagPos, bagType, decoPosition)` -> `DecoInfo` (+ `onRuneBagUpdate`, stats), `runeUpLvl()` -> `RuneBag`, `runeResolve(runeObj, bagType)` -> null + push, `exchangeRune()` -> `{converted, refusedRare}`
+ `updateRuneChipBag` / `onRuneBagUpdate`; H5 `getRuneCatalog` (compact rows, deduplicated names), `getRuneChipBag`. Dev sources: `/grant rune <id> <n>`, `/grant runechip <id> <n>`, `/grant currency decoSilver|runeExp <n>`.

## Server
- `modules/deco/`: `deco-state.ts` (feature key `deco`, tolerant `parseDeco` reading own + Go shapes), `deco-rules.ts` (pure: activate / equip / tier / expiry, `planHoleLevel`, `decoTotals`, `suitReply`),
  `deco-look.ts`, `deco.service.ts`, `deco.rpc.ts`, `deco.module.ts`. Every mutation: `withCharLock` -> pure plan -> conditional spend (`spendMoney('gold')`; hole level-up = `ForgeMoneyService` selected silver + `CurrencyService.spend('decoSilver')`,
  silver refunded when the second spend fails) -> save (refund on failure) -> pushes. Level-up batch: costs per attempt on the current row, failures pay, stops at max / when funds end (first unaffordable attempt = refusal).
- `modules/rune/`: `rune-bag.ts` (feature keys `rune`, `rune_chip`; parsers, stack / move / arrange / resolve / exchange plans), `rune-socket.ts` (socket / unsocket / up-level plans), `rune-stats.ts`, `rune.service.ts`, `rune.rpc.ts`,
  `rune-pets.service.ts` (PetStatProvider `rune` on `PetStatRegistry`, `refresh` = `onRefreshPetProp`), `rune.module.ts`. Sockets live in the `deco` document (`r[holePos - 1]`).
- Stats: `DecoBonusProvider` (hole rows + live shows + full suit + linked suits, flat via `EQUIP_PROP`) and `RuneBonusProvider` (character page, odd holes) in `stats/feature-providers.ts`; pet page = every pet of the owner through `PET_RUNE_PROPS`
  (= pet talent props + 14 / 34 / 71). Rune stat value = panel value (like the war sprite); flat stats round after summing (types 8 / 9 / 13 give ~0 as in Go), rate stats stay fractional.
- Look: `AppearanceService` reads the `deco` document itself (no DecoModule import), adds `av.deco` and `pushDeco(cid, positions)`. Static tables via `GameDataService` (`gamedata/deco-data.ts`): `decoHole/Holes`, `decoShow/Shows`, `decoSuit`, `decoRune/Runes`, `runeChip/Chips`.
- Rules kept from Go (marked): rare rune families (type 14, 61, 59, 60, 62, 63) never convert from chips; one rune per prop type per Hồn Khí and page; filled hole refused; slot unlock levels; suit / link percents.
  Fixed vs Go: slot parity enforced (odd = character bag, even = pet bag), bag room checked before `runeRemove` clears (Go lost the rune on a full bag), everything validated before the first write, refusals toast.

## Client
- `game/DecoController.ts` (created by `CharacterController`; the character panel "Hồn khí" button, formerly wired to the magic weapon window, now opens it; the magic weapon keeps its own "Chức năng" button), `ui/deco/`: `decoWindow.ts` (3 tabs), `lookTab.ts` (shows, wear, visibility, tier, suit box),
  `upgradeTab.ts`, `runeTab.ts` (holes, bag, up-level hole, dissolve mode, chip exchange; click based: select a rune then a hole / "Khảm"), `decoCells.ts`, `decoRules.ts` (+ test, run from `server/`), `deco.css`.
- Look: `game/DecoLayers.ts` inside `AvatarView` (halo above the head, aura behind + mask in front, ground effects below; effect sheets `EFF_PLAYER_1020xx`, 64 of 67 exist); `AppearanceController` handles the `onDeco*` pushes; `Entity.applyScene` sets `av.deco`.

## Verification (2026-11-09)
- Unit: server `deco-rules.test.ts` (9), `rune-bag.test.ts` (9), shared `deco.test.ts` (6), client rules test (4, run from `server/`). Gate: shared 318, server 1444, swf 4, lint clean.
- ws e2e (two temporary accounts, one GM, removed): catalogs 204 / 20 / 1520 / 76, activation (gold 188), refusals, equip -> Off then On to self and an observer, hide / show, tier lock, suit reply + full suit stats, level-up (costs, rate limit, ten attempts,
  max refusal), hole 50 opens 16 slots + tier 3 art, rune bag grant, parity / kind / filled / same-type refusals, socket (+ `onUPP`), pet rune (+ `onRefreshPetProp`, pet HP +187), remove, up-level hole + `runeUpLvl` (exp spent), arrange, resolve (exp credited), chip exchange (2 runes, rare chip kept), relog (`av.deco`, sockets, bag identical).
- Browser: Hồn khí window opens from the character panel, shows / buy confirm / wear / suit box, level-up tab, rune tab (socket, stage + level up, chip exchange). The map halo / ground effect was NOT seen: the browser pane is hidden so Pixi frames do not run; sheets load and are placed (debug log checked).

## Deferred / notes
- Values needing owner confirmation: rune stat convention (panel value, no x100 normalisation like the war sprite), suit 20 % / link 10 %, slot unlock levels, effect anchors (no meta in effect sheets: halo bottom 14 px over the head, aura centred on the body, ground effects centred on the feet; footprints are static).
- Quiet the new RPCs only after the user confirms. Phase F added the Mật Bảo dissolve as a rune / chip source (`RuneService.grantLocked`, lock-free for callers that already hold the character lock); rune chests still have no source except `/grant`.
