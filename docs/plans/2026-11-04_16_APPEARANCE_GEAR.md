# Appearance & gear depth (M13): avatar layers, dress, wings, equipment depth, gear-side growth systems — Implementation Plan

**Date**: 2026-11-04 · **Status**: Draft (awaiting approval)
**Goal**: make what the character wears visible and deep:
- the avatar shows weapon, dress (Thời trang), wing, flyer, fairy and mount on every client, live (`onEquipOn`, `onSetRes`, `onWingOn`, `onFlyerOn`, flying);
- the dress system (activate, fake dress, recipes, chips, deco holes/runes/show);
- the wing upgrade tree (star, hole, feather, dye/prefix/bind, advance);
- the equipment depth that the forge (M5) left out: restrain / sublime, chongzhu (recast), qiling (spirit), jewel exchange;
- the gear-side growth systems that were deferred in M7/M8: runes, soul gems (Mệnh Hồn), medals (Ấn Chương), stone seal (Ấn Thạch), monster heart (Ma Tâm), mystery treasure (Mật Bảo) + mystery furnace, fairy (Tiểu Tinh Linh), PRS (Chân Hồn Thần Thú), astrology (Năng Lượng Tự Nhiên), rebirth look (`changeRebirthedRes`).

Roadmap: `docs/plans/2026-11-04_11_FEATURE_GAP_ROADMAP_2.md` § M13 (13.1–13.6). Defaults applied: single process; monetization is
ported where seed data exists (gold and bound-gold variants included), real top-up stays "not ready"; no admin dashboard.

