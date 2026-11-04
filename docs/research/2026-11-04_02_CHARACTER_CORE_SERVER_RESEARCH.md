# M1 "Character core" - legacy server research (stats, equip, use item, buffs, bag ops, HP/MP)

Date: 2026-11-04. Source: `D:\mcgame` (Go, read-only) + Mongo `data_tbl_*`. All citations are `file:line` relative to
`D:\mcgame\internal\` unless they start with `docs/`. Memory files in `D:\mcgame\docs\memory` were verified against code;
where they disagree, **code wins** (see section 8, "Stale memory").

## 1. Summary

The legacy server keeps a persisted `Character` (level, per-level exp remainder, 5 base attributes `att*`, 5 *distributed*
attribute points `apt*`, free points, current HP/MP/SP) and **recomputes every derived stat on each read**
(`RecalculateStats`), never persisting max HP/attack/etc. as authoritative values. Equipment and buffs are folded in at read
time through one `EquipmentStatBonuses` accumulator (flat -> float -> percent). HP/MP are plain persisted integers with no
out-of-battle regeneration; they are refilled only by potions, NPC healer, revive items, or creation.
Equipment is moved between slot types in the same item table (slotType 1 = equipped, sid = template `position`).
`equipOn` has **no level / class / sex gate on the server** (only a broken-durability gate); the Flash client pre-checks
level/class/useType before calling `useItem`.

## 2. Entry points (RPC -> handler -> service)

All registrations are single (grep over `"<name>"` in `internal/`: no duplicates, so no last-write-wins issue).

| RPC | Handler | Service / domain |
|---|---|---|
| `changeProperty({addStrength,...})` | `presentation/rtmp/handlers/character/change_property.go:18` (reg `handlers/character/handler.go:60`) | `Character.AllocateAttribute` `domain/character/character.go:763` |
| `getCharAttributes()` | `handlers/scene/state.go:51` (reg `handlers/scene/handler.go:152`) | `BuildUPPPayloadWithEquipment` `domain/character/view_properties.go:98` |
| `getCharDetailData([charId?])` | `handlers/character/detail_data.go:14` (reg handler.go:59) | `DetailStatPropPayload` `domain/character/detail_props.go:65` |
| `getFinalPraDef([key?])` / `finalPraMagDef([key?])` | `handlers/character/stats.go:13` / `:28` (reg handler.go:57-58) | `aggregatedRateProp` stats.go:43 |
| `lvUp(level, passHash)` | `handlers/character/leveling.go:15` (reg handler.go:56) | `Character.ManualLevelUp` character.go:570 |
| `getInitSlot()` | `handlers/item/equip.go:40` (reg item/handler.go:176) | `Service.GetAllItems` |
| `equipOn(itemId[, slotId])` | `handlers/item/equip.go:85` (reg item/handler.go:177) | `Service.EquipItem` `application/item/service.go:660` |
| `equipOff(itemId\|slot\|sid[, toBagSid])` | `handlers/item/equip.go:166` (reg item/handler.go:178) | `Service.UnequipItem` service.go:730 |
| `useItem(targetType, targetId, slotIdOrSid)` | `handlers/item/use.go:19` (reg item/handler.go:179) | `Service.UseItem` service.go:1061 -> `applyItemEffect` :1163 |
| `useMultiItem(targetType, petId, slotId, num)` | `handlers/item/use.go:199` (reg :191) | `Service.UseMultiItem` service.go:1244 |
| `fullHpRecoverByItem(targetType, targetId[, entries])` / `fullMpRecoverByItem` | `handlers/item/recover.go:112` / `:116` (reg item/handler.go:221-222) | `Service.FullRecoverByItem` `application/item/potion.go:150` |
| `moveItem(fromSid, toSid)` | `handlers/item/bag.go:17` (reg :183) | `Service.MoveItem` service.go:758 |
| `moveItemNum(fromSid, toSid, n)` | `handlers/item/bag.go:132` (reg :184) | `Service.MoveItemPartial` service.go:902 |
| `dropItem(itemId[, md5Pass])` | `handlers/item/bag_manage.go:17` (reg :185) | `Service.DropItem` service.go:1035 |
| `bagSort()` | `handlers/item/bag_manage.go:78` (reg :186) | `Service.SortBag` service.go:1382 / `mergeBagSortItems` :1432 |
| `delBuffClient(buffRowId)` | `handlers/buff/handler.go:42` (reg :39) | `application/buff/service.go:125` `RemoveByClient` |
| `npcFuncOther(npcId, funcId)` (healer) | `handlers/npc/npc_func_other.go:23`, `handleNpcHeal` :88 | inline |

Client call shapes (decompiled Flash): `equipOn(slot.slotData.id)` (`docs/client/view/view/comp/Slot.as:1106`),
`equipOff(slot.slotData.id, index)` (Slot.as:1012; CharactorPanel.as:5502 passes `-1`), `moveItem(slot.index, index)`
(Slot.as:1001; both are **sids**), `moveItemNum(srcIdx, tgtIdx, n)` (NumPanel.as:318), `dropItem(itemId[, md5(pass)])`
(Slot.as:1401), `useItem(targetType, petId, slotId)` (Player.as:926...), `changeProperty({addStrength,addAgility,addStamina,
addIntelligence,addEnergy})` with **string** values (CharactorPanel.as:6448), `lvUp(level, delPass)`
(CharactorPanel.as:5951), `fullHpRecoverByItem(a, b, [{sid:itemId, priority:healAmt-binded}])` sorted ascending by priority
(PortraitCanvas.as:1118-1130; the two leading args are targetType and targetId; `recoverFullHp` also refuses on maps
2007-2009, PortraitCanvas.as:1090). Rate limits are mirrored client+server: equipOn/equipOff/moveItem/moveItemNum/dropItem
1100 ms, useItem 800 ms, bagSort 3000 ms, fullHp/MpRecoverByItem 800 ms (`infrastructure/rtmp/dispatcher.go:130-194`,
`docs/client/config/RPCConfig.as:36-65`). Error returns: handlers either return `rtmp.ErrorToResponse(err)` as a *value*
(coded 4xx/500 body, no red toast) or a raw error; there is no per-error push except where noted.

## 3. Rules

### 3.1 Base stats (single formula for all classes)

Class differs **only** through data: base attributes `att_*` and per-mille aptitudes `apt_*` from `data_tbl_class`.

Constants (`domain/stats/profile.go:7-25`; the memory file `unified-stat-formula.md` lists stale coefficients, ignore it):

```
HP_STA 8.50   MP_INT 4.07  MP_ENG 5.75   MAX_SP 150 (fixed)   GROWTH_SCALE 0.8 (DefaultGrowthScale)
ATK_STR 1.90  ATK_AGI 0.50     MATK_INT 2.00  MATK_ENG 0.60
DEF_STA 2.57  DEF_AGI 0.85     MDEF_INT 2.71  MDEF_ENG 4.60
HIT_STR 0.08  HIT_AGI 0.05  DODGE_AGI 0.11  SPEED_AGI 1.70  CRIT_AGI 0.10
Seeds for characters: HP 20, MP 5, Hit 100, Speed 100   (character.go:629-641)
```

Profile inputs for a character (character.go:629-647): `Strength = c.Strength(att) + c.AptStrength(distributed points)`;
same for agility/stamina/intelligence; `Energy = c.Spirit + c.AptEnergy`; class aptitude `ClassApt*` = `apt_*` from the class
row (re-read from game data on every character load, `application/character/service.go:207-221`).

Formula (`profile.go:74-113`, every `int()` truncates toward zero):

```ts
const eff = (v: number, aptPerMille: number) => (v + (v * aptPerMille) / 1000) * 0.8;
const S = eff(str, aptS), A = eff(agi, aptA), T = eff(sta, aptT), I = eff(int, aptI), E = eff(eng, aptE);
maxHp = 20 + trunc(T * 8.5);
maxMp = 5 + trunc(I * 4.07) + trunc(E * 5.75);
maxSp = 150;
attack = trunc(S * 1.9) + trunc(A * 0.5);
defense = trunc(T * 2.57) + trunc(A * 0.85);
magicAttack = trunc(I * 2.0) + trunc(E * 0.6);
magicDefense = trunc(I * 2.71) + trunc(E * 4.6);
hit = 100 + trunc(S * 0.08) + trunc(A * 0.05);
dodge = trunc(A * 0.11);
speed = 100 + trunc(A * 1.7);
critical = trunc(A * 0.10);
criticalDmg = 150 (BaseCriticalDamagePercent, character.go:108, set at :660)
```

Worked values (computed from the formula with class rows from Mongo; Lv1, no gear, no distributed points):

| class | att S/A/T/I/E | maxHp | maxMp | atk | def | matk | mdef | hit | dodge | speed | crit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 Chiến Binh | 15/10/15/5/5 | 377 | 104 | 87 | 128 | 26 | 74 | 104 | 2 | 142 | 2 |
| 2 Nhạc Công | 8/10/8/12/12 | 161 | 323 | 42 | 63 | 81 | 237 | 102 | 2 | 143 | 2 |
| 3 Danh Y | 9/7/7/13/14 | 158 | 366 | 45 | 52 | 92 | 270 | 101 | 1 | 123 | 1 |
| 4 Xạ Thủ | 8/10/5/15/12 | 111 | 367 | 41 | 45 | 107 | 265 | 102 | 2 | 136 | 2 |
| 5 Thợ Săn | 11/10/11/10/8 | 244 | 212 | 62 | 87 | 59 | 153 | 103 | 2 | 140 | 2 |
| 6 Hiệp Sĩ | 12/12/10/8/8 | 237 | 165 | 78 | 91 | 41 | 119 | 103 | 3 | 152 | 3 |

Class 1 at Lv5 (att +4 each): maxHp 472, maxMp 185, atk 112, def 165. Use these as unit-test vectors.

### 3.2 Level, exp, attribute points

1. Creation: `NewCharacter` starts at Lv1, all five `att*` = 10, then `applyClassDefaultStats` overwrites `att*` with the class
   row's `att_*` and sets `ClassApt*` (`application/character/service.go:64-82,187-205`; `character.go:376-529`). Then
   `RecalculateStats` and `CurrentHP/MP = MaxHP/MP` (service.go:75-79); `CurrentSP = MaxSP` (character.go:527). Start map 1,
   pos (170,1230), `SelectedMoneyType 1`, `SelectedGoldType 3`, bag/bank tabs 1 (character.go:392-399, 460-465).
2. Level-up per level: `+5 AttrPoints` (and `MaxAttrPoints`), `+1` to each of `att` Str/Agi/Sta/Int/Spirit, then recalculation
   (`AttributePointsPerLevel = 5` character.go:1513; `GainExperience` :545-568). **HP/MP are not restored** and `CurrentHP`
   is untouched on level-up (only clamped to the new max by `RefreshRuntimeStats` :677-692).
3. Auto level-up applies only while `Level < AutoLevelCap = 20` (character.go:1511, loop :548). From level 20 on, a level
   needs the client button -> `lvUp(level, md5Password)` (leveling.go:15-135): requires a verified secondary password
   (else `false`, plus a failure push), then `ManualLevelUp` :570-589 (needs `Level < MaxLevel = 160` and
   `Experience >= needed`); on success: save, `SendExpAndLevelUpCallbacksWithEquipment(.., 0, true)`, event bus level-up,
   reply `true`; otherwise `false`. H5 can drop the password step for M1 but must keep the level-20 split.
4. Exp storage: Go stores `Experience` as the **remainder inside the current level** and derives the wire value
   `exp = CumulativeExpCapped()` = `cum(level) + experience`, capped at `cum(level+1) - 1` while `level < 160`
   (character.go:610-627, `domain/character/player_level_exp.go:169-195`). Cumulative table: `playerLevelExpCumulative[level-1]`
   (player_level_exp.go:5-167, 161 entries, levels 1..161; level 1 -> 1, 2 -> 73, 3 -> 358 ...). H5 stores cumulative exp
   (quest.md) which is equivalent; the shared `LEVEL_EXP` has only levels 1..21 (`packages/shared/src/protocol.ts:326`), M1
   needs levels > 21 only if `lvUp` is in scope -> extend the table from player_level_exp.go (full copy is data, not a rule).
5. `NormalizeAttributePoints` on every load: if `MaxAttrPoints < (level-1)*5`, the deficit is added to both `MaxAttrPoints`
   and `AttrPoints` (character.go:694-705, called from `infrastructure/persistence/postgres/character_repository_scan.go:115`).
6. `onChooseCharactor`/`onUPP` send `exp = cumulative capped`, `attLastPoint = AttrPoints`, `lastPoint` = same as string when
   the stored one is "0"/"" (view_properties.go:67-73).

### 3.3 changeProperty (attribute point allocation)

(`handlers/character/change_property.go:18-99`)

1. Arg 0 must be a map; else `ErrInvalidArgs`. Each of `addStrength|addAgility|addStamina|addIntelligence|addEnergy` is parsed by
   `ParseStatString` (`presentation/rtmp/utils/amf_helper.go:22-44`): string -> `Atoi`, any error or negative -> 0;
   float -> truncate, negative -> 0; anything else -> 0.
2. `total <= 0` -> return `null`, **no push**. `total > AttrPoints` -> push `onSystemMidMsgOrNote("Không đủ điểm thuộc tính!")`,
   return `null`, nothing changed (all-or-nothing). No per-attribute cap, no rate limit entry, **no cost** (no currency).
3. Apply: for each point `AllocateAttribute` (character.go:763-789) increments the **distributed** counter
   `AptStrength|AptAgility|AptStamina|AptIntelligence|AptEnergy`, `AttrPoints--`, `DistributedAttrPoints++`, recalculation.
   The base `att*` columns are NOT touched (they only grow with level). Client attribute `addEnergy` maps to Go `spirit`.
4. Save, then `onUPP(BuildStatRefreshUPPPayloadWithEquipment)` = `ToDTO()` merged with refreshed view props, plus nested
   `property`, minus the "noisy" keys `bagSlotNum, bankSlotNum, petMaxNum, honor, chival, pop, expRe, expBattle`
   (view_properties.go:7-16, 102-118). Reason: Flash `CallBack.onUPP` shows slot-expansion notices when those keys exist
   (`docs/memory/exp-leveling.md`). Reply value `null`.

### 3.4 Final stat assembly (what getCharAttributes / onUPP / onInitViewProp contain)

Order in `BuildViewPropertiesWithEquipment` (view_properties.go:30-40) and `ApplyEquipmentBonuses` (equip_stats.go:364-401),
all on a **copy** of the character:

1. Copy, `RecalculateStats()`.
2. If any gear/buff **flat attribute** bonus (Str/Agi/Sta/Int/Spirit): add to the copy's `att*` and `RecalculateStats()` again
   (so gear attributes go through aptitude x0.8 scaling and then through HP/attack coefficients; `attStrength` in the payload
   then includes gear).
3. Flat bonuses for every other prop added to the computed stats (`addFlatBonus` :420-455).
4. "Float" (rate) bonuses to `Final*` rate fields (`addFloatBonus` :457-506).
5. Percent bonuses: `value = value + value * pct / 100` (integer division) on MaxHP/MaxMP/MaxSP/Attack/MagicAttack/Defense/
   MagicDefense/Speed only (`applyPercentBonus` :508-531, `applyPct` :571).
6. `syncFinalFields()` (:533-552): `finalStrength = att + apt` (per attribute, **not** including gear flat because gear was added
   into `att` in step 2), `finalHp = maxHp`, `finalMp`, `finalSp`, `finalAttack`, `finalMAttack`, `finalDefence`, `finalMDefence`,
   `finalHit`, `finalDodge`, `finalCritical`, `finalSpeed`, `finalCriticalDamage = criticalDmg - 150`.
7. `applyFinalAdds` for raw ids 13/14/31/34/61.

`buildViewProps` output keys (view_properties.go:42-91): everything in `ToDTO()` (character.go:802-1001: id, name, classId,
gender, level, exp, cl, qn, att{Strength,Agility,Stamina,Intelligence,Energy}, attLastPoint, currentHp/Mp/Sp, hpMax/mpMax/spMax,
pos*, money*/gold*, apt{Strength...} **as strings of the distributed points**, apt*Evolution, all `final*`, ...) overridden with
`hpMax, mpMax, spMax, propHit, propDodge, propCritical, propSpeed, finalHp, finalMp, finalSp, finalAttack, finalMAttack,
finalDefence, finalMDefence, finalHit, finalCritical, finalDodge, finalSpeed, finalStrength..finalEnergy, attLastPoint, lastPoint,
spirituality, ee, en, ef`. `BuildUPPPayload*` (view_properties.go:120-135) = `ToDTO()` + those props at top level + `"property": props`.

Reply shapes:
- `getCharAttributes()`: builds the same payload as above (with equipment), sets `expSkill = char.Experience` (**per-level remainder**,
  state.go:74), pushes it as `onUPP` AND returns it (state.go:76-82).
- `getCharDetailData([charId])` -> object of exactly 26 numbers (detail_props.go:14-39): `finalCombo, finalCounter, finalRebornRate,
  finalBreakReborn, finalDefy, finalResiDefy, finalResiCritical, finalDizzy, finalConfusion, finalSleep, finalPoison, finalRage,
  finalLight, finalResiDizzy, finalResiConfusion, finalResiSleep, finalResiPoison, finalResiLight, finalResiRage, finalReduceHurt1,
  finalReduceHurt2, finalEnhPhyHurt, finalEnhMagicHurt, finalPraDef, finalPraMagDef, finalCriticalDamage`. Missing -> 0. With no gear/buff
  all are 0 (`finalCriticalDamage` 0 = 150-150). Arg 0 optional (another character's id; **no visibility check**).
- `getFinalPraDef([key])` / `finalPraMagDef([key])`: returns the number `props["finalPraDef"|"finalPraMagDef"]` (float, 0 for base
  chars); if arg 0 is a non-empty string returns `{key, value}` instead (stats.go:13-41). Client call site not verified.
- `lvUp`: `true`/`false` (see 3.2); pushes in section 6.

### 3.5 Equipment contribution

Template columns (`data_tbl_equipt_template`; sample row id 152): `main_prop1/2`, `main_prop_num1/2`, `prop1/2`, `prop_num1/2`,
`bind_prop_num`, `active_equip_id`, `active_prop_type/num`, `hole_num`, `endure_max`, `position`, `kind`, `type`, `req_level`,
`req_class` (`"|1|2|...|"` pipe list), `bind_type`, `color_code`, `res_code*`, `suit_id`. **There is no sex column** (only
`res_code_male/female`), so "sex gate" does not exist anywhere.

`aggregateEquipBaseStats` (`application/item/equip_stats.go:95-140`), per equipped item (`FindEquipped` = slotType 1):
- main line 1/2: instance `Properties.mainProp1/mainPropNum1` if `mainProp1 > 0`, else template; value `int(num * starMult)`;
  `starMult` table by star level `[1,1.1,1.21,1.33,1.46,1.61,1.77,1.94,2.14,2.36,2.6]` (:83-93).
- `bindMainPropNum1/2` (instance property, seeded from template `bind_prop_num`, service.go:1792-1793) is added **to the same prop
  as the main line whenever `> 0`, without checking `IsBound`** (:107-123). Ambiguous vs. the tooltip intent; see section 8.
- `prop1/2`+`propNum1/2` (instance, else template) without star multiplier.
- gems (`t1..t10` holes, `aggregateGemStats` :142-161), active-soul pair bonus (:163-185), maker-set % (:187-196): out of scope for M1.

Raw equipment prop id -> stat (`EquipmentPropToStat`, `domain/character/equip_stats.go:113-166`):
1 maxHp, 2 maxMp, 3 maxSp, 4 attack, 5 magicAttack, 6 defense, 7 magicDefense, 8 hit, 9 dodge, 10 counter(final), 11 speed,
12 combo(final), 13 critical (flat), 14 defy (float), 20 Strength, **21 Stamina (not Agility)**, 22 Intelligence, 23 Spirit,
24 maxHp **percent**, 25 maxMp **percent**, 26 reborn rate, 27 resi-critical, 28 debuff-resist, 29 resi-defy; others ignored.
Only 24/25 are percent (`EquipmentPropUsesPercent` :168-175). Memory file item-inventory.md lists 21=Nhan(AGI) - code maps 21 to
Stamina; the legacy Vietnamese label table and the code disagree (see section 8).

Durability: `IsBroken()` (`durability <= 0`) only blocks equipping (service.go:669-671; `domain/item/item.go:129-134`). Durability
does **not** scale or disable stats anywhere in aggregation (equip_stats.go:25-63 never reads it). **Confirmed negative:** no
production code reduces durability (`ReduceDurability` has no callers outside tests; only `repair`/admin write it), so equipment
never breaks by play. New equipment gets `durability = maxDurability = endure_max` (service.go:1751-1769). Repair price `damage*10`
(service.go:1623-1634).

### 3.6 Buff contribution

Buffs are an extra bonus provider merged into the same accumulator **after** equipment (`application/item/equip_stats.go:49-60`,
`application/buff/service.go:163-181`). For each active buff the template row (`data_tbl_buff`: `prop1..prop6`, `prop_num1..6`,
`percent_flag`) is applied (`application/statfeature/character.go:357-373`): `percent_flag == 1` -> `applyPercentCharacterPropBonus`
(percent for HP/MP/SP/attack/magic attack/defense/magic defense/speed, flat for crit/defy, rate fields as float); else flat
(`statfeature/helpers.go:326-377`). Buff prop ids use the **common-feature dictionary** (`CommonFeaturePropToStat`,
equip_stats.go:177-270), identical to the client `BUFF_PROP_NAME_ARR` (1 HP ... 14 defy, 17-20/23/30 resistances, 31 resi-crit,
52-57 accuracies, 58 debuff-resist, 59/60 final reduce, 61 resi-defy, 62/63 final enhance, 71 crit damage, 72 break reborn) and
differs from the equipment dictionary for 21-29.

### 3.7 HP/MP current values

1. Stored: `current_hp/current_mp/current_sp` on `player.characters` (baseline migration `20260328184527_baseline_mcgame_schema.sql:2300`).
   A hot cache (`infrastructure/cache/player_cache.go:772`, `cached_character_repo.go:84-95`) holds them in memory and flushes later.
2. `max_*` are recomputed on **every load** by `RefreshRuntimeStats` (`character_repository_scan.go:116` -> character.go:677-692): base
   formula only (no gear/buff), then `CurrentHP/MP/SP` are clamped to that base max. Consequence: relog with HP-gear loses current HP above
   base max (ambiguous/lossy, section 8).
3. **No out-of-battle regeneration**: grep for regen/auto-heal/tick on character HP finds nothing server-side (only pet and combat).
4. Restore sources: creation (full); level-up: **no**; `useItem` potion; `fullHp/MpRecoverByItem`; NPC healer `npcFuncOther`
   (cost below); `UseBloodBag` +500 HP, `MazeRecover(hp)`, `BBGoldRelive` (cost 100 `moneyBind` -> full HP+MP)
   (`handlers/combat/recovery.go:15-135`); battle end writes back (`handlers/combat/battle.go:412`).
5. Equip/unequip: clamp `CurrentHP/MP` down to the new effective max (`SyncToEffectiveMax` character.go:735-745; used by
   `syncHPMPAfterEquipChange` equip.go:20-38); push only if clamped.
6. NPC healer (`handleNpcHeal`, npc_func_other.go:88-189) for `data_tbl_npc.type == Heal`: `funcId` 1 = self (paid), 2 = free (heals
   nothing for the character: `healChar` only for 1 or 3), 3 = self+active pet. Cost `ceil((missingHP + missingMP*1.3) * mult)`,
   `mult = min(1, BasicGetMoney[level] / 70000)` (`gamedata/predef/quest_reward.go:36`; Lv1-5 = 2380, 6-10 = 2783, 11-15 = 3657,
   16-20 = 5135 ...; index 0 = 1), paid from `moneyBind` unless `SelectedMoneyType == 2` (then `money`). Insufficient ->
   `onSystemSay("Khong du ngan phieu!"|"Khong du bac!")` and nothing changes. Ambiguity: `funcId 2` free option is odd (see section 8).
   Pushes: `onUPP{currentHp,currentMp}`, then `onAddMoney(charId, key, -cost, remaining)` when cost > 0.

### 3.8 equipOn / equipOff / auto-equip

**Slot mapping (data-verified).** Equipped item: `slotType = 1`, `slotIndex = template.position - 1`, `sid = 1 + slotIndex = position`
(`domain/item/item.go:263-268`, `ParseSID` :297-300 accepts sid 1..22; `EquipItem` auto-slot service.go:681-690). Positions
(Mongo `data_tbl_equipt_template` grouped by position/kind/type): 1 hat (k3 t300), 2 belt (t303), 3 main hand (k1, t100-105),
4 clothes (t301), 5 trousers (t302), 6 jewelry1 (k4 t402), 7 sub hand (k2 t200-205), 8 necklace (t400), 9 ring (t401),
10 shoulder (t305), 11 jewelry2 (t403), 12 shoe (t304), 13 gather tool (k12), 14 flyer (k10), 15-20 magic weapons (k8),
21 dress (k11), 22 wing (k13); positions 50-57 are **pet equipment** (k9, `petEquipOn`, not `equipOn`).
The Go enum `EquipSlotWeapon..Cape` (item.go:30-41) has misleading names and only 11 entries; ignore it, use the position table.

Gates in the live path (`EquipItem` service.go:660-728):
1. Item exists and belongs to the character (`ErrItemNotOwned`); `IsEquipment()` (`itemType == 2`) else `ErrCannotEquip`;
   `IsBroken()` -> `ErrItemBroken`.
2. **No** level, class, sex, bind-on-equip, or source-slot-type check (**confirmed negative**: `ReqLevel` appears only in the consumable
   path service.go:1105, craft/prefix/soul handlers; `CanEquipItem` character.go:535 has no callers on this path). Level/class
   gating exists only client-side for double-click equip: `Player.useItem` checks `useType 1|3`, `level >= reqLevel`
   (`"Cấp độ bạn chưa đủ!"`), `reqClass` contains `|classId|` (`"Nghề nghiệp bạn không phù hợp!"`), and `useType` otherwise
   (`"Vật phẩm này bạn không dùng được!"`) (`docs/client/object/Player.as:855-881`, strings `config/Language.as:2268-2270`).
   **Recommendation for H5:** enforce `req_level`/`req_class` server-side as well and send `onSystemMidMsgOrNote` with those strings.
3. Target slot: `equipSlot < 0` (client always sends none -> `-1`) -> `position - 1`. Legacy "ring" special case redirects slot 7 -> 8
   when 7 is occupied and 8 free (service.go:692-702), but position 8 is a *necklace* and 9 a *ring* in the data, so the branch would put a
   necklace into the ring slot: **do not port**; use `slot = position - 1` strictly and reject `position > 22` (pet equip).
4. If the slot is occupied: the occupant moves to the **first empty bag slot** (`FindFirstEmptySlot(bag, maxBag)`; error when none) and the
   new item takes the slot. Net effect is a swap bag <-> equip. Returns the displaced item.

`equipOn` handler pushes, in order (equip.go:85-164):
1. `onMoveItem(oldSid, newSid, itemId)` (floats).
2. if displaced: `onMoveItem(1 + slotID, displacedSid, displacedId)` where `slotID` is `-1` for auto -> first arg is **0**: legacy bug, the
   displaced item's old sid should be the equip sid; H5 should send the real equip sid. Then `onSystemSay("Túi đồ còn N ô trống!")` when free
   bag slots `<= 10` (`BagLowSlotThreshold`, service.go:332; handler.go:379-387).
3. `syncHPMPAfterEquipChange`: `onUPP{currentHp,currentMp}` only if clamped.
4. `onUPP{ee,en,ef}` (element state, cosmetic; send `{ee:"0",en:0,ef:false}` for M1).
5. `onUPP{property: <full view props with gear>}` (handler.go:322-330).
6. `onEquipActiveList(map sid(1..22) -> bool)` (soul-pair activation; all `false` for M1).
7. Appearance (only when the item's `position` is 3, 14, 21, 22; section 6), sent to self and broadcast to the scene
   (`sendAppearanceCallbackToSelfAndScene` appearance.go:156-173, `BroadcastToScene(channel, room, exceptConn=self, ...)`).
8. Reply `{success:true, equipItems:[itemDTO...]}` (all equipped items).
On error: `ErrorToResponse(err)` value (no pushes).

`equipOff` (equip.go:166-250): arg 0 may be an item id (if that item is equipped, its slot is used), a slot 1..22 (`slot-1`), or any sid
(`ParseSID`); optional arg 1 = target bag sid (`-1` ignored). `UnequipItem` (service.go:730-756) moves the item to the first empty bag slot
(error if full, returned raw). If arg 1 given: `MoveItem` to that bag slot afterwards (swaps silently with an occupant, without telling the
client). Pushes: `onMoveItem(oldSid, newSid, itemId)`; clamp `onUPP{currentHp,currentMp}` if needed; `onUPP{ee,en,ef}`; `onUPP{property}`;
`onEquipActiveList`; appearance-off; `stoneSealOnEquipChange` (no args; ignore); low-bag `onSystemSay`. Reply `null`.

Auto-equip through `useItem` (use.go:124-139, service.go:1070-1086): equipment items reaching `useItem` are auto-equipped with the same
`EquipItem(-1)`; pushes: `onMoveItem(oldSid, newSid, itemId)`, displaced `onMoveItem(1+usedItem.SlotIndex, displacedSid, displacedId)` (correct here),
`onUPP{ee,en,ef}`, `onUPP{property}`, `onEquipActiveList`, appearance. **No HP/MP clamp in this path** (differs from `equipOn`). Reply
`{success:true, itemId, effects:[]}`. This is the path the double-click uses, so H5 should treat `useItem` on equipment and `equipOn` identically.

### 3.9 useItem family

Dispatch (`Service.UseItem` service.go:1061-1161):
1. Load item by id (handler first tries `slotId` as item id, then as sid via `ParseSID`, use.go:68-78); must belong to the character.
2. Equipment -> auto-equip (3.8). Otherwise template lookup (`data_tbl_item_template`): `char.Level < req_level` -> `ErrInsufficientLevel`
   -> handler pushes `onSystemMidMsgOrNote("Cấp độ không đủ!")` and returns `null` (use.go:111-114).
3. `useType` is only checked server-side as `== 4` -> `ErrCannotUseItem` (service.go:1172-1174); there is **no** server enforcement of
   target eligibility (1 char / 2 pet / 3 both): the client gates it (Player.as:855-881). **No class check server-side** for consumables.
4. Effect registry (service.go:121-181): `typeHandlers[tpl.type]`: 500 scroll, **501 potion**, **502 food**, 503 gem socket, 504 star stone,
   505 skill book, 506 creature book, 507 pet func, 508/509/550 quest item, 512/513 pet equip, 516 formula, 520 target item; stubs
   (message "loại vật phẩm ... chưa được hỗ trợ", not consumed) for 510, 511, 514, 515, 517-519, 521-525, 527, 551, 552. Then award table, then
   fallback chain (`box`, `wallet`, `buff` (useType 2 = message only), `default`). Template id 719 is a no-op.
5. **HP/MP potions (M1 focus).** Template rows have `i1 = i2 = 0` for every real potion (Mongo: ids 1,2,4,110,113,321,371,1975 and
   158,125,126,127,322,370,1974 all `type 501`, `use_type 3`, `stack_max 99999`, `bind_type 0`, `req_level` 1/1/1/1/30/40/60/90 for
   HP and 1/1/1/30/40/60/90 for MP). Heal amounts are **hardcoded** server+client (`application/item/potion.go:98-117`, mirrors
   `PortraitCanvas.as:1096-1105`):

   | HP potion id | 1 | 2 | 4 | 110 | 113 | 321 | 371 | 1975 |
   |---|---|---|---|---|---|---|---|---|
   | HP restored | 300 | 600 | 600 | 1000 | 2000 | 3000 | 6000 | 9000 |

   | MP potion id | 158 | 125 | 126 | 127 | 322 | 370 | 1974 |
   |---|---|---|---|---|---|---|---|
   | MP restored | 300 | 600 | 1000 | 2000 | 3000 | 5000 | 7000 |

   Apply (`effect_potion.go:25-73`): `hp = tpl.i1`, `mp = tpl.i2`; if both 0 use the table; amount is capped at
   `max(char.MaxHP, effectiveMaxHP) - CurrentHP` (effective max = base + gear + buffs, `computeEffectiveMax` potion.go:142-148). The item is
   **always consumed** (`NewEffectResult().ConsumeItem = true`, effect.go:98-102) even when HP is already full (no heal, no `onUPP`,
   but the slot push still happens) - legacy quirk; H5 should refuse with a message instead. Quirk 2: for rows with non-zero `i1/i2`
   the handler heals `i1` HP / `i2` MP; in the data those columns are **buff ids** for a few potions (e.g. id 2427 `i1=2494`), so
   do not use `i1/i2` as amounts. Dispatcher `CanHandle` is moot because the type registry catches all 106 type-501 rows (22 of them
   `use_type 1` exp/skill-point potions get consumed with no effect).
6. Food (type 502, 143 rows; 48 with `i1/i2`): `effect_food.go:15-60` same HP/MP heal with `i1/i2` as amounts (no cap table).
7. Consume order: effect runs first, then stack `-1` (or delete at 0) (service.go:1109-1122) - i.e. effect-then-consume; a failure inside the
   effect returns before consumption.
8. Pushes after success (use.go:170-184): `onUPP{money, currentHp, currentMp}` only when HP/MP actually restored;
   `onDelCharactorSlot(itemId, oldSid)` if stack hit 0 else `onAddCharactorSlot(itemDTO)`; then `sendEffectCallbacks` (messages, granted items,
   pets...). Reply `{success:true,itemId,effects:[]}`. Persist: `charService.Update(char)` after the effect.
9. `useMultiItem(targetType, petId, slotId, num)` (service.go:1244-1331): item must be consumable (`itemType==1`) and `stack >= num`
   (`ErrInsufficientItems`); applies the effect `num` times with `uctx = nil` (so caps use base `MaxHP`, not gear), consumes `num` at the end.
   Pushes: `onUPP{currentHp,currentMp}` when HP/MP changed; `onDelCharactorSlot(itemId, slotId)` only when the stack is gone - **no
   `onAddCharactorSlot` / stack update for a partial stack** (legacy gap; H5 should send `onAddCharactorSlot`). Reply
   `{success:true,count,result:{consumed,remaining,item_id,hp_healed?,mp_restored?}}`. Args are cast with `.(float64)` (panic on other types).
10. `fullHpRecoverByItem`/`fullMpRecoverByItem` (recover.go:189-303, potion.go:150-274): `targetType 1` = character, `2` = active pet. Entries from
    arg 2 (`sid` | `id` | `itemId` = **item id**, `priority`), sorted ascending by `(priority, itemId)`; if the client sent none the server scans the bag
    consumables itself with `priority = healAmount - (bound ? 1 : 0)` (:120-150) - lowest first, **bound before unbound at equal amount**. Loop: stop
    when deficit `<= 0`; per entry `needed = ceil(deficit / healAmount)` capped at stack; HP/MP clamped to effective max; stack reduced or deleted.
    Pushes per consumed entry: `onDelCharactorSlot(itemId, sid)` or `onAddCharactorSlot(itemDTO)`; then `onUPP{money,currentHp,currentMp}` for the
    character. Always returns `null`; no pushes when nothing to heal/no entries. Non-potion or wrong-kind entries are skipped.
11. `useType` is not otherwise relevant for M1; `req_class` of consumables is client-gated.

### 3.10 Bag operations

All on `slotType 0` (bag, sids 2101-2310 = 7 pages x 30; `ParseSID` item.go:297-322). `DefaultBagSlots` constant says 210 but only `bagSlotNum`
pages (default 1, max 7) are open; page 8 = quest bag (2311-2340), 9 = pet bag (2341-2370) (exp-leveling.md; handler `MoveItemToPage` bag.go:226+).

- `moveItem(fromSid, toSid)` (bag.go:17-130; service.go:758-857): source must exist (`ErrItemNotFound` value). Destination empty -> simple move.
  Destination occupied: (A) `CanStack` (stackable = itemType consumable/material, same template, bound flag, slotType and colorCode,
  item.go:111-123) -> merge; if `existing + moving > tpl.stack_max` (when `stack_max > 0`) the whole move **fails** with `ErrCannotStack` (no partial
  merge); the source row is deleted. (B) otherwise **swap** (3-step through a temporary slot index -1). No check that the destination sid is within
  the opened pages or that an item may sit in an equip slot (guard in H5). `fromSid == toSid` is not special-cased.
  Pushes: merge -> `onAddCharactorSlot(destDTO with sid=toSid)` then `onStackItemInto(fromSid, toSid, srcItemId, destItemId, mergedCount)`; swap ->
  `onSwapItem(fromSid, toSid)`; plain move -> `onMoveItem(fromSid, toSid, itemId)` (+ argless `onEquipOn` if either side is an equip slot). Reply
  `{success:true}`.
- `moveItemNum(fromSid, toSid, n)` (bag.go:132-214; service.go:902-1033): needs stackable item with `stack >= n` (`ErrCannotStack`; note `n <= 0` is
  not validated). Destination empty -> create a new row with `n` (inherits bound; **not** colorCode - legacy omission) and decrement the source;
  destination same-stack -> merge (`stack_max` check as above); different item -> `ErrSlotOccupied`. Dragging onto itself is a no-op. Pushes:
  `onAddCharactorSlot(destDTO sid=toSid)` then `onDelCharactorSlot(srcId, fromSid)` if source empty else `onMoveItemNum(fromSid, srcId, remaining)`.
  Client sends `n` from the amount dialog (NumPanel.as:318).
- `dropItem(itemId[, md5Pass])` (bag_manage.go:17-76): if arg 1 present it must be a non-empty string verified as the secondary password (else
  unauthorized value + failure push); the item must belong to the character; **any** slot type (even equipped, bound or quest) is deleted outright.
  Push `onDelCharactorSlot(itemId, sid)`; reply `{success:true}`. No bound/tradable/quest restriction, no confirmation server-side.
- `bagSort()` (bag_manage.go:78-131; service.go:1382-1530): takes **all** `slotType 0` rows (all opened pages together), sorts stable by
  `(templateId asc, itemType asc, unbound before bound, colorCode asc, slotIndex, id)`, merges stacks of identical keys up to
  `stackMax` (`single_flag > 0` or `stack_max <= 0` -> 1, `reward_capacity.go:112-137`; equipment never merges), deletes emptied rows, then
  re-packs from index 0 (two-phase via +10000 offset). Pushes: `onDelCharactorSlot(itemId, oldSid)` per row removed by merging, then one
  `onItemSort([{oldId: oldSid, newId: newSid, stackNum}...])` for survivors (sid values, not item ids). Reply `{success:true}`.
- `moveItemToPage`, temp bags, bank, bind-on-use: out of M1.

### 3.11 Buff persistence and pushes

- Table `player.character_buffs` (baseline migration :2029-2041): `id bigint`, `character_id`, `buff_id` (template id in `data_tbl_buff`),
  `buff_type` (1 battle, 2 timed, 3 permanent, 10 unique; `domain/buff/buff.go:9-14`), `source`, `duration_total` (s), `expires_at`, `rounds_left`,
  `battles_left`, `stack_count`, `created_at`; unique (character_id, buff_id) -> upsert (`AddOrRefresh` service.go:57-96; refresh resets `created_at` and expiry).
- Add rules: `buff_id` must exist in `data_tbl_buff`; default type permanent; `Duration > 0` sets `expires_at = now + duration` and `duration_total` seconds
  (min 1). Sources that add buffs: award type 32 items (`application/item/effect_award.go:440-477`: `durationSeconds` default = item count, `buffType` timed if
  duration > 0), PM daily right (`handlers/activity/pm_operation.go:196`). Consumable type 501/502/`use_type 2` items do **not** create buffs on this path.
- Expiry: **lazy only** - `ListActive` deletes `expires_at <= now` rows (service.go:98-121) when buffs are listed (login, stat aggregation). There is **no timer
  and no `delBuff` push on expiry** (grep: `delBuff` is sent only from `delBuffClient`); the Flash `LongBuffCanvas` removes timed buffs on its own timer.
- `initLongBuff` at login (`handlers/auth/login_callbacks.go:63,75-96`, right after `onChooseCharactor` + `updateUserBar`): payload object keyed by the **row id** as a
  string, each value `BuildLongBuffPayload` (service.go:185-209): `{id (row id), bid (template id), type, battleLeft? (if battles_left), and when expires_at:
  timeAll (duration_total), addTime (created_at unix s), timeLeft (s), ineffectiveTime (expires_at unix ms)}`. Sent even when empty (`{}`). Client:
  `LongBuffCanvas.initLongBuff` iterates values and starts a timer (LongBuffCanvas.as:230-258).
- `upLongBuff(payload)` single push after a grant (item award `reward_callbacks.go:30-39`, PM daily). Client replaces the entry with the same `id`; type 10 also removes
  same-`code_name` buffs (LongBuffCanvas.as:260-300). `onAddLongBuff` is not sent by the server (only an internal client function); use `upLongBuff`.
- `delBuffClient(id)` (buff/handler.go:42-86): bad arg -> `ErrInvalidInput`; unknown id or other owner -> push `delBuff(id)` and reply `null`; **not removable**
  (`data_tbl_buff.buff == 0`, mirrors client `buffClick`) -> no push; else delete row, push `delBuff(rowId)` then a stat-refresh `onUPP` (`SendStatRefreshUPP`
  `presentation/rtmp/utils/stat_refresh.go:21-33`). Reply `null`.
- Only buffs whose template has non-zero `prop1..6` affect stats (3.6). Of 3182 buffs, 2256 have `buff == 1` (removable) (Mongo aggregate over `buff` x `percent_flag`). Sample stat buffs:
  id 3 "Cường Hóa" kind 3 `percent_flag 0` prop 10 (counter) / 6 (defense) value 888 (flat); id 231 "Linh Lực" `percent_flag 1` prop 5 (magic attack) value 4 (= +4 %).
  `effect_time/effect_num` (e.g. 9999999) are display columns for the battle system, not used by the long-buff pipeline.

## 4. State

| Data | Legacy store | Proposed Mongo (H5) |
|---|---|---|
| level, exp (per-level remainder), `att*` (5), `apt*` distributed (5), `attr_points`, `max_attr_points`, `distributed_attr_points` | `player.characters` | `characters`: add `aptStrength, aptAgility, aptStamina, aptIntelligence, aptEnergy` (default 0). Keep H5 cumulative `exp`. `maxAttrPoints` can be derived `(level-1)*5`; `distributedAttrPoints` = sum of apt* (not needed on the wire) |
| `current_hp/mp/sp`, `max_hp/mp/sp` | `player.characters` | keep `currentHp/currentMp`; **stop treating `maxHp/maxMp` as authoritative** - compute from the formula on read (existing schema fields can remain as a cache); optional `currentSp` (default 150) only if the HUD needs it |
| `class_apt*` | game data (`data_tbl_class`), not stored | read through `GameDataService.getClass` |
| items (bag + equipped) | `player.character_items` (slotType, slotIndex, stackCount, isBound, colorCode, durability, maxDurability, enchant/star, `properties` jsonb) | existing `character_items`: allow `slotType 1` with `slotIndex = position-1`; add `starLevel` (default 0) only when star is ported; instance `properties` (mainProp...) not needed in M1 - read template values |
| buffs | `player.character_buffs` | new `character_buffs` collection: `{_id (counter 'buffs'), characterId, buffId, buffType, source, durationTotal, expiresAt, roundsLeft, battlesLeft, stackCount, createdAt}`, unique `(characterId, buffId)` |
| runtime only | element state `ee/en/ef`, `equipActiveList`, maker set | recompute; M1 returns zeros |

Restart story: legacy has no in-memory authority except the hot player cache (flushed to Postgres). Everything above survives a restart; derived
stats are recomputed on load; current HP is clamped to the **base** max on load (section 3.7.2).

## 5. Data tables

- `data_tbl_class` (6 rows): `id, name, att_strength, att_agility, att_stamina, att_intelligence, att_energy` (starting base attributes), `apt_strength, apt_agility,
  apt_stamina, apt_intelligence, apt_energy` (per-mille multipliers, 1500-2700), `start_skill` (`"1010|1086"`), `start_item` (null for all 6), `icon/res/img_code_male|female`,
  `color_code_*`. Sample: id 1 `att 15/10/15/5/5` (str/agi/sta/int/eng), `apt 2300/2100/2500/1500/1600`. Rows: see the table in 3.1 plus apt values
  (2: 1500/2200/1600/2200/2500; 3: 1800/1500/1900/2400/2400; 4: 1600/1700/1700/2700/2300; 5: all 2000; 6: 2500/2200/2200/1500/1600, order = str/agi/sta/int/eng).
- **No level/exp table exists in Mongo** (`data_tbl_*` list has no level, exp or hp tables): exp is hardcoded in Go (`player_level_exp.go`), cost multiplier in
  `predef/quest_reward.go`. Port them as constants in `packages/shared`.
- `data_tbl_item_template` (6468): `id, name, type (501 potion, 502 food, ...), kind (5), use_type (1 char, 2 pet, 3 either, 4 not usable), req_level, req_class,
  i1,i2,i3,n1..n3` (effect params; zero for all real potions), `stack_max, single_flag, price, gold, bind_type, tradable, color, color_code, icon_code, skill_id,
  prop_type, propl_num` (gem stat), `t` (expiry minutes, -1 none). 501: 106 rows (61 `use_type 3`, 22 `1`, 20 `2`, 3 `4`), 502: 143 rows (141 `use_type 1`).
- `data_tbl_equipt_template` (1872): columns listed in 3.5; position/kind/type table in 3.8; `bind_type` 0: 1752, 1: 12, null: 108; `bind_prop_num > 0` on 1811 rows;
  `req_class` values: `|1|`..`|6|` or lists. Item colour scale: item `color` 0-4 vs equipment `ColorCode` 0-5 (`color = ceil(quality/5)` display) - do not mix.
- `data_tbl_buff` (3182): `id, name, code_name, kind, type, state, buff (1 = user-removable), percent_flag (1 percent, 0 flat, -1 none), prop1..6, prop_num1..6, effect_time,
  effect_num, icon_code, target_type, level, description`.
- Id pairing for M1: equipment `position` <-> equip sid (`position`) <-> `slotIndex = position-1`; potion template id <-> hardcoded heal table (3.9);
  class id <-> `data_tbl_class.id` and `req_class "|id|"`; shop/NPC heal: `data_tbl_npc.type` Heal (npc_func_other.go:62).

## 6. Push sequence (per action)

- **changeProperty ok**: `onUPP(ToDTO + props + property, minus noisy keys)`. Not enough points: `onSystemMidMsgOrNote("Không đủ điểm thuộc tính!")`. Zero total: nothing.
- **getCharAttributes**: `onUPP(full payload, expSkill = exp remainder)`; reply = same payload.
- **Level-up (auto on exp gain, or lvUp)** (`presentation/rtmp/utils/exp_helper.go:21-52`): `onUPP(full payload, expSkill = char.Experience, noisy keys removed)` ->
  `onPlayerLevelUp({id (string), exp (cumulative capped), lp (string attr points), maxMovePnt 110, maxAct 1160, maxVigor 110, level})` -> `lvUp({}, 1, null)`. H5's
  quest flow already sends `onPlayerLevelUp`; M1 must add the `lvUp` push and the new max/stat values in `onUPP`.
- **equipOn / auto-equip / equipOff**: see 3.8 (ordered lists). Appearance pushes: position 3 (main hand) `onEquipOn{cid, resCode, ee, ef, star, dressFlag:false}` (skipped when the
  resolved weapon resCode is 0); position 14 `onFlyerOn{cid, resCode, wavCode?}`; position 21 `onEquipOn{..., dressFlag:true}` (or `onSetRes{id,res}` when dress is hidden/faked);
  position 22 `onWingOn{cid,resCode}`. Unequip: position 3 `onEquipOff{dressFlag:false, colorCode, cid, resCode}`, 21 `onEquipOff{dressFlag:true,...}`, 22 `onWingOff{cid}`, flyer none
  (`handlers/item/appearance.go:22-122`). All also `BroadcastToScene` to the other players in the room. `resCode` = `res_code_female|male` by gender (gender 1 = female), then `res_code`, then
  `res_code_female2|male2` (`application/item/appearance.go:311-338`). Other positions (hat, armour, ...) have **no** appearance push; they are visible only through `equiptList`
  in scene player payloads (`BuildCharacterAppearance`, appearance.go:56-103).
- **useItem potion**: `onUPP{money,currentHp,currentMp}` (only if restored), `onDelCharactorSlot(itemId, oldSid)` | `onAddCharactorSlot(itemDTO)`. Errors: level -> `onSystemMidMsgOrNote("Cấp độ không đủ!")`;
  others -> coded value, no push.
- **fullHp/MpRecoverByItem**: per entry `onDelCharactorSlot` | `onAddCharactorSlot`, then `onUPP{money,currentHp,currentMp}`; pet target -> `updateActivatePetObj`, `onUpdatePet` x2, `onRefreshPetProp`.
- **moveItem / moveItemNum / dropItem / bagSort**: see 3.10.
- **Buffs**: login `initLongBuff({rowId: payload})`; grant `upLongBuff(payload)`; remove `delBuff(rowId)` (+ `onUPP`).
- **NPC heal**: `onUPP{currentHp,currentMp}`, `onAddMoney(charId, "moneyBind"|"money", -cost, remaining)`.

## 7. Port notes (TypeScript)

Where it lives (existing H5 layout in `server/src/modules/`):
- `character/character-stats.ts` (pure, with `.test.ts`): `buildBaseStats(profile)`, `LEVEL_*` constants, `expForLevel`. Shared type `CharacterStats`/`ViewProps` in
  `packages/shared/src/` (new `character.ts`, re-exported from `index.ts`).
- `character/character.service.ts`: `viewProperties(doc, bonuses)`, `allocate(doc, add)`, `heal`. `CharacterService.create` must switch from `100 + stamina*10` to the real formula
  (`server/src/modules/character/character.service.ts:59-60`).
- `inventory/equipment.service.ts` (new, owns slotType 1) and `inventory/equip-stats.ts` (pure aggregation, takes template rows).
- `inventory/use-item.service.ts` (potion table, food) and bag RPCs in `inventory.rpc.ts` (`moveItem`, `moveItemNum`, `dropItem`, `bagSort`, `useItem`, `equipOn/Off`).
- `buff/buff.service.ts` + `buff.schema.ts` + `buff.rpc.ts` (`delBuffClient`), buff template accessor `GameDataService.getBuff(id)`; new `GameDataService.getEquipment(id)` accessor
  (position, req_level, req_class, props, endure_max).

```ts
// character-stats.ts
const eff = (v: number, apt: number) => (v + (v * apt) / 1000) * 0.8;
export function buildBaseStats(p: { str: number; agi: number; sta: number; int: number; eng: number;
                                    aptS: number; aptA: number; aptT: number; aptI: number; aptE: number }) {
  const S = eff(p.str, p.aptS), A = eff(p.agi, p.aptA), T = eff(p.sta, p.aptT), I = eff(p.int, p.aptI), E = eff(p.eng, p.aptE);
  const t = Math.trunc;
  return {
    maxHp: 20 + t(T * 8.5), maxMp: 5 + t(I * 4.07) + t(E * 5.75), maxSp: 150,
    attack: t(S * 1.9) + t(A * 0.5), defense: t(T * 2.57) + t(A * 0.85),
    magicAttack: t(I * 2.0) + t(E * 0.6), magicDefense: t(I * 2.71) + t(E * 4.6),
    hit: 100 + t(S * 0.08) + t(A * 0.05), dodge: t(A * 0.11), speed: 100 + t(A * 1.7), critical: t(A * 0.1),
  };
}
// inputs: str = doc.strength + doc.aptStrength (att + distributed); apt* = class apt_* from data_tbl_class.

