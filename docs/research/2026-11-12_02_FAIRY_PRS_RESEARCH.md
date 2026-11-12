# M13 phase G research: Fairy (13.6b) and PRS (13.6c)

Date 2026-11-12. Sources: legacy Go `E:\mcgame\internal\{presentation/rtmp/handlers,application,domain}/prs`, `statfeature/prs_stats.go`,
`application/pet/prs_bonus.go`, Flash `docs/client/view/view/compDragable/PRSPanel.as`, `comp/PRSShowCvs.as`, `PRSChipBag.as`, `PRSSlot.as`,
`PRSSlotItem.as`, `PRSExcCvs.as`, `compMain/ActivityCanvas.as`, `compGameStage/BattleCreatureView.as`, `object/Charactor.as`, `config/Language.as`
(`PRS_PANEL`, `PRS_PROP`, `PRS_PROP_TIP`), legacy memory `stat-feature-foundation.md` § PRS and `pet-system.md` § "Chân Hồn Thần Thú on the battle pet",
Mongo `data_tbl_prs_*`, `game_tuning_prs_collect`.

## PRS (Chân Hồn Thần Thú, "Pet Real Soul")

### Entry point

Activity strip icon **58** (`GamePredef.PETREALSOUL`, `ActivityCanvas` -> `ViewManager.PANEL_PET_REAl_SOUL` 951 -> `PRSPanel.showPanel`).
Seed row `data_tbl_activity` 58 `PetRealSoul` "Chân hồn pet", type 2 flag 50 (character level 50). There is no pet-panel button.

### RPCs (two sources: Flash call sites + Go handlers)

All are sent with a null responder except `initPRSPanel`. The first argument is the cid (`_core.cid`) everywhere except `updateActivePRSShow`.

| RPC | Flash args | Go behaviour | Pushes (Go) |
|---|---|---|---|
| `initPRSPanel` | `cid` (Responder -> `updatePRSPanel`) | state wire | reply = panel |
| `addSoulTreeLvl` | `cid` | cost = `prs_tree[tid].cost_stone` realSoulStone (226), `tid = next_id`; `next_id` 0 = max | `updatePRSPanel`, `onRefreshPetProp` (battle pet) |
| `activePRSShow` | `cid, showId` (tab 0 card) | consume `need_num` chips `need_chip_id` from chipBag -> `actArr[next]` (or `actLimitObj` when `limit_type > 0`, raw ms) | `updatePRSPanel`, pet refresh |
| `activePRSShowSpe` | `cid, showId` (tab 1 card) | tab 1 only; consume `need_num` bag items of TEMPLATE `need_chip_id`; `actLimitObj[id] = now + limit_time * 60000` | item notices, `updatePRSPanel`, pet refresh |
| `replacePRSShow` | `cid, showId` | must be activated; `useSid = useId = showId` | `onReplacePRSShow {cid, prsUseId}` (self only), follow-pet redraw |
| `cancelPRSShow` | `cid, showId` | `useSid = useId = 0` | same |
| `movePRSChip` | `cid, fromPos, toPos, direction` (drag; 1 = bag -> exchange slot, 2 = exchange slot -> bag) | swaps the two slots (whole stacks) | `updatePRSChipBag`, `updatePRSExcBag` |
| `exchangePRSChip` | `cid, chipId` | `prs_chip.cost_crystal` realSoulCrystal (227) -> +1 chip | `updatePRSChipBag`, `onGetPRSChip {t:127, id, num:1}` |
| `updateActivePRSShow` | `{showId: showId}` of expired timed forms (timer in `refreshPRSShow`) | trusts the list: drops them, clears useSid | pet refresh, follow-pet redraw |
| `freePRSCollect` | `cid` | 1 realSoulWater (228, "Lộ Thu Thập"); `free_stone` stone + one `free_chip_percent` roll | `onAddMoney` water / stone, `updatePRSChipBag`, `onGetPRSChip` x n |
| `goldPRSCollect` | `cid` (confirm PRS_PANEL[35], 148) | 148 unbound gold; `gold_stone` + one `gold_chip_percent` roll, `gold_crystal_no_chip` crystal on a miss | `onAddMoney` gold / stone / crystal, chip pushes |
| `goldPRSCollectThree` | `cid` (confirm PRS_PANEL[36], 888) | six gold rolls, misses raised to `six_collect_guaranteed_chips`, `6 x gold_stone`, crystal per remaining miss | same |
| `swapPRSChip` / `swapPRSChipTimes` | `cid` ("Đổi" / "Đổi Nhanh") | Go: rerolls every staged chip 1:1 (net zero, "exact mechanic unknown") | `updatePRSExcBag`, `updatePRSChipBag`, `onGetPRSChip` |