Research base (the implementer reads the matching section before each phase):
- Legacy memory (`E:\mcgame\docs\memory\`): `dress-system.md`, `dress-draw.md`, `h5-sprites.md`, `mount-system.md`, `wing-refine.md`,
  `equipment-sublimation.md`, `equipment-modifications.md`, `equipment-tooltip.md`, `monster-heart.md`, `mystery-treasure.md`,
  `fairy-system.md`, `astrology-system.md`, `rebirth.md`, `pet-soul-gem.md`, `stat-feature-foundation.md` (Rune / Stone Seal / PRS /
  Medal / praBuff write-path sections), `h5-growth.md`, `currencies.md`.
- Legacy Go: `internal/presentation/rtmp/handlers/{dress,item,rune,soul,medal,stoneseal,monsterheart,mysterytreasure,mysteryexchange,fairy,prs,astrology,rebirth,scene}` and the
  `internal/application/<feature>/` packages they call. Legacy Flash: `docs/client/` (CreatureView, DecoratePanel, wing / forge panels,
  FairyManagerPanel, PRS*, StoneSeal*, MedalPanel, MonsterHeartPanel, AstrologicPanel, Language.as).
- H5 memory: `character-stats.md`, `forge.md`, `progression.md` (stat providers, currencies, feature store, gmGrant), `stat-features.md`,
  `magic-weapon.md`, `activities.md` (mount), `pets.md`, `swf-tools.md`, `docs/assets-pipeline.md`.
- **Before each phase** the implementer runs one `flash-client-researcher` + one `legacy-server-researcher` pass scoped to that phase and
  writes `docs/research/<date>_<NN>_<PHASE>_RESEARCH.md` (the mechanics below are the confirmed baseline, not every payload field).

---

## 1. Scope

| # | Sub-feature | Legacy RPCs (verbatim) | Pushes | Data (`data_tbl_*` in H5 Mongo) | Legacy memory |
|---|---|---|---|---|---|
| 13.1 | Avatar appearance | `beginFlying` `stopFlying` `fixFlyState` `setDressHide` `setWingHide` (+ equip path `equipOn`/`equipOff` already in H5) | `onEquipOn` `onEquipOff` `onSetRes` `onWingOn` `onFlyerOn` `onFlyerOff` `onFairyOn` `onFairyOff` `onMountOn` `onMountOff` | `equipt_template` (pos 3 weapon `res_code_male/female(2)`, 14 flyer, 21 dress, 22 wing), `class` (`res_code_*2`), `mount_dress`, `fairy_tempalte.rc` | dress-system, mount-system, h5-sprites, rebirth |
| 13.2 | Dress / Thời trang | dress (27): `checkSameDay` `activeDress` `ensureBuyActive` `recieveGoods` `exchangeRecipe` `freeExtractRecipe` `goldExtractRecipe` `tenExtractRecipe` `ssdExtractRecipe` `largessdExtractRecipe` `makeAllChips` `transformRecipe` `transformAllRecipe` `setFakeDress` `unsetFakeDress` `setFakeFlyerDress` `unsetFakeFlyerDress`; deco: `activeDecoShow` `equipDecoShow` `equipOffDecoShow` `showDecoShow` `hideDecoShow` `changeShowLvl` `updateActiveDecoShow` `addDecoHoleLevel` `addDecoHoleLevelTenTimes` `getDecoSuitProp` | dress look sync (`onEquipOn`/`onEquipOff`/`onSetRes`), `onFlyerOn`, `onDeco*On/Off`, `onUPP` | `dress` (94), `deco_hole` (204), `deco_show` (20), `deco_rune` (1520), `rune_chip` (76), `equipt_suit` (250) | dress-system, dress-draw |
| 13.3 | Wings | `wingJoin` `wingSeniorJoin` `addWingStar` `addWingHole` `addWingFeather` `featherMix` `featherDel` `featherUpdate` `getFeatherData` `changeWingColor` `changeWingPrefix` `changeWingBind` `changeWingRes` `onSureChangeWingColor` `sureChangeWingPrefix` `sureChangeWingBind` `newWingAdvanced` `showNewWingPro` `checkLimitWingEffect` `setWingHide` | see §2.3 | `equipt_template` pos 22 (18 rows), item templates of the feathers / wing stones | wing-refine |
| 13.4 | Equipment depth | `restrainEquip` `sublimeEquip` `onValidateRestrain` `onValidateSublime` `getChongZhuProp` `updateChongZhu` `getQiLingProp` `updateQiLingProp` `checkEquipEdit` `isEquSid` `pmJewelExchage` | see §2.4 | `sublimation` (50), `sublimation_pet` (50, M12.4), `recycling_jewels` (108) | equipment-sublimation, equipment-modifications |
| 13.5a | Runes (Phù văn) | `getRuneBagData` `exchangeRune` `runeMove` `arrangeRuneBag` `runeSet` `runeRemove` `runeUpLvl` `runeResolve` | `onRuneBagUpdate` `updateRuneChipBag` `updateDecoInfo` | `deco_rune` (1520), `rune_chip` (76), `deco_hole` | stat-feature-foundation § Rune |
| 13.5b | Soul gems (Mệnh Hồn) | `openBag` `lockSoul` `soulLevelUp` `putInToExp` `transformExp` `transformExpInPanel` `preySoul` `exchangeSoul` `putSoulToBag` `openPetSoulBag` `moveSoul` | `onTransformExp` `onTransAllExp` `onTransformExpInPanel` `onTransAllExpInPanel` (+ §2.5b) | `pet_soul` (840) | pet-soul-gem |
| 13.5c | Medals (Ấn Chương) | `getMedalInfo` `moveMedal` `arrangeMedalBag` `upMedal` `breakMedal` | `onMoveMedal` `onUpMedal` `onBreakMedal` `updateMedalInBag` | `medal` (573) | stat-feature-foundation § Medal |
| 13.5d | Stone seal (Ấn Thạch) | `stoneSealGetData` `stoneSealSetStone` `stoneSealRemoveStone` `stoneSealRemoveAllStone` `stoneSealSwapStone` `stoneSealBore` `stoneSealSuccinct` | Responder `{flag, data}` + `onUPP` | client cost tables (no table) | stat-feature-foundation § Stone Seal |
| 13.5e | Monster heart (Ma Tâm) | `initMonsterHeartData` `monsterHeartSet` `monsterHeartReMove` `openHoleMonsterHeart` `openHoleMonsterHeartJingang` `upgradeMonsterHeartItem` `resolveMonsterHeart` `upgradeMonsterHeartBox` (+ item `oneKeyOpenAllMXTemp`) | `updateMonsterHeartPanel` `updateMonsterHeartBox` `updateMonsterHeartBagByType` `updateMonsterHeartAfterUp` `onUpgradeMonsterHeartBox` `updateMonsterHeartBagByOneKey` | `creatureh_heart` (1938), `creatureh_combine` (1710), `creatureh_contain` (30), `creatureh_point` (35) | monster-heart |
| 13.6a | Mystery treasure (Mật Bảo) + furnace | mysterytreasure (11): `onGetMysBookData` `onGetMysMakeData` `onGetMysBagData` `onGetChipBagData` `getMysTreBuffByKind` `getMysTreBuffSimpleData` `mysTreObjResolve` `onGetMysAddTimes` `addLimitMakeTimes` `makeMysTre` `onGetMakeLimitTimes`; mysteryexchange (2): `MysteryExchangeItem` `MysteryExchangeScore` | `updateMysTreBag` `updateMysTreBook` `updateMysTreMakeTimes` `onActiveMysBookInfo` `updateRuneChipBag` | `mystre` (720), `mystre_recipe` (66), `recycling` (322) + `recycling_extra/_jewels/_all` | mystery-treasure |
| 13.6b | Fairy (Tiểu Tinh Linh) | `initCharFairy` `fairyGrowUp` `fairyRaise` `addFairyExp` `onSkill` `upFairySkill` `fairySkillConfigChange` `changeFairyState` `delFairy` `getFairyResAndList` `setFairyRes` `setFairyResList` | `onUpdateFairy` `onFairyOn` `onFairyOff` `onDelFairy` `onAddFairy` | `fairy_tempalte` (17, legacy typo kept), `skill` (fairy rows), shop 96 | fairy-system |
| 13.6c | PRS (Chân Hồn Thần Thú) | `initPRSPanel` `addSoulTreeLvl` `replacePRSShow` `cancelPRSShow` `activePRSShow` `activePRSShowSpe` `movePRSChip` `exchangePRSChip` `updateActivePRSShow` `freePRSCollect` `goldPRSCollect` `goldPRSCollectThree` `swapPRSChip` `swapPRSChipTimes` | `updatePRSPanel` `updatePRSChipBag` `updatePRSExcBag` `onReplacePRSShow` `onGetPRSChip` | `prs_tree` (50), `prs_show` (22), `prs_chip` (10), `game_tuning_prs_collect` (1) | stat-feature-foundation § PRS, pet-system |
| 13.6d | Astrology (Năng Lượng Tự Nhiên) | `getAstrologicData` `refreshStars` `pickStar` `lookFormula` | `onGetAstrologicData` `onAstrologicStarsRefresh` `onPickStar` `onAddMoney` | none (formulas generated per cycle) | astrology-system |
| 13.6e | Rebirth look | `changeRebirthedRes` | `onSetRes` | `class.res_code_*2`, `equipt_template.res_code_*2`, quest 1946 | rebirth |

Out of the milestone (already elsewhere): Train soul (`trainSoul`, M7 `feature/soul.*` — not the same "soul" as 13.5b), praBuff (M8),
mount riding (M8; only the mounted sprite is in 13.1), pet equipment restrain/sublime (`restrainPetEquip`, M12.4).

---

## 2. Confirmed mechanics

Sources: two read-only research passes on 2026-11-04 (appearance + dress; wings + equipment depth) and the legacy memory docs + Go code for
§2.5–2.6. File refs are relative to `E:\mcgame` (`internal/...` Go, `docs/client/...` Flash). Asset counts were measured on this repo's
`client/public/sheets` and `server/resmap.json` the same day.

### 2.1 Avatar appearance (13.1)

Flash `CallBack.as` is a decompile stub; push behaviour comes from `CreatureView` / `DynamicItemContainer` / `Creature` and the bytecode notes in
`dress-system.md`. Go: `application/item/appearance.go`, `appearance_dress_sync.go`, `application/scene/service.go:255-360`, `handlers/scene/movement.go:306-401`.

**Payload fields** (scene row `GetCharacterForClient`, login `cData` via `CharacterAppearance.Apply`):
`resCode` (string body: class body, `res_code_*2` when the reborn body shows, transform buff overrides), `wp` (weapon res string, `"0"` none),
`star`, `dressResCode` (int; `-2` scene / omitted login = none, hidden or transform), `flyerResCode` + `flyerFrontResCode` (`wav_code`; `"0"`),
`wingResCode` (int, 0), `mountResCode` (int, 0), `isFlying`, `doubleFly:false`, `colorCode`, `ee/ef/en`, `decoInfo`, `fairy`, `equiptList`.
Login adds `dressInfo` (JSON string), `shishangdian`, `GLOBAL_SETTING.dressHide/wingHide`. Equip positions: weapon 3, flyer 14, dress 21, wing 22.
Resource picker: gender 1 → `res_code_female`, else `res_code_male`, then `res_code`, then the `*2` columns (`appearance.go:341-368`).

**Pushes** (self + scene unless noted):

| Push | Args | When |
|---|---|---|
| `onEquipOn` | `{cid, resCode, ee, ef, star, dressFlag}` | weapon (`dressFlag false`) / costume (`true`, visible costume res) |
| `onEquipOff` | weapon `{dressFlag:false, colorCode, cid, resCode}`; costume `{cid, resCode: body or -1, colorCode: class color_code_*1, dressFlag:true}` | unequip |
| `onSetRes` | `{id, res}` | last push of every dress look sync, rebirth toggle, VIP transform |
| `onWingOn` / `onWingOff` | `{cid, resCode}` / `{cid}` | wing equip/unequip, `setWingHide` |
| `onFlyerOn` | `{cid, resCode, wavCode?}`; removal = `{cid, resCode:-1, wavCode:-1}` (Flash has no flyer-off callback, `flyer_off.go:153-164`) | flyer equip / fake flyer |
| `onBeginFlying` / `onStopFlying` | `{id}` | flying toggles |
| `onMountOn` / `onMountOff` | `{cid, resCode, isMountOn, wp, ee, ef, en, star}` | mount (already in H5) |
| `onDeco{Head,Light,Foot,Bottom}{Off,On}` | `{cid, decoInfo}` | Hồn Khí look (Off first, then On when `did > 0 && isShow == 1`, `deco_appearance.go:39-65`) |
| `onFairyOn` / `onFairyOff` | `{cid, fairy:{resCode}}` / `cid` | guarding fairy (13.6b) |

Dress look sync (`appearance_dress_sync.go:426-478`, after equip/unequip of position 21, `setDressHide`, `setFakeDress`, `unsetFakeDress`):
visible costume → `onEquipOn(dressFlag true)`, `onSetRes`; none visible → `onEquipOff(dressFlag true)`, `onEquipOn(dressFlag false)` with the weapon
if armed, `onSetRes`. Reason: every scene entry rebuilds the view from `dressResCode`, so `onSetRes` alone left a stale costume after a map change.
Resolution (`ApplyDressStateToAppearance`, `appearance.go:146-223`): no costume or `dressHide` → no costume; the fake dress replaces the costume
only while a costume is worn and visible; the fake flyer replaces the flyer only while a flyer is worn; transform buff hides the costume.

**Composition** (Flash `CreatureView.as`): every layer is a `CharactorGraphic` loaded from `<res>_NEW.swf` inside `_body`.
- The **costume replaces the body** (`setRes(dressResCode)`, no separate layer; costume art = `creature/NPC_CRE_200xxx`, same labels as the body).
- The **weapon is drawn only on the default or reborn class body** (`equipOn` 7129, `isDefaultRes` 10003, `isRebirthRes` 9821): a costume or a
  transform hides it, and the mount too (`mountOn` 10554-10560).
- Z-order bottom → top: Hồn Khí foot/aura (`_tepe_cg`) → mount (`_mount_cg`; `_mount_front` on top) → flyer (`_flyer_cg`) → **wing behind the
  body for dir 0, 1, 7** (10289-10291) → body → wing in front for the other directions (10293-10302) → weapon → flyer front (`wav_code` art,
  only while flying, 8056-8091) → halo (Hồn Khí Hoàng Quan).
- Wing placement: clip at `(-midX, -footY)` then `coordinateWingPos` (10240-10303) with per-body offset tables `WING_CLASS_OFFSET`,
  `WING_RUN_OFFSET`, `WING_MOUNT_CLASS_OFFSET`, `WING_MOUNT_RUN_OFFSET` (CreatureView.as:62+); mounted `y -= MOUNT_DRESS_HEIGHT` (35). The stock
  gate "no wing without an offset row" hid wings on newer costumes and was patched out in the legacy client: **H5 does not copy the gate**
  (default offset 0). The wing is hidden while the body plays Dead (7411-7430).
- Behaviours: 0 breath … 7 magic, 8–10 mount breath/runFast/run; flying: `_flyer_cg.behavior = behavior % 8`, the rider plays breath instead of run.

**Flying** (`object/Creature.as:160-400`, Go `movement.go`, `flight_group.go`, `flight*.go`):
- `beginFlying()` (no args): level ≥ 50 and a flyer worn, else `onMidNote "Cần trang bị phi hành và đạt cấp 50 mới có thể bay"`; group leader
  with a member lacking a flyer → "Thành viên <name> chưa trang bị phi hành, cả nhóm không thể bay"; map `flyable != 1` → "Bản đồ này cấm bay.";
  5 s cooldown between toggles → `onRedMsg "Vui lòng đợi 5 giây sau khi cất cánh / hạ cánh rồi thử lại."` (owner rule). Success persists the
  state and broadcasts `onBeginFlying {id}`, then syncs non-AFK group members on the map.
- `stopFlying()`: cooldown only; the client first walks to a legal cell (`landToSafeArea`). `fixFlyState()`: a non-leader member is forced to the
  leader's state (also sent once at first login); reply `null`.
- Client: `onBeginFlying` tweens `_body.y` by `FLIGHT_HEIGHT 100`, zoom 0.7 self / 0.9 others (setting `flyEffect`), states 0 ground … 5 double fly.
- Login: `isFlying` = flyer worn, kept only when level ≥ 50, the map is flyable and the player did not land before logout.

**Hide flags**: `setDressHide(hide)` → bool, persists, runs the dress look sync (`item/misc.go:130-176`); `setWingHide(hide)` → bool or `-1`
(the client unticks on -1), pushes `onWingOff` / `onWingOn` (`item/wing_hide.go:224-258`). Strings `CHARACTORPANEL_S[56]` "Chọn ẩn bộ thời
trang", `[53]` "Phi\n hành", `[54]` "Thời\n trang".

### 2.2 Dress / Thời trang + Hồn Khí (13.2)

The 27 `handlers/dress` RPCs = 17 dress + 10 deco, all live (`handler.go:67-95`). Panel `PANEL_DRESS` 926 from `CharactorPanel` (CharactorPanel.as:3613);
Hồn Khí = DecoratePanel (tabs "Hồn Khí", "C.Hóa H.Khí", "Phù Văn", "Mật Bảo": runes 13.5a and Mật Bảo 13.6a live there).

**State** (`domain/dress/info.go:14-26`): `book {dressId:1}`, `recipe {recipeId:count}`, `bag {crystal, jewel}`, `extract` (free draws used today),
`score` (Điểm thưởng), `fakeDressId`, `fakeFlyDressId`, `day`. Replies are the client string `{"book","recipe","bag","extract","score","fakeDressId","fakeFlyDressId"}`
(`DressLogic.updateDressInfo`); H5 sends the object (the client is ours) and keeps the field names.

| RPC | Args → reply | Rule |
|---|---|---|
| `checkSameDay` | → dressInfo | daily reset of `extract` (**UTC+7 day key** in H5; Go used UTC) |
| `activeDress` / `ensureBuyActive` | `(dressId, autoBuy)` / `(dressId)` → dressInfo | needs `recipe[dress.recipe_id] ≥ 1`; costs `num1` Pha Lê Ma Pháp (75) + `num2` Bảo Châu Vĩnh Hằng (15) from `bag`; shortfall with autoBuy = 1 / 5 gold each (`DRESS_CRYSTAL_PRICE/JEWEL_PRICE`, GamePredef.as:6809-6810), unbound gold; then `book[id] = 1`, `onUPP` stats; notice "Tiêu hao N vàng." |
| `recieveGoods` | `(dressId)` → dressInfo | activated only; mints the bound equipment `dress.equipt_id`; "Nhận được <name> x1" / "Không đủ ô trống." |
| `exchangeRecipe` | `(recipeId)` → dressInfo | `recipe.money` Điểm thưởng → +1 set recipe; **H5 validates `type 1`, `is_open`, `money > 0`** (Go let a chip id add score) |
| `freeExtractRecipe` | → `{dressInfo, recipeId, recipeNum}` | 1 a day, no score |
| `goldExtractRecipe` / `tenExtractRecipe` | → `{…, recipeId, recipeNum}` / `{dressInfo, planArr[11]}` | 30 / 288 gold, `score += cost`; ten = 10 chips + 1 set |
| `ssdExtractRecipe` / `largessdExtractRecipe` | same | 300 / 2880 Điểm Thời Thượng (`shishangdian`), no score; players have no income of it |
| `makeAllChips` | → dressInfo | each chip with count ≥ `num` (10) → `floor(count/10)` × `product`; "Ghép thành công" |
| `transformRecipe` / `transformAllRecipe` | `(recipeIds[])` → `{…, recipeId, recipeNum}` / `{dressInfo, produceArr}` | 3 set recipes (same or different) → 1 random set; "Không đủ công thức để chuyển bộ." |
| `setFakeDress` / `unsetFakeDress` | `(dressId, resCode)` → dressInfo | look sync (§2.1); **H5 checks `book[dressId]` and `type 1`** (Go stored anything) |
| `setFakeFlyerDress` / `unsetFakeFlyerDress` | `(dressId, resCode, wavCode)` → dressInfo | `onFlyerOn` with the template res/wav; H5 checks `type 2` and `book` |
| `activeDecoShow` / `equipDecoShow` / `equipOffDecoShow` | `(id, position)` | buy (`deco_show.active_gold`, 188–2188 gold; 0 = event only) / wear / remove a Hồn Khí look; appearance pushes + `onUPP` |
| `showDecoShow` / `hideDecoShow` / `changeShowLvl` | `(position)` / `(showLvl, position)` | toggle; look tier 2 at hole level 30, 3 at 50 |
| `updateActiveDecoShow` | `(obj)` | expiry by the server clock (all seed rows are permanent) |
| `addDecoHoleLevel` / `addDecoHoleLevelTenTimes` | `(position)` | per attempt `deco_hole.cost_num` Bí Ngân (`decoSilver`) + `cost_sil` silver (by `selectedMoneyType`), success `rand(100) < rate` → `next_id`; failures pay; 4 positions × levels 0..50 (lv0: 35 / 500 000 / 100 %, lv49→50: 530 / 25 000 000 / 30 %); 500 ms rate limit |
| `getDecoSuitProp` | `(suitId, linkSuitId, linkId)` → `{actName, suitIdObj, suitProp, actArr, actFlag, linkProp, linkFlag, actLinkSuitFlag, actLinkSuitName}` | `suitProp`/`linkProp` must be arrays of `{t, propVal}` (client #1069 otherwise) |

- **Draw pools** (`draw_rules.go`): chips = `recipe type 2`, sets = `type 1` with `is_open > 0`, weights 100 normal / 9 rare (Go, confidential per
  dress-draw.md; the client text claims 51.6 % purple / 48.4 % orange). A rare set is announced server-wide. `data_tbl_recipe_plan` is not used by dress.
- **Stats** (`application/dress/bonuses.go:19-71`): every activated dress (fashion and flyer) adds `prop1..4/prop_num1..4` (seed: HP / Công VL /
  Công MP / Tốc = 100/25/25/10 purple, 200/50/50/20 orange), flat before percents. Worn fashion/flyer items add their normal equipment lines;
  they cannot be starred, holed, socketed or upgraded ("Thời trang và vật phẩm bay không thể thăng cấp / thăng tinh / đục lỗ / khảm nạm.") and
  have no durability loss. Deco: each position's hole row props + live show pieces + full suit (+20 % of the suit's HP/Công VL/Công MP) + linked
  suits (+10 %), both Go-invented.
- **Data**: `dress` 94 (72 fashion 1001–1072, 22 flyer 2001–2022), `recipe` 187 (94 sets, 93 chips), `deco_hole` 204, `deco_show` 20 (5 suits × 4),
  all imported (generic `import-seeds.ts`). The Flash panel read these tables locally; H5 sends the needed rows in an H5 catalog reply
  (`getDressCatalog`, H5 name, like `getAchieveList`).
- **Strings** (DRESS_PANEL, Language.as:7772-7823, 9432-9440): [0] "Tủ Đồ", [1] "Tổng Quan","Kích Hoạt","Rút Bộ","Chuyển Bộ", [3] "Thời trang
  ({activeNum}/{totalNum})", [4] "Vật phẩm bay ({activeNum}/{totalNum})", [5] "Kích hoạt", [6] "Nhận thời trang", [10] "Thuộc tính gia tăng",
  [11] "HP + {hp}\nCông VL + {phAtt}\nCông MP + {mgAtt}\nTốc + {sp}", [13] "Rút miễn phí", [14] "Dùng vàng rút", [15] "Rút 10 lần", [20] "Điểm
  thưởng：{score}", [25] "Pha Lê Ma Pháp：{crystal}  Bảo Châu Vĩnh Hằng：{jewel}", [29] "Tự mua Pha Lê Ma Pháp,Bảo Châu Vĩnh Hằng", [34] "Bộ này đã
  kích hoạt", [35] "Chưa kích hoạt, không thể nhận", [36] "Kích hoạt cần {money} vàng, xác nhận?", [45] "Xác nhận mất 30 vàng để rút thưởng?";
  DressDisplay "Hình ảnh ảo hoá" / "Bỏ ảo hoa". DECORATE_PANEL [0] "Hồn Khí Vương Tộc", [19] "Cường Hóa Hồn Khí", [27] "Bí ngân cần：", [28]
  "Ngân phiếu cần：", [35] "Cường hóa", [36] "Cường hóa 10 lần", [57] "Cấp độ Hồn Khí đạt cấp 30 có thể sử dụng hình dạng Lv2", [62] "Hình dạng
  này không thể dùng vàng kích hoạt, chỉ nhận được thông qua sự kiện", [63] "Xác nhận mất {num} vàng kích hoạt hình dạng này?". Server toasts:
  "Không đủ vàng để kích hoạt hình dạng này!", "Hình dạng này chưa được kích hoạt!", "Không đủ Bí Ngân!", "Không đủ Ngân phiếu!".
- **Go bugs not ported**: unvalidated `exchangeRecipe` and fake dress; UTC day; silent refusals (`nil, nil` → H5 sends a toast for every refusal);
  `context.Background()`. Kept from Go: `recieveGoods` repeatable (open question 10); crystals/jewels only via autoBuy (no item source found).

### 2.3 Wings (13.3)

Paths: `H` = `internal/presentation/rtmp/handlers/item/`, `A` = `internal/application/item/`, `D` = `internal/domain/item/`.

- **Item**: equipment kind 13, type 1300, **position 22** (sid 22); 11 templates (1674 test, 1675 Ánh Sáng, 1676 Thiên Sứ, 1677 Ác Ma, 1678 Bích
  Không, 1681 Chiến Thần, 1911, 1923/1930/1931 Khổng Tước), all `color = -1`, `hole_num 0`, req Lv 70, `bind_prop_num 6`, lines main 11/1, sub 6/7.
  The colour is instance-only: `ColorCode = displayColour + 1` (0 white … 4 orange) (`A/wing_rules.go:17-18, 89-94`). A wing granted without a
  colour is white.
- **State on the instance**: `star` + `upgradeNum`, holes `t1..t10` (missing/-1 undrilled, 0 empty, > 0 feather template id; **odd = character,
  even = pet**, drilled alternately character first, `A/wing_rules.go:137-148`), `wingLevel`, `wingExp`, `wingLook` 0..2, `wingDye<i>`, bind.
  `holeNum` code on the wire = tens character holes + units pet holes, max per colour `{22,22,22,33,55}` (= 4/4/4/6/10 holes); the client
  rejects codes where char < pet or char - pet > 1 (WingFuncPanel.as:7181+). The DTO also carries `flag: "level:N"`.
- **Look**: `res_code 20703900SSSVVV`. For `code % 1000 == 1` the variant is 001 white/green/blue, 002 purple, 003 orange. Orange wings of series
  001–004 have three looks [base, Lv5, Lv10] (series pairs `{1:{7,60}, 2:{9,47}, 3:{6,35}, 4:{8,41}}`); index 1 needs wing level ≥ 5, index 2 ≥ 10
  (`A/wing_res.go`). Push `onWingOn {cid, resCode}` / `onWingOff {cid}` to self + scene (`H/appearance.go:68`); scene/login field `wingResCode`.
- **Stats** (`aggregateWingStats`): instance lines (main × star multiplier `[1, 1.1, 1.21, …]`, sub raw) + level extra `int(line × (WING_PRO_TOTAL_ADD[L-1] - 1))`
  with `WING_PRO_TOTAL_ADD = {1.03,1.08,1.15,1.24,1.34,1.45,1.57,1.70,1.84,1.99}` + odd-hole feathers (`FEATHER_PROP` 1..22 map,
  `A/wing_feather.go:116-165`; type 1404 = percent, float props as floats, else flat). Even-hole feathers feed every pet of the wearer
  (`A/wing_pet_feather.go`) and push `onRefreshPetProp`. Wings never go through gem stats.
- **Rolls**: `RollWingProps(tpl, colour)`: each line = template × uniform in the `EQUIPT_QUALITY` range of quality `{0,5,10,15,20}[colour]` (already in
  H5 `quality-roll.ts`); bind lines 0..`round(6 × rangeHigh)` (purple 13, orange 21), readers clamp at 21.

| RPC | Args → reply | Rule (Go) |
|---|---|---|
| `wingJoin` | `(mainId, {w1..w4})` → `{f, i, n:DTO, e, sid}` | subs = 4 owned, unworn wings of the main's colour (0..3); 1675 only with 1675. Rate `WING_JOIN_SUCCESS[c] {100,80,50,30} − 5 × (subs with another tid)`, + VIP right 9 for purple→orange. Subs consumed before the roll. Success: colour+1, tid = main if all subs share it else uniform of the 5, props re-rolled, any bound input binds. Purple/orange result → server-wide `onSystemSay` (CALLBACK_S[28]) |
| `wingSeniorJoin` | `(mainId, [subIds])` (array may be `{"0":id}`) → same | main blue or purple, 4..10 (blue) / 4..16 (purple) subs of the same tid and colour; rate tables `{4:50 … 10:100}` / `{4:30 … 16:100}` (`A/wing_rules.go:55-59` = GamePredef.as:9939-9948); no VIP bonus |
| `addWingStar` | `(count 1..5, wingId, stoneId, upToNum)` → `{equSlotId, itemSlotId, num, upgradeNum, flag}` | stone 2906 × count, no silver, max 10; rate `WingStarSuccess[star+1] × count / 5` (100,100,90,80,70,60,50,30,30,30); failure drops the star (0-5 → -1, 6 → 4, 7 → 5, 8-9 → 0, owner rule 2026-10-25); `upToNum > 0` = auto until reached or out of stones |
| `addWingHole` | `(wingId, materialId)` → `{f, i, h:newCode, ii, n}` | bound wing, below the colour cap; item 2907 × `{1,5,25,125,625}[holes of that parity]` + 50 000 silver; 100 % |
| `addWingFeather` | `(wingId, {"1".."10": {idx, flag}})` → count inlaid | hole drilled and empty, feather colour ≤ wing colour, per parity budget A/B/C = 1, D = 2, no duplicate stat; 100 %; bound feather binds the wing; refusals as `onSystemMidMsgOrNote` |
| `featherDel` | `(wingId, index)` → bool | `FEATHER_DEL_MONEY[colour] {25 000, 125 000, 700 000, 4 500 000, 40 000 000}` silver; bag-fit check first; feather returns bound; wing becomes bound |
| `featherUpdate` | `(featherIdx, luckSid|-1, luckCount, once, tempBagFlag)` → `{slotId, num, lSid, lnum, flag, finalNum}` | 5 same feathers per try (lost on failure), rate `{100,90,75,55}[colour] + 5 × luck` (item 3021), product `next_jewel_tid`, bound if any input bound |
| `featherMix` | `(formulaRef, {"1":ref,"2":ref}, luckId, luckCount, luckBinded)` → `{f, fid, fnum, i, lid, lnum}` | formula = item kind 14 type 1400 (16 rows); rate 60 % (2-stat product) / 30 % (3-stat) + 10 × luck (3017); all inputs consumed on both outcomes; `fid -1` bad input, `-2` luck error |
| `getFeatherData` | `(wingId)` → wing DTO | panel hole grid |
| `changeWingPrefix` / `sureChangeWingPrefix` | `({e, i})` → `{f, sid, i, n:{lines}, ii, inum}`; `(1|-1)` → `{f:"sure", i, n, e}` / `{f:"false"}` | bound purple/orange, item 2937 × `{3:5, 4:15}` + 50 000 silver, paid at preview; pending roll kept server-side |
| `changeWingBind` / `sureChangeWingBind` | `(wingId, materialId)` → `{f, ii, n, b1, b2, b11, b12, mainProp1, mainProp2}`; `(1|-1)` → `{f:"sure", b1, b2}` | bound, colour ≥ blue, item 2843 × 10 + 30 000 silver; each bind value uniform 1..21 |
| `newWingAdvanced` / `showNewWingPro` | `(useCrit, mode)` / `()` → push `onShowNewWingPro(state)` (no responder) | equipped bound wing ≥ purple, level < 10; one 3627 "Linh Vũ" = 10 exp; crit charm 3628 ×2/×5/×10 at 70/25/5; level exp `{100,200,300,500,700,1000,1300,1700,2200,2800}` (halved for 1675); mode 2 = until next level. `buyCritItem(n)` buys 3628 at template gold (10) Vàng only and pushes `updateCritItemNum {num1, num2}` |
| `changeWingRes` | `(index 0..2)` → `{flag, newResCode}` | look selection per the level gate; refusals "Cánh không đủ cấp đổi hình dạng" / "Chỉ có cánh cam mới mới có thể đổi hình dạng!" |
| `changeWingColor` / `onSureChangeWingColor` | NPC 1502 script `dye_wings_orange` → push `sureChangeWingColor(10, 1502)`; `changeWingColor(1502)` → push `showWingColorPanel([{color, res}, {…}])`; `onSureChangeWingColor(series)` → bool | equipped orange Thiên Sứ / Bích Không / Ác Ma (series 2/3/4), 10 × item 3677 "Lông Vũ Ngũ Sắc"; 2 random palette series ≠ current; stored as `wingDye<look>` |
| `setWingHide` | `(hide)` → bool | persisted flag; pushes `onWingOff` or `onWingOn` to self + scene; login `wingHide` |
| `checkLimitWingEffect` | timer call, null responder | dead in Go (`{hasWing:false}`): H5 replies `null` |

Vietnamese strings (WING_PANEL_U, verbatim): [19] "Dung hợp thành công", [10] "Dung hợp thất bại!", [7] "Màu sắc cánh không phù hợp!",
[8] "Vui lòng đặt cánh cùng loại", [50] "Đục lỗ cánh thành công", [52] "Số lỗ của cánh phẩm chất này đã đạt giới hạn", [63] "Thành công thăng cấp
{finalNum}Lông Vũ!", [64] "Thăng cấp lông vũ thất bại", [73] "Khảm nạm thành công{successNum}Lông Vũ!", [75] "Xác nhận mất{silver}bạc để
bỏ:{name}(sau khi bỏ sẽ thành thuộc tính khóa)?", [36] "Tái thiết lập thuộc tính thành công", [48] "Chỉ có cánh tím và cam mới có thể tái thiết
lập thuộc tính", [41] "Đổi thuộc tính khóa thành công", [39] "Cánh cần phải khóa", [141] "Đã là cấp cao nhất", [143] "Sau khi chọn thăng cấp
cánh, màu cánh trước đó sẽ mất, xác nhận thăng cấp cánh?"; WING_COLOR_PANEL[0] "Nhuộm cánh cần {num} Lông Vũ Ngũ Sắc, xác nhận tiếp tục?".
Go-invented: silver costs (prefix/hole 50 000, bind 30 000), the star-failure drop, the VIP join bonus, the level exp table, the 10-exp item rate
and the crit odds.

### 2.4 Equipment depth (13.4)

**Sublime (Thăng hoa)** — `data_tbl_sublimation` (50 levels: `rate`, `item_num1` attack / `item_num2` defence, `prop1..4`, `prop_num1..4`,
`element_num`); pet twin `data_tbl_sublimation_pet` (M12.4).
- Eligible: bound, not fashion/flyer/wing, template `req_level ≥ 50`, prefix tier ≥ 5, display colour ≥ 4 (orange); max level 50 (`D/sublime.go`).
  Attack positions `{3,6,7,8,9,11}` use `prop1/2` + `item_num1`, the others `prop3/4` + `item_num2` (EQUIP_FUNCTYPE, GamePredef.as:9836-9855).
- State: `sublimeId` 0..50, `sublimeAdd` (pity %), `sublimeElement` 0..6 (Go stored them in the instance `flag` JSON, which collides with the wing
  `level:N`; H5 uses dedicated instance fields).
- `sublimeEquip(equipId, dustSlotId|NaN, autoBuy)` → `{itemId, flagStr, num}`: needs `item_num` × dust 4841 "Bụi Vô Hạn"; missing dust is bought
  at 10 Vàng each when `autoBuy` (gold only, Go-invented price). Rate `min(100, row.rate + sublimeAdd)`; success → level+1, `sublimeAdd = 0`, the
  first success rolls `sublimeElement` 1..6; failure → `sublimeAdd += 5` (Go-invented). Notice "Thăng hoa thành công, trang bị đạt +%d" /
  "Thăng hoa thất bại, tỉ lệ thành công lần sau +%d%%". `onValidateSublime(equipId, dustSlotId)` = the same with `autoBuy` forced.
- Stats: the current row's props (not a running sum). Combat: Σ `element_num` per element → attack pieces raise damage against that element,
  defence pieces reduce damage from it: `× (1 + up[defenderElement]) × (1 − min(down[attackerElement], cap))` (needs the element of each unit, see risks).
- **Restrain (Đổi khắc chế)** `restrainEquip(equipId, dustSlotId|NaN, element 1..6, autoBuy)` → same reply: only changes `sublimeElement` of a
  sublimed item; 1 × 4842 "Bụi Ma Pháp" or 5 Vàng; without dust and with `autoBuy` the server first pushes `validateRestrain(equipId, element)` and
  the client confirms with `onValidateRestrain(equipId, element)`. Elements: 1 Quang, 2 Ám, 3 Phong, 4 Địa, 5 Thủy, 6 Hỏa.
- Strings: EQUIPTFUNCPANEL_S[163] "Trang bị đã đạt cấp thăng hoa cao nhất", [164] "Không đủ Bụi Vô Hạn", [173] "Không đủ Bụi Ma Pháp",
  [174] "Đổi nguyên tố sẽ mất {money}vàng, xác nhận tiếp tục?"; U[246] "Điều kiện：\n1.Trang bị phải khóa\n2.Cấp độ trang bị>=50\n3.Phẩm chất
  trang bị là trác việt cam", [248] "Thăng Hoa", [260] "Đổi khắc chế", [264] "Chọn Nguyên Tố khắc chế：".

**Qiling / Chongzhu (Kỳ Linh / Trùng Chú, QiLingPanel, PANEL_QILING 971, activity 68)**
- Eligible: template `req_level > 150`, kind 1–4; slot index by kind/type (weapon 0, necklace/ring 1–2, armour pieces 3–5, `D/qiling.go`).
- State: three lines `{"0":{t,v,max}, "1":…, "2":…}` (Go `Properties.flag2`).
- `getQiLingProp(equipId)` / `getChongZhuProp(equipId)` → the lines or `false` (**never** `null`: the client keeps the button disabled until the responder runs).
- `updateQiLingProp(equipId, "auto"|"")` → `true`, then push `onQiLingRes(lines)`: 4 × stone 5974 "Kỳ Linh Thạch" (or 6 Vàng each with auto); 3 new
  distinct props from the slot's candidate plan (weights in `D/qiling_roll.go`), values over `[max/10, max]` by tier weights 20/130/250/400/200.
- `updateChongZhu(equipId, lock0, lock1, lock2, auto)` → push `onChongZhuRes {use, cz}`: cost `6 + 5 × locks` stones; keeps the props and re-rolls the
  unlocked values (owner rule 2026-10-24); "Chúc mừng bạn đã tạo ra 1 dòng thuộc tính mới." when a line hits max.
- Stats: all worn lines; set bonus by the number of full lines `{2: 2 %, 4: 5 %, 6: 8 %, 8: 12 %, 10: 16 %, 12: 20 %}` (QILING_PANEL[15-20]).
  Caps and tiers are Go-invented; the "max 2 Kỳ Linh items worn" text (QILING_PANEL[22]) is not enforced in Go.
- Strings: QILING_PANEL[1] "Trang bị đã đầy dòng thuộc tính, xác định Kỳ Linh lại từ đầu?", [2] "Dòng thuộc tính chưa khóa, xác nhận Trùng Chú?",
  [5] "Không", [10] "Kỳ Linh Thạch không đủ tự động mua (6 vàng 1 cái)", [23] "Kỳ Linh", [24] "Trùng Chú", [25] "Trang bị không phù hợp".

**Jewel exchange** `pmJewelExchage(sid, targetTid, tempBagFlag)` → `{flag, finalNum, finalNme}` (client typo kept): the whole stack of a Thượng Hạng
(55–59) or Hoàn Mỹ (60–64) gem becomes the same count of another gem of the same group, bound, free. Go drops the source before adding the
target (stack lost on failure): H5 adds first. Strings JewelExchage [3] "Đổi thành công {num} {name}", [4] "Đổi thất bại".

**Helpers**: `isEquSid(sid)` → bool (tooltip "Nhấp đôi để tháo gỡ" / "Nhấp đôi để mặc"; coerce with `Number`, Go panicked on a non-number);
`checkEquipEdit(mode)` is dead in Go → H5 returns `null`.

### 2.5 Gear-side growth systems (13.5)

**a. Runes (Phù văn)**: socketed into the dress **deco holes** (13.2), so this needs phase B first.
- State (Go `FeatureRune`): `{chaBag:{slot:{n,r}}, petBag:{slot:{n,r}}, upLvlHole:runeId}`; chip bag (`FeatureRuneChip`) `{bag:{slot:{chipId,num}}}`
  (`application/rune/rune_bag.go`, `service.go`). Bag keys are **0-based** after `arrangeRuneBag` (RuneBag.as).
- `getRuneBagData` → Responder rune bag. `runeMove(fromBagPos, toBagPos, bagType)` (`-1` = the up-level hole, bagType 0 char / 1 pet) and
  `arrangeRuneBag(cid, bagType)` → push `onRuneBagUpdate` (full runeInfo).
- `runeSet` / `runeRemove` move one rune between the bag and the dress-owned deco-hole state. Hole positions are **1-based**: character runes on
  odd `holePos` 1,3..15, pet runes on even 2..16 (`application/rune/rune_actions.go:6-24`, DecoratePanel.updateDecoRuneProp). Reply: the full
  `decoInfo` echoed through `updateDecoInfo`.
- `runeUpLvl`: the rune staged in `upLvlHole` moves to `deco_rune.next_id` when `runeExp ≥ up_exp`; `up_exp` is spent; `next_id ≤ 0` = max.
  `runeResolve(runeObj{bagPos: runeId}, bagType)`: Σ `deco_rune.exp × stack` → `runeExp` (currency 217). `exchangeRune`: per chip,
  `floor(stack / rune_chip.num)` runes of `rune_chip.rid` (`application/rune/rune_upgrade.go:1-20`). Go calibrated these late; H5 ports the
  rule above and records any client mismatch found by the phase research.
- Stats: each socketed rune adds its `deco_rune` prop to the character (odd holes) or to the battle pet (even holes).

**b. Soul gems (Mệnh Hồn / Xủ Quẻ)**: pet-side gems (`pet-soul-gem.md`). This overlaps roadmap M12.3 ("pet soul gem"); ship it once, in
whichever milestone runs first (open question 3).
- Data `pet_soul` (840): one row per (family, level), consecutive ids; `exp` = base dissolve value, `upExp` = exp to the next level, max Lv 10.
- Currencies: soulExp (Exp Mệnh Hồn), soulChip (Mảnh Vỡ, Go currency 242), soulPnt (Pha Lê). None of them is in H5 `CURRENCY_IDS` yet.
- `preySoul(index, moneyFlag)`: crystal N (1..5) costs `[4000, 5000, 7000, 9000, 12000]` silver (`application/soul/prey.go:45`) and draws a
  uniform Lv1 `type=-1` row of colour N-1; the crystal then ranks up to N+1 with 50/40/30/20 % (Go-invented, `prey.go:47`). `moneyFlag` = the
  VIP-only advanced divination for 200 unbound gold (`prey.go:41`). Results land in the temp (prey) bag; `putSoulToBag` moves them.
- `soulLevelUp` spends `upExp - exp` from soulExp. `transformExp(slot | maxColor, bulk)` dissolves for base `exp` + Σ climbed `upExp` +
  in-level exp, plus chips; bulk dissolve only touches unlocked souls with colour ≤ maxColor-1. Panel variants answer with the `…InPanel`
  pushes, never `onTransformExp` (it nulls the wrong bag).
- `openPetSoulBag(petId)` opens slots by pet level; `moveSoul` moves between the char bag and a pet; `lockSoul` protects from bulk dissolve.
- Stats: the gem props feed the pet (pet stat path, `pets.md`), not the character.

**c. Medals (Ấn Chương)**: `FeatureMedal` `{exp, bag:{slot:{i,t,n}}, petBuff:{t}, charBuff:{t}, checkFlag}`. Bag keys 1..600 (display ≤ 320),
equip slots 1001–1005 (pet) and 2001–2005 (character); the engrave slots 1006/2006 are `petBuff.t` / `charBuff.t`
(`stat-feature-foundation.md` § Medal).
- `getMedalInfo` / `arrangeMedalBag` → Responder. `moveMedal` → `onMoveMedal {type, joinTid, petJoinTid, del, pa, ba}`.
  `upMedal` spends `medal.up_exp` of the in-state `exp` and moves to the next level of the same `basic_tid` (sequential id probe, a Go assumption).
  `breakMedal` credits `medal.exp × count`; a rare medal (`q ≥ 4`) answers the literal string `"ban"`.
- Stats: worn character medals feed a character provider, pet medals the pet provider. Income: medals only come from rewards that H5 does not
  grant yet (achievement medal rewards were unresolvable, `progression.md`), so testing uses `gmGrant`.

**d. Stone seal (Ấn Thạch)**: per equipment slot 1..12, `{lvl 0..5, data: {s1..s10}}`. Hole value: absent / -1 = unbored, **0 = bored and
empty**, > 0 = stone template id (the Go 2026-10-25 fix; -1 as "bored" made the client draw closed holes).
- The bore cost index is the number of bored holes: dust `[50,60,77,102,136,180,234,299,375,463]` (+1 diamond, colour chosen by the client) or
  gold `[71,86,110,146,195,258,335,428,537,663]`. Succinct (seal level up): dust `[110,110,275,529,582]` or gold `[157,157,390,751,826]`
  (StoneSealBoreCanvas.as, copied in `application/stoneseal/state.go`). Gold, dust and diamond are checked **before** anything is consumed.
- Every RPC replies `{flag, data:<stone map>}` (Responder) and pushes the `onUPP` stat refresh; `stoneSealGetData` → `{data, watch:false, equip:null, slot:null}`.
- Currency `stoneSealPoint` (239, Bụi Ấn Thạch) already exists in H5 `CURRENCY_IDS`.

**e. Monster heart (Ma Tâm)**: fully specified in `monster-heart.md` (owner-validated 2026-10-26/27).
- Opening a Ma Tâm item (type 550, `propl_num` = `creatureh_heart` id) adds the heart to the bag of its type (`ren, shou, zhi, ji, mo, lon, te`).
- Holes: `0` closed, `-1` open and empty, `> 0` heart id. Opened with `goldnum` gold (`openHoleMonsterHeart`) or `num` Kim Cương (item 16,
  colour `ITEM_COLOR_NUM[quality]`, `openHoleMonsterHeartJingang`). Holes whose point costs nothing start open.
- `upgradeMonsterHeartItem(isAll, giid, num, useStone, byGold)`: `num` 2..5 copies → the next colour, rate `MHUPMH_RATE[colour+1][num]` (client
  table); a failure destroys the copies unless protected (1 `mhjingshi`, or 800 gold with "dùng vàng"). `resolveMonsterHeart(giid, num)` →
  `heart.exp × num` Ma Năng (`monsterHeart`, 231). `upgradeMonsterHeartBox(box)`: `creatureh_contain[box*10+lev].exp` Ma Năng or its `gold_num`
  gold, lv 1→6 = 15400+30800+46200+77000+138600 Ma Năng; the ratio `num/100 - 100 %` applies to combines only.
- Stats: each placed heart `propnum/10000` (59/60/62/63: `/100`); each completed combine `ceil(talent/10000 × containNum/10000 × p_num1)`,
  talent = Σ key `heart_talent`, colour = lowest key colour + 1, capped by `max_num`. Floats are summed, then rounded once.
- Push order after set/remove: `updateMonsterHeartPanel({bag, data})`, `onInitViewProp`, `onUPP`.

### 2.6 Collection, companion and identity systems (13.6)

**a. Mystery treasure (Mật Bảo) + furnace** (`mystery-treasure.md`):
- State: bag `{slot ≥ 1: {mid, num}}` (MysTreBag never draws key 0), `learnedRec`, `skiLvl`, `skiPt`, `mysBook {kind: {mysId: mysId}}`, the daily make limit.
- The 11 level-1 recipes are free; levels 2–6 come from the books "Bí Kíp Chế Tạo …" (type 516, ids 5042–5107). Skill thresholds
  `MYS_TRE_NEED_SKIPT {1:100, 2:250, 3:700, 4:1000, 5:2000}`, +2 points per successful craft, max level 6; a recipe above `skiLvl` is refused.
- `makeMysTre`: 50 crafts a day (+ `addLimitMakeTimes` gold purchases, + VIP right 28). Output = a random `mystre` row of the recipe kind and
  level, star weights 70/25/5 (owner rule; `per` is 0 in the data). Pushes `updateMysTreMakeTimes(n)`, `updateMysTreBag`, and for a new entry
  `updateMysTreBook` + `onActiveMysBookInfo {t:123, id}` + the stat refresh.
- Thu Thập stats: each `mystre` row ever owned counts once; Σ `prop_num` by `prop_type` (1 HP, 4 attack, 5 magic attack, 11 speed), flat.
- `mysTreObjResolve({slot:{mid,num}})` → Bí Ngân (`decoSilver`) = `mys_sil × num`; push order `updateRuneChipBag`, `onAddMoney decoSilver`, `updateMysTreBag`.
- Furnace: `MysteryExchangeItem({instanceId:true}, md5pass)` smelts whole stacks for `recycling` type-1 `value × stack` mysteryCrystal (215).
  `MysteryExchangeScore({scoreType:count}, md5pass)` converts currencies of types 2..17 (stoneSealPoint, pvePoint, elementPnt, medalExp, npPnt, …)
  at the `recycling` row of type = scoreType. Refuse templates that an NPC shop sells for silver (the 2026-11-01 exploit), equipment and quest
  items. `md5pass` is the secondary password, which H5 does not have: H5 ignores it (as `lvUp` does) and records that.

**b. Fairy (Tiểu Tinh Linh)** (`fairy-system.md`, `application/fairy/`):
- The free fairy (tid 1) is adopted at NPC 1726; the others come from shop 96 gift bags (1688 gold). Roster and skin state (`fairy`, `fairy_skin`).
- `fairyGrowUp(id, type)`: type 0 = 100 000 silver, 20 a day, small crit only; type 1 = 39 gold; type 2 = 20× batch for 780 gold. Small crit
  ×10, big crit jumps to the next grow-level threshold; grow cap 50 (`application/fairy/grow.go`, `tables.go:30-42`).
- `addFairyExp(id, [itemIds], 1)`: fruits 3390/3391/3392, 10 feeds a day, level cap 20; the id list may arrive as an object (`{"0": id}`).
  `fairyRaise(id, itemId, 1)`: satiety (doh 0..10000) from item types 601–605. All three push `onUpdateFairy(id, "gexp"|"exp"|"doh", value)` + `onUPP`.
- Guard stat (only the fairy in state 1): `eff = FAIRY_COLOR_EFFECT[floor((g-1)/10)] × (1 - max(75 - round(doh/100), 0)/75) / 100` and
  `value = round(eff × (base + (lv-1) × (growth + 0.2 g)))` for the five attributes, `FAIRY_COLOR_EFFECT = [20,25,30,35,40]`
  (`application/fairy/guard.go:10-30`). Passive skills (type 11) of the guarding fairy add their buff row; active skills (type 6) cast slot
  `(round-1) % 5` of the selected config list each round (`fairy-system.md` § battle).
- `onSkill(id, bookItemId)` learns once per family (`code_name`); `upFairySkill(id, index)` uses item 3583. `changeFairyState(id, 0|1)`
  broadcasts `onFairyOn {cid, fairy:{resCode}}` / `onFairyOff cid` to the scene (avatar layer, §2.1). `getFairyResAndList` / `setFairyRes` /
  `setFairyResList` manage skins (unlock 550 gold).

**c. PRS (Chân Hồn Thần Thú, "Pet Real Soul")** (`stat-feature-foundation.md` § PRS): the stats go to the **battle pet** (state 1) since 2026-10-30.
- State `{tid, actArr, actLimitObj, useSid, useId, chipBag, excBag, isShow}`; `tid` = current soul-tree node, starts at "1", node 50 = max.
- `addSoulTreeLvl`: pay `prs_tree[tid].cost_stone` realSoulStone (226), then `tid = next_id`. `exchangePRSChip`: `prs_chip.cost_crystal`
  realSoulCrystal (227) per chip. `activePRSShow(id)`: consume `prs_show.need_num` of `need_chip_id` → `actArr` (or `actLimitObj` with an expiry
  when `limit_type > 0`). `replacePRSShow` / `cancelPRSShow` set `useSid`/`useId` and push `onReplacePRSShow {cid, prsUseId}`; the form shows on
  the pet, so H5 broadcasts it to the map (Go sent it to self only).
- Collect: `freePRSCollect` (daily free), `goldPRSCollect` 148 gold, `goldPRSCollectThree` 888 gold. Each pushes the `onAddMoney` deltas,
  `updatePRSChipBag` and one `onGetPRSChip {t, id, num}` per chip; odds from `game_tuning_prs_collect`. `swapPRSChip(Times)` drain the
  exchange bag (`updatePRSExcBag`).
- Carried-over fix: never return a panel without `actLimitObj` (client #1009 in `PRSShowCvs.as:683`).

**d. Astrology (Năng Lượng Tự Nhiên, AstrologicPanel, Lv 70)** (`astrology-system.md`):
- 12 free picks and 10 free refreshes per cycle (noon to noon, UTC+7); a paid pick costs `5 + buyPickCount` gold, a paid refresh 5 gold. Every pick gives +12 npPnt (236).
- 6 formulas per cycle, lengths 2,2,3,3,4,4, awards `[90,90,140,140,195,195]`, server-wide and deterministic from the cycle key. A match = the
  last N collected stars equal a formula in order (longest wins); at most 4 collected stars are kept. The first completion per player per cycle
  pays `aid × 11` and announces ASTROLOGIC_PANEL_U[13] on the system channel; later completions pay `aid`. `lookFormula(fid)` reveals a formula
  for 180/280/380 gold.
- Pick push order: `onAddMoney gold -cost` (paid), `onAddMoney npPnt +12`, `onAddMoney npPnt +award`, `onPickStar {aid, fid, formula, mult, stars}`.
  A failed paid refresh must still answer with the current state, or the panel freezes.

**e. Rebirth look** (`rebirth.md`): reborn = `expRe > 0` (quest 1946 "Tái Xuất Truyền Thuyết 11-11"). Reborn characters use
`class.res_code_male2/female2` (`PC_MALE_000011..16`, 1304 frames / 96 labels) and the weapon `res_code_*2` art. `changeRebirthedRes()` (no args)
toggles the normal / reborn body and pushes `onSetRes {id, res}` to self + scene. **H5 has no rebirth yet** (no `expRe`, no quest-1946 hook):
13.6e ships the appearance rules (§2.1) and the toggle behind a reborn flag; rebirth itself (quest hook, rebirth skills, rank gates) is a
separate item (open question 6).

---

## 3. Decisions for H5

1. **Appearance is server-derived, never client-trusted.** One pure `appearanceOf(doc, worn, flags)` builds the avatar view (body, weapon,
   dress, wing, flyer, fairy, mount, flying state) from the character document and the worn items; login, scene payloads and every push use it.
   Weapon art: `res_code_male/female`, or `res_code_*2` when reborn (rebirth.md). Wing art: `wingResFor(colour, level, look, dye)` (§2.3).
2. **Hidden flags** (`setDressHide`, `setWingHide`) and the fake dress (`setFakeDress` …) live on the character (`appearance` sub-document,
   defaults all off) and are part of the appearance view, so other clients just render what they are told.
3. **Sheets**: the client draws layers from the converted sheets that exist. A missing sheet (28 of 42 flyer codes, 71 of 179 dress codes,
   1 wing, 9 of 18 mount skins are absent from the asset cache, measured 2026-11-04) falls back to the layer below (base body, no wing) and is
   logged once; nothing blocks gameplay. `tools/swf` gets **paged atlases** (max 4096 px per page) so tall sheets (mounts 1600 × 31 368, weapon
   sheets up to 4514 px) render on every GPU; that also unblocks the mounted sprite deferred in `activities.md`.
4. **One instance model**: wing, sublime, qiling and stone-seal state are new optional fields on `character_items.properties`
   (`wing: {level, exp, look, dye, holes}`, `sublime: {lv, add, el}`, `qiling: [{t, v, max}×3]`), never the overloaded legacy `flag`
   string. The wire DTO derives `flag: "level:N"` and `holeNum` codes for the client.
5. **Feature store for bag-like systems** (`character_features`): `dress`, `deco`, `rune`, `rune_chip`, `medal`, `stone_seal`, `monster_heart`,
   `mystery_treasure`, `fairy`, `fairy_skin`, `prs`, `astrology`, `pet_soul` (char bag). Each has a typed state with defaults and a pure
   `decode(raw)` that tolerates old shapes (the Go history shows several shape fixes).
6. **Currencies**: add to `CURRENCY_IDS` the missing keys with their Go ids: `decoSilver`, `mhjingshi`, `soulChip` (242), `soulExp`, `soulPnt`
   (ids from the phase research; `medalExp` stays inside the medal state as in Go). All spends are conditional `$inc` (`CurrencyService.spend`).
7. **Gold-only charges** (sublime/restrain dust, qiling auto-buy, crit charm, astrology, PRS collect, fairy gold growth) spend unbound gold
   (`gold`), never `goldBind`, as in Go; silver charges use the player's `selectedMoneyType` like the forge. Top-up stays "not ready".
8. **Go-invented constants are kept and marked** (`// Go-invented`) unless listed here: wing star failure **keeps the star** like the H5 forge
   (Go dropped it; open question 2); pending previews (wing prefix/bind/dye) are held in memory as the forge `refine-pending` and cleared on
   disconnect (paid at preview, like Go and the H5 forge).
9. **Fixes of Go bugs**: jewel exchange adds before it removes; inlay/join/consume flows run under `char-lock` and validate everything before the
   first write; `isEquSid` coerces; stone-seal holes use 0 = bored; PRS panels always carry `actLimitObj`; monster-heart combines use the
   owner-validated formula.
10. **Secondary password** (`md5pass` in the furnace, `resolveMonsterHeart`): H5 has none; the argument is accepted and ignored (recorded).
11. **Dead RPCs** (`checkLimitWingEffect`, `checkEquipEdit`) are registered and answer `null`, so the Flash-name surface is complete.
12. **Pet-side effects** (even-hole runes and feathers, pet medals, PRS, soul gems) go through the existing pet bonus path
    (`modules/pet/pet-bonus.ts`) and push `onRefreshPetProp`; if M12 lands first, reuse its pet stat providers.
13. **Monetization**: gold variants are ported where the seed or the client gives a price; no new prices are invented beyond the Go ones.
14. **New RPCs are not quiet**; mutating ones are `forbidInBattle`; dev grants go through the existing `gmGrant` (`requireGm`), extended with
    `wing <tid> <colour>` and `currency` keys where needed.

## 4. Shared protocol additions

New files under `packages/shared/src/`, re-exported from `index.ts`, each with its header comment listing RPCs and pushes:

| File | Contents |
|---|---|
| `appearance.ts` | `AvatarView {res, wp?, dress?, wing?, flyer?, fairy?, mount?, flying?, dressHide?, wingHide?}` (resource codes as **strings**); push payloads `EquipOnPush` / `EquipOffPush` / `SetResPush {id, res}` / `WingOnPush {cid, resCode}` / `FlyerOnPush` / `FairyOnPush {cid, fairy:{resCode}}`; `AppearanceLayer` order constant; `FLY_*` constants. `SceneCharacter` and `PlayerData` gain `av?: AvatarView` (+ legacy names such as `wingResCode` where the Flash contract has them) |
| `dress.ts` | dress state, recipe / chip / deco hole / deco show / suit views, every dress RPC arg + reply type, push payloads |
| `wing.ts` | `WingInstance` (level, exp, look, dye, holes), `holeNumCode()`, the wing tables from §2.3 (`WING_JOIN_SUCCESS`, senior rates, `WING_PRO_TOTAL_ADD`, level exp, hole costs, `FEATHER_*`), `wingResFor()` (pure, tested), reply/push types incl. `ShowNewWingProState` |
| `equipDepth.ts` | sublime/restrain/qiling/chongzhu/jewel-exchange payloads, `QILING_*` tables, `qilingSlotOf()`, element names |
| `rune.ts`, `medal.ts`, `stoneSeal.ts`, `monsterHeart.ts` | states, wire views, client cost tables (stone seal bore/succinct, `MHUPMH_RATE`), pushes |
| `soulGem.ts` | pet soul gem bag/temp bag/pet slots, prey costs, pushes (phase E2) |
| `mystery.ts` | Mật Bảo bag/book/make payloads, `MYS_TRE_NEED_SKIPT`, furnace score type map 2..17 |
| `fairy.ts`, `prs.ts`, `astrology.ts` | rosters/states, pure level curves (`FAIRY_LEVEL_EXP`, `FAIRY_GROW_EXP`, `FAIRY_COLOR_EFFECT`), astrology constants, pushes |
| `progression.ts` (edit) | new `CURRENCY_IDS` keys (decision 6) |
| `inventory.ts` / `forge.ts` (edit) | optional instance fields `wing`, `sublime`, `qiling`, `seal` on the bag slot DTO; DTO helpers that derive `flag` / `holeNum` |

Pure helpers (formulas, tables, `wingResFor`, `holeNumCode`, monster-heart combine value, fairy guard value, astrology matching) live in shared
with `*.test.ts`, so client previews and server rules cannot drift.

## 5. Server design

| Module | Owns | Notes |
|---|---|---|
| `modules/appearance/` | `appearance.service.ts` (`viewOf(doc)`, `broadcast(session, kind)`), `appearance.rpc.ts` (`beginFlying` `stopFlying` `fixFlyState` `setDressHide` `setWingHide` `changeRebirthedRes`) | Called by `EquipmentService` after `equipOn/equipOff` (weapon/dress/wing/flyer positions 3/21/22/14) → `onEquipOn` / `onWingOn` / `onFlyerOn` (+ off) to self + map; `CharacterService.toSceneCharacter` / `toPlayerData` gain `av` via the service (keeps `character.service.ts` < 300 lines). Mount `onMountOn` keeps its module and reads `viewOf` for the rider |
| `modules/dress/` | dress rpc split by area: `dress.rpc.ts` (activate / fake / hide), `dress-recipe.rpc.ts` (transform, extract, exchange, chips, goods), `deco.rpc.ts` (deco show/hole/suit) + services + `dress-rules.ts` | feature keys `dress`, `deco`; stat provider `DressBonusProvider` (dress + deco suits) |
| `modules/wing/` | `wing.rpc.ts` (join, star, hole), `feather.rpc.ts`, `wing-refine.rpc.ts` (prefix/bind/dye/advance/look), `wing-rules.ts` | reuses `forge/quality-roll.ts`, `forge-money.service.ts`, `forge-guard.ts`, `refine-pending.ts`; wing lines + level + odd feathers feed the existing gear provider via `equip-stats.ts` (`wingBonus()`), even feathers the pet bonus |
| `modules/forge/` (extend) | `sublime.rpc.ts` + `sublime.service.ts` + `sublime-rules.ts`, `qiling.rpc.ts` + `qiling-rules.ts`, `jewel-exchange` in `mix.service.ts` or its own file, `isEquSid` / `checkEquipEdit` on `forge.rpc.ts` | sublime element bonuses exported for combat (`fighters.ts`) behind a flag until unit elements exist (risk 4) |
| `modules/rune/`, `modules/medal/`, `modules/stoneseal/`, `modules/monsterheart/` | one Nest module each: rpc + service + pure rules + tests | providers registered in `PROVIDER_CLASSES` (`stats.module.ts`); monster-heart opener hooks `use-item.service.ts` for item type 550 |
| `modules/soulgem/` | pet soul gems (if not done by M12.3) | pet bonus |
| `modules/mystery/` | `mystery.rpc.ts` (11 RPCs), `furnace.rpc.ts` (`MysteryExchangeItem`, `MysteryExchangeScore`), rules | collection provider; book items (type 516) hooked in `use-item.service.ts` |
| `modules/fairy/` | `fairy.rpc.ts`, `fairy-skin.rpc.ts`, `fairy.service.ts`, `fairy-rules.ts`, NPC 1726 menu entries (`npc` module) | guard provider; battle active skills in phase G2 (`combat` hook) |
| `modules/prs/` | `prs.rpc.ts` (14), rules | pet bonus; collect odds from `game_tuning_prs_collect` |
| `modules/astrology/` | `astrology.rpc.ts` (4), `astrology-rules.ts` (cycle key, deterministic formulas, matching), in-memory record feed | system-channel announcement via the chat module |

- **GameDataService**: add cached accessors `getDress`, `decoHole/Show/Rune`, `runeChip`, `equiptSuit`, `sublimation`, `medal`, `creatureh*`,
  `mystre`, `mystreRecipe`, `recycling*`, `petSoul`, `fairyTemplate`, `prs*`, plus `getClass` res `*2` columns (already loaded). All these
  `data_tbl_*` collections are already imported (Mongo check 2026-11-04); a new seed import is only needed if the phase research finds a table
  outside that list (wing look/dye palettes and the qiling plans are code constants, as in Go).
- **Schemas**: `Character.appearance {dressHide:false, wingHide:false, flying:false, fakeDress:0, fakeFlyerDress:0, rebornLook:true}`;
  `character_items.properties` optional `wing`, `sublime`, `qiling`, `seal`; everything else in `character_features`. No migration: absent
  fields decode to defaults.
- **Locks and order**: every mutation under `char-lock`; validate → spend (conditional) → write → push; on a write failure refund the spend
  (pattern of `forge-money.service.ts`).
- **Pushes after stat changes**: the existing `CharacterStatsService.refreshPush(session)` (`onUPP`) and, where the client expects it,
  `onInitViewProp`; pet-side changes push `onRefreshPetProp`.

## 6. Client design

### 6.1 Avatar layering (phase A)

- `game/AvatarView.ts` (new, < 300 lines) owns the layered sprite of one map entity; `Entity` delegates `loadVisual` / `swapRes` / `applyAnim`
  to it (Entity stays < 340 lines). Layers follow §2.1: deco foot/aura → mount → flyer → wing (behind for dir 0/1/7) → body (class body,
  reborn body, **costume replaces it**, transform) → wing (other dirs) → weapon (only on the class/reborn body) → flyer front (`wav_code`, only
  while flying) → halo. Wing offsets from the CreatureView tables (transcribed into shared `appearance.ts`), default 0 for unknown bodies; fairy
  is a separate follower sprite like `PetFollower`; flying = body offset −100 px tween + zoom.
- All layers are `SheetAnim`s from the same resource family (same 64 `dir-behavior` labels, same anchor rule `(-midX, -footY)` from each sheet's
  `meta`), played in lockstep: `playDir(dir, behavior)` is forwarded to every layer, frame index shared.
- Battle (`battle/BattleUnit.ts`) shows body + weapon (+ wing if the research confirms) with the same composer.
- Handlers in a new `game/AppearanceController.ts`: `onEquipOn/Off`, `onSetRes`, `onWingOn/Off`, `onFlyerOn/Off`, `onFairyOn/Off`, flying state;
  `StoreSystemsController`'s mount handlers move onto the composer (rider = mount sheet, which now loads thanks to paged atlases).
- Sheets to generate with `tools/swf` (`swfbatch`, then check `manifest.json`):
  - already present: weapons `equip/EQUIP_MC1..6`, `EQUIP_FC1..6` (all 252 weapon codes), wings `equip/EQUIP_WING_*` (17/18), flyers 14/42,
    dresses `creature/NPC_CRE_2xxxxx` 108/179, reborn bodies `PC_MALE/FEMALE_0000{11..16}`;
  - regenerate with **paging** (`swf2sheet`/`swfbatch -maxH 4096`, JSON `images[].p` page index, PNGs `<name>.png`, `<name>_1.png`, …;
    `SheetAnim.loadSheet` loads every page): mount skins `PC_*_01xxxx`, weapon sheets taller than 4096;
  - check the `_NEW.swf` variants the Flash client loads for weapons and wings (`wp + "_NEW.swf"`, rebirth.md): if the cache holds them and they
    differ (1304-frame reborn sets), convert them as `<name>_NEW` and prefer them;
  - the missing codes (decision 3) are listed by a `tools/swf` report (`swfscan` + resmap) and go to the open questions, not hand-made art.
- `tools/swf` changes are TypeScript only, keep byte-identical output for sheets that fit one page (swf-tools.md parity rule), and update
  `docs/assets-pipeline.md` § Sheet JSON.

### 6.2 Panels

| Panel (Vietnamese title) | Opens from | Files |
|---|---|---|
| Thời trang (dress, deco, runes tab) | character panel header / HUD per research (Flash DecoratePanel) | `ui/dress/*`, `game/DressController.ts` |
| Cánh (wing join / star / hole / feather / refine / advance) | Lò rèn tab "Cánh" + character panel wing slot | `ui/wing/*`, `game/WingController.ts` |
| Thăng hoa / Đổi khắc chế | Lò rèn new tabs | `ui/forge/sublimeTab.ts`, `restrainTab.ts` |
| Kỳ Linh / Trùng Chú | activity strip entry 68 / Lò rèn | `ui/forge/qilingPanel.ts` |
| Đổi bảo thạch | Lò rèn mix tab | `ui/forge/jewelExchange.ts` |
| Ấn Thạch, Ấn Chương, Ma Tâm, Mật Bảo, Lò luyện thần bí | DecoratePanel pages / Tu luyện window per research | `ui/deco/*`, `ui/feature/*` |
| Tiểu Tinh Linh | NPC 1726 + HUD | `ui/fairy/*`, `game/FairyController.ts` |
| Chân Hồn Thần Thú | pet panel | `ui/pet/prsPanel.ts` |
| Năng Lượng Tự Nhiên | activity strip, Lv 70 | `ui/astrology/*` |

Panels reuse `itemCell.ts`, `panelBehavior.ts`, `confirmDialog.ts`; strings verbatim from Language.as (§2); controllers keep `GameScene.ts`
from growing (it is at 432 lines: only one new controller wiring line per phase).

## 7. Phases

Each phase is independently shippable: shared build, `pnpm -r lint`, `pnpm -r test`, browser check, memory doc update, then the next phase.

### Phase A — Avatar appearance (13.1 + 13.6e look rules)
| Touch point | Change |
|---|---|
| `tools/swf/src/sheet/sheet.ts`, `cli/swf2sheet.ts`, `cli/swfbatch.ts` | paged atlases (`-maxH`), `images[].p` |
| `client/src/game/SheetAnim.ts` | multi-page textures |
| `packages/shared/src/appearance.ts`, `protocol.ts` | `AvatarView`, pushes, `SceneCharacter.av`, `PlayerData.av` |
| `server/src/modules/appearance/*` (new), `character.service.ts`, `equipment.service.ts`, `scene.rpc.ts`, `scene-transport.service.ts` | view builder, equip-path pushes, flying/hide RPCs, `changeRebirthedRes` (refused while H5 has no rebirth) |
| `server/src/modules/vip/pm-reward.service.ts`, `pm.service.ts` | persist the transform res and use `onSetRes` through the appearance service |
| `client/src/game/AvatarView.ts`, `AppearanceController.ts` (new), `Entity.ts`, `StoreSystemsController.ts`, `battle/BattleUnit.ts` | layered sprite, handlers, mounted rider |
- [ ] Weapon shows on self and others at login, after equip/unequip, after map change.
- [ ] Dress replaces the body; wing and flyer layers; hide flags; flying begin/stop/fix; mount rider renders.
- [ ] Missing sheets fall back silently (one log line).
- [ ] `docs/memory/appearance.md` (new) + index line; `activities.md` mount note updated; `assets-pipeline.md` paging.

### Phase B — Dress / Thời trang (13.2)
| Touch point | Change |
|---|---|
| shared `dress.ts` | contracts |
| `server/src/modules/dress/*`, `gamedata` accessors (`dress`, `deco_*`, `equipt_suit`), `stats.module.ts` | 27 RPCs, provider |
| `client/src/ui/dress/*`, `game/DressController.ts` | panel |
- [ ] Activate, fake dress / fake flyer dress visible to others; recipes, extract, exchange, chips, goods; deco holes/show/suit stats.

### Phase C — Wings (13.3)
| Touch point | Change |
|---|---|
| shared `wing.ts` | tables, `wingResFor`, `holeNumCode`, payloads |
| `server/src/modules/wing/*`, `inventory/equip-stats.ts` (wing bonus), `pet/pet-bonus.ts` (even feathers), `progression/grant` (`/grant wing`) | 20 RPCs |
| `client/src/ui/wing/*`, `game/WingController.ts`, `ui/itemCell.ts` (wing tooltip: level, holes, feathers) | panels |
- [ ] Join/senior join, star, hole, inlay/remove, feather upgrade/mix, prefix/bind previews, advance + crit charm, look/dye change shows on the avatar.

### Phase D — Equipment depth (13.4)
| Touch point | Change |
|---|---|
| shared `equipDepth.ts` | contracts |
| `server/src/modules/forge/{sublime,qiling}.*`, `mix.service.ts` (jewel exchange), `forge.rpc.ts` (`isEquSid`, `checkEquipEdit`), `equip-stats.ts` | rules + stats |
| `client/src/ui/forge/*` | three tabs + Kỳ Linh panel |
- [ ] Sublime to +2 with a failure pity; restrain confirm flow; qiling roll + chongzhu with locks; set bonus in stats; jewel exchange.

### Phase E — Runes, medals, stone seal, monster heart (13.5 a, c, d, e); E2 soul gems (13.5b) unless M12.3 shipped them
| Touch point | Change |
|---|---|
| shared `rune.ts` `medal.ts` `stoneSeal.ts` `monsterHeart.ts` (`soulGem.ts`) | contracts |
| `server/src/modules/{rune,medal,stoneseal,monsterheart}/*`, `use-item.service.ts` (type 550 opener), `stats.module.ts`, `pet-bonus.ts` | 28 RPCs + `oneKeyOpenAllMXTemp` if the temp bag exists |
| `client/src/ui/deco/*`, `ui/feature/*` | panels |
- [ ] Each system: one mutation changes stats (character or pet) and survives relog.

### Phase F — Mystery treasure + furnace, astrology (13.6 a, d)
| Touch point | Change |
|---|---|
| shared `mystery.ts`, `astrology.ts` | contracts |
| `server/src/modules/{mystery,astrology}/*`, `use-item.service.ts` (books 5042–5107) | 17 RPCs |
| client panels | Mật Bảo pages, Lò luyện, Năng Lượng Tự Nhiên |
- [ ] Craft (50/day), book learn, collection stat, resolve → Bí Ngân, furnace both modes, astrology cycle with first-completion bonus and announcement.

### Phase G — Fairy, PRS (13.6 b, c); G2 fairy battle skills
| Touch point | Change |
|---|---|
| shared `fairy.ts`, `prs.ts` | contracts |
| `server/src/modules/{fairy,prs}/*`, `npc` (NPC 1726 menu), `appearance` (fairy layer), `combat` (G2 fairy active skills) | 26 RPCs |
| client `ui/fairy/*`, `ui/pet/prsPanel.ts`, `AvatarView` fairy layer | panels |
- [ ] Adopt, feed, grow, raise, skills, guard on/off visible to others; PRS tree, chips, forms on the pet.

## 8. Non-goals

- Rebirth itself (quest 1946 hook, `expRe`, rebirth skills, rank gates): only the look toggle and art selection are here (open question 6).
- Pet equipment sublime/restrain (`sublimePetEquip`, `restrainPetEquip`): M12.4, sharing the phase D rules.
- Timed dyes, the Chiến Thần dye (`sureChangeRMBWingColor`), the "special shape" dye chance, timed wings (`checkLimitWingEffect` stays a stub).
- Dress gacha / draw if the research shows it is a paid lottery with no seed data (dress-draw.md) — ported only with seed data (default rule).
- Real top-up, admin dashboard, cross-server, secondary password, the Ma Tâm temp bag if the temp-bag feature (M8 roadmap item) is not in H5.
- Hand-made replacement art for assets missing from the cache.

## 9. Verification

1. Unit tests (pure, no Mongo): `wingResFor` (series/look/dye), `holeNumCode`, wing join/senior rates, star rate, level bonus, feather budget,
   sublime pity + element roll, qiling roll ranges + set bonus, stone-seal costs by bored count, monster-heart combine (worked example: two white
   lv0 keys on 11011 → attack +14 at holder lv1, +28 at lv6), fairy guard value, astrology matching + cycle key, mystery star weights + skill
   thresholds, appearance view builder (normal / reborn / dress / hide / flying), atlas paging (pages ≤ 4096, single-page output unchanged).
2. `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test` (record the baseline first).
3. Scripted ws e2e per phase: two players + an observer on one map; the observer receives every appearance push and sees the same `av` in scene
   payloads after a map change.
4. Browser per phase (fresh GM account, `/grant`): weapon/dress/wing/flyer/mount/fairy on self and other; each panel's main action once;
   stats change in the character (or pet) panel; relog keeps everything.
5. Docs: `docs/memory/appearance.md`, `dress.md`, `wing.md`, `equipment-depth.md`, `deco-systems.md` (runes, medals, stone seal, monster heart),
   `mystery-astrology.md`, `fairy-prs.md` + index lines in `PROJECT_KNOWLEDGE_BASE.md`; update `forge.md`, `character-stats.md`, `activities.md`.

## 10. Risks

1. **Assets**: about 40 % of flyer and dress codes and half the mount skins are not in the cache; dye palettes and orange wing looks may be
   among the unnamed SWFs (`swfbatch -only unnamed`). Layer alignment between body, weapon and wing sheets is only as good as the `meta`
   anchors; the reborn 1304-frame sets have 96 labels (32 more behaviours) that `SheetAnim` must ignore safely.
2. **GPU/memory**: four animated layers per player × many players; load lazily, share sheets through the `loadSheet` cache, drop layers for
   far-away entities if frame time suffers.
3. **Instance field growth**: wing/sublime/qiling/seal on `properties` touch every DTO mapper; keep the mapping in one file (`bag-mapping.ts`).
4. **Elements**: sublime elemental damage needs a unit element that H5 combat does not model yet (`element-system.md`); the bonus is stored and
   shown, and applied in combat only when elements exist.
5. **Scope**: ~180 RPCs; each phase is a full milestone of its own. Phases E–G can be reordered or split without touching A–D.
6. **Economy**: almost none of these systems has an income source in H5 yet (medals, PRS stones, fairy fruits, Ma Tâm items, wing stones);
   `gmGrant` is the test source and real income comes with the drop/quest work of other milestones.

## 11. Open questions

1. Phase order: appearance (A) first is fixed; then dress → wings → equipment depth, or equipment depth first (it only needs the forge)?
2. Wing star failure: keep the star (H5 forge rule, default) or drop it (Go owner rule 2026-10-25)?
3. Pet soul gems (13.5b): here (phase E2) or in M12.3 with the other pet systems?
4. Wings: start with 0 holes (Go) or random 1–4 (client help text WING_PANEL_U[47])?
5. Qiling caps/tiers and the sublime pity/dust price are Go-invented: keep them, or does the owner have the original table?
6. Rebirth: port the rebirth itself (quest 1946 hook, `expRe`, rebirth skills, rank gates, reborn body) as part of M13, or a separate item?
7. Dye and the 3-look orange wings: port only when the palette sheets exist in the cache?
8. Enforce "at most 2 Kỳ Linh items worn" (client text) or follow Go (not enforced)?
9. Persist paid previews (wing prefix/bind/dye) across a disconnect, or keep the forge rule (in memory, lost on disconnect)?
10. Dress: keep `recieveGoods` repeatable (Go: unlimited bound fashion items per activated dress), and keep the confidential Go draw weights
    (100/9) or the odds the client text announces (51.6 % / 48.4 %)?
11. Fashion items: Go blocks star/hole/socket/upgrade on fashion and flyers (owner rule 2026-11-02); H5 forge should adopt that gate in phase B?