// final assembly: base -> (gear/buff flat attrs => add to att, rebuild) -> other flats -> % (HP/MP/SP/atk/matk/def/mdef/speed: v + trunc(v*pct/100)) -> final* aliases.
export function applyBonuses(base: Stats, b: { flat: Map<StatKey, number>; pct: Map<StatKey, number> }): Stats { /* see 3.4 order */ }

// changeProperty
const keys = ['addStrength','addAgility','addStamina','addIntelligence','addEnergy'] as const;
const parse = (v: unknown) => { const n = typeof v === 'string' ? Number.parseInt(v, 10) : typeof v === 'number' ? Math.trunc(v) : 0; return Number.isFinite(n) && n > 0 ? n : 0; };
const add = keys.map((k) => parse((args[0] as Record<string, unknown>)[k]));
const total = add.reduce((a, b) => a + b, 0);
if (total <= 0) return null;
if (total > doc.attrPoints) { session.callback('onSystemMidMsgOrNote', 'Không đủ điểm thuộc tính!'); return null; }
// atomic: updateOne({_id, attrPoints: {$gte: total}}, {$inc: {attrPoints: -total, aptStrength: add[0], ...}}); then push onUPP(viewProps minus noisy keys).

// equipOn / useItem(equipment)
const tpl = gameData.getEquipment(item.templateId);            // position, req_level, req_class
if (!tpl || tpl.position < 1 || tpl.position > 22) throw RpcException.invalidArgs('item');   // 50+ = pet equip
if (item.durability <= 0 && item.maxDurability > 0) throw ...;  // IsBroken (note: legacy treats nil durability as OK)
// H5 hardening (legacy lacks it): level >= req_level, req_class includes `|${classId}|` -> onSystemMidMsgOrNote strings from Language.as:2268-2270
const slotIndex = tpl.position - 1;
// swap: occupant -> first free bag slot (error 'bag full' if none); item.slotType = 1; item.slotIndex = slotIndex; unique index is (char, slotType, slotIndex).
// push order: onMoveItem, [displaced onMoveItem(position, newBagSid, id)], clamp onUPP, onUPP{ee,en,ef}, onUPP{property}, onEquipActiveList, appearance (+broadcast).