Draws are made in memory first; gold is charged only when the chip bag can hold them (Go review fix).

### Panel contract

`{tid, actArr {idx: showId}, actLimitObj {showId: expiryMs}, useSid, chipBag {pos: {chipId, chipNum}}, excBag {1..3: ...}, isShow}`. Go stored and sent
`tid` as a string; the client reads `Number(tid)`. Every object must be present (a stub without `actLimitObj` crashed `PRSShowCvs.as:683`, #1009).
`useId` (= `useSid`) is persisted for the login scalar `cData.prsUseId`. The Flash `Charactor` reads `prsUseId` from the scene character, and
`BattleCreatureView` replaces a pet fighter's `resCode` with `prs_show[owner.prsUseId].res_code`. The Flash client has no handler for
`onReplacePRSShow` / `onGetPRSChip` (Go-only pushes).

### Stats (PRSPanel.updatePRSBuffList, Go prs_stats.go)

Sum every `prs_tree` row with `level <= level(tid)` (tree column) and every form in `actArr` plus every unexpired `actLimitObj` key (forms column), over
`p_t1..8 / p_n1..8`. Display / stat unit: props 1/4/5/6/7/11 raw, every other prop `/100`, 59/60/62/63 with "%". Since 2026-10-30 the totals go to the
**battle pet** (state 1) only (rule text PRS_PANEL[38]/[39]), mapped 1/4/5/6/7/11/13 + 34 direct, 14 XPN, 31 Kháng Bạo, 61 Kháng Xuyên, 59/60, 62/63.
H5 key convention: the pet talent dictionary (`TALENT_PROPS`) + `BUFF_PROP[14]` / `[34]`, values in panel units (same as talents / runes).

### Tables

- `data_tbl_prs_tree` 50 rows: `id = level`, `cost_stone` 230..2900, node 50 `next_id 0`. Rows 2..49 add 1/4/5/6/7/11/13/31; node 50 adds 34/59/60/62/63.
- `data_tbl_prs_show` 22 rows: tab 0 ids 1..10 (10 chips each, `need_chip_id` = chip id, no limit), tab 1 ids 11..22 (event items 5303..6980,
  `limit_type 1`, `limit_time` 10080 / 21600 / 43200 minutes). `res_code` `20601000012xx` (creature sheets, all converted).
- `data_tbl_prs_chip` 10 rows: chip `id` = form id, `cost_crystal` 200..2000, `icon_code` `30601000012xx`.
- `game_tuning_prs_collect` 1 row, key `prs_collect_rates`: `{free_chip_percent 10, gold_chip_percent 20, six_collect_guaranteed_chips 1, free_stone 30,
  gold_stone 30, gold_crystal_no_chip 10, chip_weights {1..10: 1}}` (Go defaults identical; the amounts and weights are Go-invented).

### Client text vs Go

- PRS_PANEL[15] "3 mảnh khác nhau có đổi 1 mảnh mới ngẫu nhiên": three different chips in the exchange slots give one random chip. Go's 1:1 reroll
  contradicts it; H5 follows the client text (owner to confirm).
- PRS_PANEL[38] point 4: the six-collect button guarantees one fragment (matches the tuning default).

### H5 decisions

State in feature `prs`; tid stored numeric; chip bag merged per chip id and compacted (the Flash bag pages by entry count); `activePRSShow` refuses tab-1
forms; timed forms always count minutes; expired timed forms are pruned by the server clock on every call (the client list of `updateActivePRSShow` is
only a trigger); `onReplacePRSShow` goes to the whole map; the scene character carries `prsUseId`, the following pet and the battle pet fighter use the
form art; the drop table is read at startup from `game_tuning_prs_collect` (Go re-read it on every collect).

## Fairy

Sources: Go `internal/application/fairy/{state,tables,grow,grow_curve,adopt,guard,guard_skills,skill,skin,battle_skills}.go`,
`presentation/rtmp/handlers/fairy/*`, `handlers/npc/{fairy.go,npc_click.go:372-390,npc_script.go:452-490}`, `application/item/effect_fairy_bag.go`,
legacy memory `fairy-system.md`; Flash `view/view/compMain/PetCanvas.as`, `FairyManagerPanel.as`, `comp/FairyFuncCanvas.as`, `FairyItemCanvas.as`,
`FairySkillCanvas.as`, `FairySkinCanvas.as`, `FairyDetailCanvas.as`, `compDragable/FairySkillConfigCanvas.as`, `FairySkillListComp.as`,
`logic/FairyLogic.as`, `predef/GamePredef.as:2101-2104, 8998-9067`, `config/Language.as:5296-5410` (`FAIRY_MANAGER_PANEL_U/_S`); Mongo
`data_tbl_fairy_tempalte`, `data_tbl_skill`, `data_tbl_buff`, `data_tbl_item_template`, `data_tbl_npc` 1726, `data_tbl_shop_slot` (sid 96).

### Entry point

`PANEL_FAIRY_MANAGER` 838 opens from the fairy toggle of the HUD pet bar (`PetCanvas.__fairyTog_click`, PetCanvas.as:645-648); no hotkey; disabled in
battle (`BattleServer.as:36`). On first show the panel calls `initCharFairy` (FairyManagerPanel.as:1980-1987). Five fairies per list page. Sub canvases:
Cho ăn (Độ no / Exp tabs), Kỹ Năng (+ Thiết lập config window), Hoán đổi (skins), Nuôi dưỡng (grow), detail.

### RPCs (two sources: Flash call sites + Go handlers)

| RPC | Flash args | Reply the client reads | Go behaviour / pushes |
|---|---|---|---|
| `initCharFairy` | none (Responder) | roster map keyed by id | refills daily counters (`flag.gnum` 20, `flag.en` 10, stamp `flag.rs`) |
| `fairyGrowUp` | `fairyId, type` (btn1 = 0, btn2 = 1, btn3 = 2) | `{f, exp, cri, gnum}` / `{f:false, code}`: `rmb` GAMEPREDEF_S[58], `lv` U[54], `out` U[76] | type 0 = 100 000 silver + one of 20 daily cultivations, small crit only; type 1 = 39 gold; type 2 = up to 20 gold cultivations charged per cultivation run (780 for 20). `onUpdateFairy(id, "gexp", s)` + stat refresh. The client pre-checks only 50 000 silver / 5 gold. |
| `fairyRaise` | `fairyId, bagItemId, 1` | `{f, num}` (stack left) / codes `full` U[47], `item` U[46], `num` U[48], else U[49] | +100 doh per unit, cap 10 000; Go does not check the item type (client: types 601-605). `onUpdateFairy(id, "doh", s)` |
| `addFairyExp` | `fairyId, [bagItemId], 1` (AMF ECMA array `{"0": id}` in live logs) | `{f, num, en}` / `item`, `num`, `out` U[77], `max` (silent) | fruits 3390/3391/3392 = 225/300/400 exp, one feed per stack, level cap 20. `onUpdateFairy(id, "exp", s)` |
| `onSkill` | `fairyId, bookBagItemId` | `{flag, id, sindex "sN", skill}`; failure `sindex` 1 = U[85], 2 = U[86] | book -> level-1 skill (`SkillItemToTblSkill`, 22 books) into the first free s1..s20; once per `code_name` family (2026-10-29 fix) |
| `upFairySkill` | `fairyId, skillIndex` (tab x 4 + button, 1..20) | same as onSkill; `sindex` 3 = max (client silent) | next level of the same `code_name`; 1 book 3583 for lv1 -> 2, 3 books for lv2 -> 3, max 3 |
| `fairySkillConfigChange` | `fairyId, {"0".."2": {c0..c4}, select}` (no responder) | none | stored as sent; `cN` = TBL_SKILL id or -1, `select` 0..2, -1 "Không dùng tất cả", -2 untouched, absent = list 0 |
| `changeFairyState` | `fairyId, 0|1` (no responder; client confirms FAIRY_MANAGER_PANEL_S[0] when unbound) | none | guard rests every other guard and binds; `onUpdateFairy(id, "state"/"binded", s)`, `onFairyOn {cid, fairy:{resCode}}` / `onFairyOff cid` to the scene, stat refresh |
| `delFairy` | `fairyId` (no responder) | none | `onDelFairy(id)`, stat refresh; no bound / guard check on either side |
| `getFairyResAndList` | none | `{actFairy, actFairyList "a|b"}` | skin state (feature `fairy_skin`) |
| `setFairyRes` | `tid, type` (1 hide, 2 show) | `{type, tid}`; null ignored | Go requires the tid in `actFairyList` |
| `setFairyResList` | `tid` | same as getFairyResAndList | 550 gold for any tid; the client confirms U[93] (550) except tids 15 / 16 (`FAIRY_SKIN_NEED_ITEM`, U[108], no price) |

Push handlers in the dump: only `onAddFairy(obj)` (FairyManagerPanel.as:1153, reads `tid`, `id`, `name`, toast U[64]) and `onDelFairy(id)` (1760, a
`.replayce` typo throws before the entry is removed). `onUpdateFairy`, `onFairyOn`, `onFairyOff` have no client body (CallBack.as is a decompile stub);
`CreatureView.fairyOn` reads `gameObject.fairy.resCode` (CreatureView.as:7966-7982) and needs it > 0.

### Tables and formulas

- `FAIRY_LEVEL_EXP` (20, cumulative), `FAIRY_GROW_EXP` (50), `FAIRY_COLOR_EFFECT [20,25,30,35,40]`, `FAIRY_MAX_LEVEL 20`, `FAIRY_GROW_LEVEL 50`
  (GamePredef). `FairyLogic.expToLv`: `<= 0` -> 1, else the first index whose threshold is above, else 20; `gexpToLv` the same over the grow table
  (gexp 0 -> 1 but 1..499 -> 0). Colour band = `floor(max(g - 1, 0) / 10)`.
- Guard bonus (FairyDetailCanvas.as:334-350 = Go guard.go): `eff = COLOR_EFFECT[band] x (1 - max(75 - round(doh / 100), 0) / 75) / 100`,
  `value = round(eff x (base + (lv - 1) x (growth + 0.2 g)))` for sta/ste/agi/inte/ener -> Nhẫn/Lực/Xảo/Trí/Thần of the owner. Panel own stats:
  `round(base + (lv - 1) x (growth + round(2 g) / 10))`.
- Grow gain (Go grow_curve.go, owner rule 2026-10-25): normal cultivations per level interpolated over anchors 2->18 (1-20), 40->80, 80->120,
  150->330; gain = level span / count (>= 100); small crit x10 (50 per mille), big crit to the next threshold (5 per mille), both Go-invented odds.
- Passive skills (type 11, families 5917-5934, buffs 2417-2434, percent_flag 1) of the guarding fairy buff the owner, one per family at its highest level.
  Active skills (type 6, `skill_elf_1..16`, 6227-6277): slot `(round - 1) % 5` of the selected list is cast before the owner acts (U[107]).
- Learning gate (client FairySkillCanvas:833-870 + U[88]): grow level (`gexpToLv`) >= the book's `req_level` (11..20); 20 skills max (U[84]).
- `data_tbl_fairy_tempalte` 17 rows (`rc` 20601003000NN art, base + `_g` growth); gift bags (type 550, req_level 80): 3393..3398, 3609, 3817, 3818,
  4010, 4030, 6609..6611, 7242 -> tids (Go `fairyBagTids`). Raise items: types 601-605 (crafting materials).

### NPC 1726 and shop 96

NPC 1726 "Sứ Giả Tinh Linh Thủ Hộ" (map 10, 1140,1770, `shop_id` 96). Click -> `onList` with "Miễn phí nhận nuôi Tinh Linh ( Thiên sứ )"
(`adopt_free_fairy`, tid 1 once -> `onAddFairy`), "Mua Tinh Linh khác" (`buy_other_fairy` -> `onOpenShop` 96), "Tìm hiểu thông tin về Tiểu Tinh
Linh" (`fairy_info` sub-menu of four guide texts). Shop 96 "小精灵商店": 25 gold slots (gt 1): fairy bags 1688 gold, skill books 666-1688, 3583 888.

### H5 decisions

- Replies keep the Go codes (the client maps them to text); learn refusals all answer `sindex` 1 (Go sent 2 for some, which shows the upgrade text).
- Server checks the client-only rules too: raise item types 601-605, skill grow-level gate, 20 skill slots; the free adopt / shop picks need the NPC's map.
- Silver uses the selected money type (plan decision 7; Go: unbound `money`); gold = unbound `gold` only. Charges are conditional and happen before the
  write (refund on a failed write); the batch charges the cultivations actually run.
- A skin is usable when unlocked or when a fairy of that template is owned (Go refused owned-fairy skins although the client lists them as owned);
  tids 15 / 16 refuse the gold unlock (no unlock item exists in the data). A skin change of a guarding fairy re-sends `onFairyOn`.
- Daily counters reset on the UTC+7 day (Go: UTC). `onFairyOn` / `onFairyOff` go to the map, self included; the look is `av.fairy` (resource code string).
- Releasing the guarding fairy also sends `onFairyOff` + the stat refresh. Pet-side effects: none (Go has none).

### G2 fairy battle skills (2026-11-12)

Sources: Go `application/combat/fairy_battle.go`, `domain/combat/fairy_skill.go`, `damage_reactions.go` (procs, life steal, reflect),
`application/combat/buff_text_stats.go` / `buff_support_effects.go` (text stats), `turn_processor.go:342` (hook order), legacy memory
`fairy-system.md` § "Fairy active skills in battle"; Mongo `data_tbl_skill` `code_name ^skill_elf`, `data_tbl_buff` 2721-2791.

**Rule** (FAIRY_MANAGER_PANEL_U[107]): at the start of the owner's turn (before its statuses tick, so a stunned owner still gets the cast) the
slot `(round - 1) % 5` of the selected list lands its buff on the owner; empty slot = nothing. Guarding fairy only, player characters in PvE and
PvP. The Flash client has no battle-side fairy code: the cast is only the buff icon (an idle step with `sSObj.buffAdd`, as Go).

**Seed rows.** Rotation skills are type 6, `target_type` 2, `buff_rate` 100, `buff_round` 2 (Ảo Ảnh 3), 17 families × 3 levels:

| Family | Skills | Buff (kind) | Effect text (lv1 / 2 / 3) |
|---|---|---|---|
| skill_elf_1 Thánh Ca | 6227-6229 | 2721-2723 (2) | 10 / 20 / 30 % of attack as HP per turn |
| skill_elf_2 Uy Quang | 6230-6232 | 2724-2726 (3) | prop 5 +5 / 8 / 13 % |
| skill_elf_3 Chế Tài | 6236-6238 | 2732-2734 (3) | prop 4 +5 / 8 / 13 % |
| skill_elf_4 Thủ Hộ | 6239-6241 | 2735-2737 (3) | prop 7 +10 / 20 / 35 % |
| skill_elf_5 Bảo Hộ | 6242-6244 | 2738-2740 (3) | prop 6 +10 / 20 / 35 % |
| skill_elf_6 Đề Phúc | 6245-6247 | 2741-2743 (3) | "tăng 5 / 7 / 12 kháng debuff, +30 % Danh Y" |
| skill_elf_7 Chú Phọc | 6248-6250 | 2744-2746 (23) | proc Thất Phòng 6284-6286 (60/70/80 %, buff 2777-2779 props 6/7 −10/15/20 %) |
| skill_elf_8 Độc Đao | 6251-6253 | 2747-2749 (23) | proc Độc Đao 6278-6280 (**type 2**, 70/80/90 %, Trúng Độc 2774-2776 kind 6, no amount) |
| skill_elf_9 Bí Diệm | 6254-6256 | 2750-2752 (23) | proc Bí Diệm 6287-6289 (10/20/30 %, Pháp Lực Nhiên Thiêu 2780-2782 kind 5 "giảm 10/15/20 % MP hiện tại") |
| skill_elf_10 Lĩnh Vực | 6257-6259 | 2753-2755 (3) | "tăng 5 / 7 / 12 % debuff chính xác" |
| skill_elf_11 Ảo Ảnh | 6260-6262 | 2756-2758 (3) | prop 11 +7 / 10 / 15 %, 3 rounds |
| skill_elf_12 Cổ Vũ | 6263-6265 | 2759-2761 (3) | "giảm 20 % HP, tăng 2 / 3 / 5 % tấn công" |
| skill_elf_13 Chi Nộ | 6266-6268 | 2762-2764 (20) | "chuyển 5 / 8 / 13 % sát thương phản đòn" |
| skill_elf_14 Chi Diệp | 6269-6271 | 2765-2767 (22) | "giảm 5 / 8 / 13 % sát thương cuối khi bị tấn công" |
| skill_elf_15 Chi Hoặc | 6272-6274 | 2768-2770 (23) | proc Tịch Mịch 6293-6295 (3/5/7 %, Trầm Mặc 2783-2785 kind 10 = silence) |
| skill_elf_16 Chi Ngụy | 6275-6277 | 2771-2773 (2) | "chuyển 10 / 20 / 30 % sát thương chuyển hóa thành HP" |
| skill_elf_17 Phong Ấn | 6296-6298 | 2786-2788 (23) | proc Phong Cấm 6299-6301 (70/80/90 %, Phong Ấn 2789-2791 kind 10) |

Not rotation skills: `skill_elf_1_b` 6233-6235 (type 5, no buff), `*_b2s2` 6281-6283 / 6290-6292 (type 8, buff -1), `skill_elf_16_b2s1`
6302-6304 Luyện Huyết (type 11, no buff), 6407 Phản Xạ Thuẫn (shares `code_name` skill_elf_13 level 1, `target_type` 8, buff 3032 "phản xạ 150 %").
The proc rows' `buff_rate` is the chance; the owner buff text repeats it (Chú Phọc text 60/70/80 % = row). Bí Diệm's owner text says
"5 / 8 / 13 % MP", the proc buff says 10 / 15 / 20 %: Go uses the proc buff. The Go seed overlay `data_tbl_buff_doc_dao_poison.sql` (2774-2776
state 40, "mất 2 / 3 / 5 % giới hạn HP", owner rule 2026-10-28) is **not** in the H5 import (stock rows, state -1).

**H5 engine fit and classification** (`combat/mechanics/fairy-battle-rules.ts`, `fairy-battle.ts`, `hit-reactions.ts`):

| Skill | H5 | How |
|---|---|---|
| Uy Quang, Chế Tài, Thủ Hộ, Bảo Hộ, Ảo Ảnh | implemented | row props through `buildBuffDef` / `applyBuff` (percent of the pre-buff value) |
| Thánh Ca | implemented | `parseHot` kind 2 "lực tấn công chuyển thành HP" -> HOT of the caster's attack, ticks from the next round (`rHp`) |
| Đề Phúc | implemented (kháng debuff); approximated | prop 58 +N (debuff resist, all kinds); the +30 % Danh Y part is not modelled (no Danh Y in H5 battle) |
| Lĩnh Vực | implemented | prop 32 +N (debuff accuracy) |
| Cổ Vũ | implemented | at cast, +B % attack and magic attack per 20 % of max HP lost (no mods at full HP: icon only) |
| Chi Nộ | implemented | Go 903 reflect: X % of every hit taken back to the attacker (self hurt `sSObj.hHp`, die step), not on kill / max-HP-share hits |
| Chi Diệp | implemented | Go 901 damage taken −X % on normal hits (floor −90 %, min 1) |
| Chi Ngụy | implemented | life steal X % of the damage dealt (H5 pseudo prop 941; seed prop 41 rows mean other things), `sSObj.rHp` on the hit step |
| Chú Phọc | implemented | proc Thất Phòng: −def / −mdef % on the target |
| Chi Hoặc, Phong Ấn | implemented | proc silence status (kind 10) through the status layer |
| Bí Diệm | implemented | proc buff with `mpBurn`: holder loses X % current MP at each turn start after the landing round (idle `sSObj.uMp`, no popup) |
| Độc Đao | approximated | proc Trúng Độc ticks 2 / 3 / 5 % max HP per turn: the owner rule lives in code (`FAIRY_POISON_PCT`) since the overlay is not imported |

Procs roll on the owner's first landed hit (damage > 0) of a round while it holds the fairy buff, through `landChance` (buff_rate + debuff
accuracy − resist; debuff-immune NPCs and boss hard-control rules apply). Not modelled: Danh Y bonus of Đề Phúc; 6407 Phản Xạ Thuẫn (team
target, outside the rotation families' normal rows); satiety drain per battle (Go has none either).