// potions
const HP_POTION: Record<number, number> = { 1: 300, 2: 600, 4: 600, 110: 1000, 113: 2000, 321: 3000, 371: 6000, 1975: 9000 };
const MP_POTION: Record<number, number> = { 158: 300, 125: 600, 126: 1000, 127: 2000, 322: 3000, 370: 5000, 1974: 7000 };
// useItem: level check -> compute effective max -> amount=min(table, max-current); if 0 -> toast + do not consume (deviation) ->
// conditional decrement of stack (spend first), then $inc currentHp -> pushes (3.9 item 8).
```

Concurrency/ordering guidance (H5 guidelines): for potions use consume-then-credit with a conditional update (`stackCount >= 1`) and then a conditional `$inc` capped via
aggregation pipeline or `$min`; equip swap needs a transaction-free but ordered sequence (move occupant to bag first using the lowest free index, then the item) like
`shop`'s compensation pattern. `bagSort` must write in two phases (offset indexes) because of the unique index on `(characterId, slotType, slotIndex)`.

## 8. Unverified / open questions / stale memory

Stale or conflicting memory (verified against code):
- `unified-stat-formula.md` coefficients (attack 1.60, magic attack 3.38/1.15, ...) do not match `profile.go:7-25`; use the code values (this doc).
- `aptitude-stats.md` says `aptStrength` is "a class rating like 1600"; code sends the **distributed points** as a string (`ToDTO` character.go:~985) and class apt is internal only.
- `item-inventory.md` labels equipment prop 21 as Agility; `EquipmentPropToStat` maps 21 to Stamina (equip_stats.go:145-146). Which is "correct" for gameplay is **unverified**
  (data rows with `main_prop1 = 21` could be checked against item names); follow the code unless gameplay research says otherwise.
- `item-inventory.md` says `useType` is a "target gate"; server enforces only `useType == 4`.
- `buff-system.md` mentions `onAddLongBuff`; server never sends it (only `initLongBuff`, `upLongBuff`, `delBuff`).

Open / ambiguous:
1. `bindMainPropNum1/2` is added to equipment stats regardless of `IsBound` (equip_stats.go:107-123). Whether the original game intended it only when bound is **unverified**
   (tooltip `TipEquip.as` would settle it). H5 decision needed.
2. Relogin clamps current HP/MP to the base max (no gear/buff) (character_repository_scan.go:116) while equip/NPC-heal use effective max: possible intentional leniency or a bug; H5 should
   clamp to effective max on read.
3. `equipOn` displaced-item first `onMoveItem` arg is `0` for auto-slot (equip.go:131); client behaviour with `0` unverified; H5 should send the equip sid.
4. `npcFuncOther` `funcId 2` ("free") heals nothing for the character in the code (`healChar` only for 1 and 3, `totalCost = 0`): likely pet-only; client labels not checked. Out of M1 unless the healer NPC is in scope.
5. `getFinalPraDef`/`finalPraMagDef` client call sites and arg semantics not located in `docs/client` (grep for `remote.getFinalPraDef` returned nothing); kept the Go shape.
6. `lvUp` first arg (`_core.player.level`) is ignored by the server; requirement for the secondary password uses `account` secondary-password feature (not researched here).
7. Hot-cache flush interval / crash-loss window of `current_hp` not researched (`infrastructure/cache/player_cache.go`).
8. Sex-restricted equipment: no column exists; a female/male-only look is only `res_code_male|female`. **Confirmed negative** for any sex gate.
9. Equipment random property rolls and `quality` (instance `mainProp*` overrides) are out of M1; templates only.
10. Pet targets of `useItem`/`fullRecover` and soul/maker-set/suit bonuses: out of scope, not specified here.

Confirmed negatives (searched, not present): server-side level/class/sex gate in `equipOn`; durability reduction in gameplay; durability effect on stats; out-of-battle HP/MP regen; full heal on
level-up; per-attribute cap or cost in `changeProperty`; server-side `useType` target check; `onAddLongBuff` push; buff-expiry push/timer; level/exp table in Mongo; bag capacity check in `moveItem` (beyond
`ParseSID` ranges).
