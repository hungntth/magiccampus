# M1 "Character core" - legacy Flash client research

Scope: character attribute panel, equip/unequip, item use + potions, buffs, bag operations (drop / move / split / sort).
Source: `D:\mcgame\docs\client` (decompiled AS3, read-only). Paths below are relative to that folder unless prefixed.
Every fact carries `file:line` (verified by read/grep). **inferred** = not provable from the decompiled client.

## 0. Read this first - decompiler gaps (they shape what can be "confirmed")

- `system/CallBack.as` is **empty**: "Decompile aborted for this class because trait count exceeds set limit"
  (`system/CallBack.as:12`). Therefore **no push handler body** (`onUPP`, `onAddCharactorSlot`, `onDelCharactorSlot`,
  `onPlayerLevelUp`, `onEquipOn/Off`, `onEquipActiveList`, `onMoveItem`, `onSwapItem`, ...) exists anywhere in the client:
  `grep onUPP|onAddCharactorSlot|onPlayerLevelUp|onEquipActiveList` over `docs/client` returns nothing outside
  `LongBuffCanvas.as`. Payload keys for pushes can only be derived from the **consumers** (panels reading
  `_core.player.*`, `_core.data.sList`) plus the Go server (`D:\mcgame\internal\...`), marked "Go" below.
- `view/view/compDragable/BagPanel.as` (the main bag window) is also an aborted stub (`BagPanel.as:12`). The bag toolbar
  logic (sort button, double-click on a bag slot, bag tabs) is therefore **not available**. Only its Language strings
  (`BAGPANEL_S`) and the generic `Slot.as` / `Player.as` code are.
- `system/CallBackGlobal.as` holds only guild/login/shop/system pushes (`onBlueMsg:192`, `onRedMsg:233`,
  `onSystemMidMsg:188`, `onLogout:65`, ...) - nothing for this milestone.
- `getCharAttributes` does **not exist** in the client (no match in any `.as`). The attribute panel reads
  `_core.player.property` (an object pushed/merged by the missing `onUPP` handler); the only attribute-related RPCs are
  `changeProperty`, `getCharDetailData`, `getFinalPraDef`, `finalPraMagDef`, `lvUp`.

### RPC transport semantics that affect every RPC below (`rpc/RemoteObj.as`)
- `_core.remote.<name>(args...)` goes through `Proxy.callProperty` (`RemoteObj.as:89-115`): **fire-and-forget**, no
  Responder, argument order = call order. `_core.remote.call(name, new Responder(fn), args...)` (`RemoteObj.as:117-137`)
  expects a **reply** passed to `fn`; a `null` Responder also means fire-and-forget.
- Client-side throttle `RPCConfig.RPC_DELAY` (`config/RPCConfig.as:36-42,61-65`): a call made inside the window is **silently
  dropped, never sent** (`RemoteObj.as:94-103`, `:122-131`). Relevant values (ms): `equipOn 1100`, `equipOff 1100`,
  `moveItem 1100`, `moveItemNum 1100`, `dropItem 1100`, `repair 1100`, `repairAll 1100`, `useItem 800`,
  `bagSort 3000`, `fullHpRecoverByItem 800`, `fullMpRecoverByItem 800`. The server must still rate-limit itself.

## 1. Character attribute panel ("Nhan vat")

### 1.1 Key files
| File | Role |
|---|---|
| `view/view/compDragable/CharactorPanel.as` (9544 lines) | the "Nhân vật" panel: stats, free-point allocation, equipment slots, manual level up |
| `view/view/compDragable/DetailPropPanel.as` | side panel "Chi tiết" (`DETAIL_PROP_PANEL[0]`, `Language.as:8882`), advanced % stats |
| `view/view/compMain/PortraitCanvas.as` | HUD self portrait: HP/MP/SP/EXP bars, level-up button, HP/MP potion click |
| `logic/Basic.as:197-200` | `levelUpExp(L) = PLAYER_LEVEL_EXP[L] - PLAYER_LEVEL_EXP[L-1]` |
| `predef/GamePredef.as:38` | `MAX_LEVEL = 160`; table `PLAYER_LEVEL_EXP` at `:699`, values `:8659+` (`[0]=1,[1]=73,[2]=358,[3]=926`) |

### 1.2 Fields displayed (all read from `_core.player.property`, `CharactorPanel.as:5056-5218` `updateProp()`)
| UI control | Source key | Label (Language) |
|---|---|---|
| `hp` | `int(player.currentHp) + "/" + int(property.finalHp)` (`:5155`) | `CHARACTORPANEL_U[8]` "HP" |
| `mp` | `int(player.currentMp) + "/" + int(property.finalMp)` (`:5156`) | `CHARACTORPANEL_U[10]` "MP" |
| `attack` | `property.finalAttack` (`:5157`) | `[9]` "Công vật lý" |
| `mAttack` | `finalMAttack` (`:5158`) | `[11]` "Công ma pháp" |
| `defence` | `finalDefence` (`:5159`) | `[13]` "Thủ vật lý" |
| `mDefence` | `finalMDefence` (`:5160`) | `[15]` "Thủ ma pháp" |
| `hit` | `finalHit` (`:5161`) | `[17]` "Chính xác" |
| `critical` | `finalCritical` (`:5162`) | `[23]` "Bạo kích" |
| `dodge` | `finalDodge` (`:5163`) | `[19]` "Né tránh" |
| `speed` | `finalSpeed` (`:5164`) | `[21]` "Tốc độ" |
| `attStrength` | `finalStrength` (`:5165`) | `[12]` "Lực" |
| `attStamina` | `finalStamina` (`:5167`) | `[14]` "Nhẫn" |
| `attAgility` | `finalAgility` (`:5166`) | `[16]` "Xảo" |
| `attIntelligence` | `finalIntelligence` (`:5168`) | `[18]` "Trí" |
| `attEnergy` | `finalEnergy` (`:5169`) | `[20]` "Thần" |
| `attLastPoint` | `lastPoint` (`:5170`) | `[22]` "Điểm" |
| `spirituality` | `CHARACTORINFOPANEL_S[52]` "Thần tu: {spirituality}" (`:5171`) | |
| element icon | `ee` (frame `1+ee`), `en`, `ef` (bool, `maxMc.visible`), tooltip `CHARACTORPANEL_S[2..6,36]` (`:5177-5207`) | "Thuộc tính: ", "Yếu/Vừa/Mạnh", "\nĐộ mạnh: " |
| signature-set / star-set boxes | `makerActive`+`qualityType` (10/11/15/16/20), `starType` (8/9/10) (`:5071-5154`) | `CHARACTORPANEL_S[25]` "Bộ trang bị chữ ký", `[27]` "Bộ trang bị lấp lánh" |

Label-to-field order was verified by Y coordinate (`attStrength y=52` ↔ BasicTxtButton12 `y=50` "Lực"; `attStamina y=72.95` ↔ "Nhẫn";
`attAgility y=95` ↔ "Xảo"; Int y=117 ↔ "Trí"; Energy y=139 ↔ "Thần"; lastPoint y=160 ↔ "Điểm": `CharactorPanel.as:2050-2135`,
`:2288-2340`, `:2822`). `Language.as:1708` (`PETFUNCPANEL_S[36]`) independently confirms Stamina = "Nhẫn", Agility = "Xảo".

Info block, `updateInfo()` (`CharactorPanel.as:5770-5847`), reads `_core.player`: `name`, `level`, `classLevel + className`,
`expBattle`, `t` (title id -> `TBL_TITLE.n`), `honor`, `chival`, `pop`, `actpoint/maxActpoint`, `vigor/maxVigor`, `imgCode`
(portrait), `pmLevel`, `newGrade`, `expSkill`, `bp`. `expSkill` and `levelUpExp(level)` feed the level-up tooltip
`CHARACTORPANEL_S[34]` "Exp: {exp}\n Cấp kế: {next}\n Điểm kinh nghiệm không những có thể dùng để thăng cấp nhân vật mà còn có thể thăng cấp kỹ năng".
At `level >= MAX_LEVEL (160)` next = "-" (`:5828-5830`).

Panel-level behaviours:
- `updateView()` = `updateProp(); updateInfo(); updateEquip()` (`:4652-4660`); `initView()` calls `getInitSlot` once when
  `_dm.sInited` is false, then `updateView()` (`:5231-5245`).
- `updateProp()` **returns early** if the user has pending unsaved allocation text in any `add*` label and it is not the
  first load (`:5063-5066`) - pushes arriving mid-allocation do not clobber the pending numbers.
- `onInitViewProp(obj)` (`:5480-5487`) does `player.property = obj; updateView()` - a push/RPC-reply entry point named
  `onInitViewProp` exists on the panel, but its caller is in the undecompiled CallBack (**unconfirmed who invokes it / when**).
- Detail button: `changeDetailVis()` (`:5464-5471`) toggles `DetailPropPanel`, `ownerType = OWNER_TYPE_CHAR (1)`, and calls
  `updateCharDetailData()`.

### 1.3 Allocating free points - `changeProperty`
- UI: each of 5 stats has a `+` and `-` button (`CharactorPanel.as:6111-6378` `buttonClick`). `AddPropCheck` checkbox toggles
  the step between **1 and 10** (`__AddPropCheck_change`, `:3315-3324`; `PropMultiple` default 1 at `:249`). A `+` click moves
  `min(step, remaining)` from the displayed `attLastPoint` into the `add<Stat>` label (client-side only, no RPC); `-` reverses
  it (never below 0). The server is only contacted when the OK button (`btnOK`) is clicked: `__btnOK_click` -> `changeProperty()`
  (`:9456-9459`).
- RPC (`:6446-6466`), **fire-and-forget** (no Responder, no reply handling):
  `remote.changeProperty({ addStrength, addAgility, addStamina, addIntelligence, addEnergy })`
  - one **object** arg; the five values are the label `.text` **strings** (`""` when untouched, otherwise decimal digits such as `"3"`).
    **Coerce with Number(); treat `""` as 0.**
  - afterwards the client clears all `add*` labels and resets button styles (`:6455-6465`).
- No client check that the sum <= `lastPoint` (it only bounds locally); the server must enforce `sum <= lastPoint`, non-negative
  integers, and recompute stats.
- Result arrives as a push (`onUPP` with `property`) - **not provable from the client** (CallBack aborted). Go note
  (`D:\mcgame\docs\memory\exp-leveling.md`): `changeProperty` must send a stat-only `onUPP` (nested `property`, refreshed `final*`,
  new `lastPoint`) and must NOT include top-level `bagSlotNum` / `bankSlotNum` / `petMaxNum` (the Flash handler shows slot-expansion
  notices when those keys are present). `CharactorPanel.onChangeProperty()` is an empty stub (`:6079-6081`).
- Button enable state: `addBtnCanvas.enabled = lastPoint > 0` (`:5208-5215`).

### 1.4 Level up is MANUAL (`lvUp`)
- Condition used by the client everywhere: `player.expSkill >= levelUpExp(player.level)` and `player.level < 160`
  (`PortraitCanvas.as:442-476` `setLevelUpBtn`, `:759-780` in the `gameObj` setter, `:542-552` `doLevelUp`).
  So `expSkill` is compared to the **per-level delta** (`PLAYER_LEVEL_EXP[L]-PLAYER_LEVEL_EXP[L-1]`, `Basic.as:199`), i.e. it behaves as
  "exp inside the current level". (Go notes call `expSkill` "cumulative" in `onPlayerLevelUp`; the H5 `LEVEL_EXP` doc says exp is
  cumulative - see Open Questions Q1.)
- HUD level-up button `btnLvUp` (label `PORTRAITCANVAS_U[0]` "Up", `Language.as:4230`): visible when exp suffices and level >= 20 and
  `GLOBAL_SETTING["sjan"]` is not true (`PortraitCanvas.as:759-780`, `Core.as:1615-1617` `sjan` toggles it).
  **For level < 20 the client calls `levelUp()` automatically** (`PortraitCanvas.as:456-459`, `:761-763`) which does
  `doLevelUp(null)` (`:652-655`) -> `lvUp(level, null)` with no confirm and no password.
- For level >= 20: Alert `PORTRAITCANVAS_U[2]` "Xác nhận thăng cấp?" (`:648-651`); on YES, if `_core.delPass` (cached MD5 of the
  secondary password) exists it is sent directly, otherwise the input panel asks `DELETE_BY_PASS[0]`
  "Mã bảo vệ (Mặc định: 123456)" (title `PORTRAITCANVAS_U[0]`) and sends `MD5.hash(input)` (`:625-646`).
  The panel version is identical (`CharactorPanel.as:5938-5978`, confirm text `CHARACTORPANEL_U[31]` "Xác nhận thăng cấp?",
  title `CHARACTORPANEL_U[2]` "Up"); it also sets `levelUpButton.enabled = false` until the reply.
- RPC: `remote.call("lvUp", new Responder(onLevelUp), player.level /*int, current level*/, passwordMd5 | null)`
  (`PortraitCanvas.as:548`, `CharactorPanel.as:5951,5967`). **Reply = Boolean**.
  - HUD `onLevelUp(ok)` (`PortraitCanvas.as:1010-1025`): if `ok && player.level > 20` -> open character panel
    (`ViewManager.PANEL_CHARACTOR`); refresh `PANEL_ACTIVE` / `PANEL_SKILLMANAGER` if visible.
    It reads `_core.player.level` **at reply time**, so the level push must reach the client **before** the reply (**inferred ordering
    dependency**; static analysis cannot prove arrival order).
  - panel `onLevelUp` (`CharactorPanel.as:6724-6735`): re-enable the button, refresh active/skill panels.
- Go cross-check (not client): `leveling.go:15-74` requires args[1] non-empty string else returns `false`; so the `lvUp(level, null)`
  at level < 20 would be rejected there; the H5 server already auto-levels below `AUTO_LEVEL_CAP = 20`
  (`server/src/modules/quest/quest.rules.ts:7`), which is consistent.

### 1.5 `getCharDetailData`, `getFinalPraDef`, `finalPraMagDef` (DetailPropPanel)
- `updateCharDetailData()` (`DetailPropPanel.as:2021-2028`): `remote.call("getCharDetailData", new Responder(updateView), cid)` - only
  re-sent when `cid` changed from the cached one (`_cid != _core.cid`).
  Reply object (read in `updateView`, `:1423-1485`; key lists `:1306-1307`): numeric fields displayed with `toFixed(2)`:
  - "int" group (`PROP_INT_KEY_ARR`): `finalCombo, finalCounter, finalRebornRate, finalBreakReborn, finalDefy, finalResiDefy,
    finalResiCritical, finalDizzy, finalConfusion, finalSleep, finalPoison, finalRage, finalLight, finalResiDizzy,
    finalResiConfusion, finalResiSleep, finalResiPoison, finalResiLight, finalResiRage` (printed **without** `%`: `:1436`).
  - "percent" group (`PROP_PER_KEY_ARR`): `finalReduceHurt1, finalReduceHurt2, finalEnhPhyHurt, finalEnhMagicHurt, finalPraDef,
    finalPraMagDef, finalCriticalDamage` (printed with `%` appended: `:1455,1475,1481`).
  - Labels (inline MXML `text`, `DetailPropPanel.as:157-1275`): finalCombo "Liên Kích", finalCounter "Phản Kích", finalRebornRate "Miễn Tử",
    finalBreakReborn "Phá Kích", finalDefy "XPN", finalResiDefy "Kháng XPN", finalResiCritical "Kháng Bạo Kích", finalCriticalDamage
    "Tỉ Lệ Bạo Kích", finalReduceHurt1 "Miễn Giảm VL", finalReduceHurt2 "Miễn Giảm  MP", finalEnhPhyHurt "Tăng STVL Cuối",
    finalEnhMagicHurt "Tăng STMP Cuối", finalPraDef "Giảm STVL Cuối", finalPraMagDef "Giảm STMP Cuối", finalDizzy "Choáng chính xác",
    finalConfusion "Hỗn Loạn chính xác", finalLight "Thạch Hóa chính xác", finalSleep "Hôn Mê chính xác", finalPoison "Trúng Độc chính xác",
    finalRage "Trào Phúng chính xác", finalResiDizzy "Kháng Choáng", finalResiConfusion "Kháng Hỗn Loạn", finalResiLight "Kháng Thạch Hóa ",
    finalResiSleep "Kháng Hôn Mê", finalResiPoison "Kháng Trúng Độc", finalResiRage "Kháng Trào Phúng".
- For the **character** owner the two special keys are NOT printed from the reply; instead per key an extra reply-RPC is made
  (`:1441-1471`):
  - `remote.call("getFinalPraDef", new Responder(onSetSpeText), "finalPraDef", Number(_propData.finalPraDef), cid)`
  - `remote.call("finalPraMagDef", new Responder(onSetSpeText), "finalPraMagDef", Number(_propData.finalPraMagDef), cid)` (note: **no "get"** prefix)
  - Reply is `{ key: string, value: number }`; handler writes `toFixed(2) + "%"` into the control named `key` (`:1583-1588`).
    So the server converts the raw rating into a diminishing-returns percentage; the formula is **not in the client**.
  - Pet variants `getFinalPraDefPet` / `finalPraMagDefPet` (same arg shape) only when `_ownerType == OWNER_TYPE_PET` and `_arg_2` true;
    otherwise the raw `value + "%"` is shown.
- Minimal H5 option (**inferred**): put `finalPraDef`/`finalPraMagDef` percentages directly in the `getCharDetailData` reply and still
  answer the two follow-up RPCs with `{key,value}`, because the legacy panel always issues them.

### 1.6 Equipment slots on the character panel (sid -> kind)
- `GamePredef.SLOT_SID_EQUIP = [1, 22]` (`predef/GamePredef.as:1163`); `SLOT_SID_DRESS = 21`, `SLOT_SID_WING = 22` (`:1177-1178`);
  bag pages `SLOT_SID_BAG = [2100,2130,...,2370]` (`:1164`); bank `[300..450]` (`:1165`), guild bank `[500..620]` (`:1166`),
  pet equipment `[1000,1200]` (`:1167`), temp bag `[80,99]` (`:1179`). Pet-equip template positions 50..57
  (`PETEQU_POS_BEGIN/END`, `:1414-1415`).
- Slot `index` = global **sid**; equipped sid equals the equipment template `position` (the same number is used as key of
  `EQUIP_POSITION`, `GamePredef.as:9856-9884`; tooltip `TIPEQUIP_S[14]` "Vị trí trang bị: {EQUIP_POSITION}", `TipEquip.as:1560`).
  Panel layout (`CharactorPanel.as:351-558,1370-1447`; `slotType:4` = `Slot.SLOT_EQUIP`, `Slot.as:50`):

| sid | panel id | position name (`GAMEPREDEF_S`) | x,y |
|---|---|---|---|
| 1 | eq1 | Mũ [300] | 11,10 |
| 2 | eq2 | Đai [301] | 11,82 |
| 3 | eq3 | Vũ khí [302] | 57,119 |
| 4 | eq4 | Áo [303] | 11,46 |
| 5 | eq5 | Quần [304] | 11,120 |
| 6 | eq6 | Trang sức 1 [305] | 11,156 |
| 7 | eq7 | Trợ thủ [306] | 187,119 |
| 8 | eq8 | Dây chuyền [307] | 232,10 |
| 9 | eq9 | Nhẫn [308] | 232,82 |
| 10 | eq10 | Hộ vai [309] | 232,46 |
| 11 | eq11 | Trang sức 2 [310] | 232,155 |
| 12 | eq12 | Giày [311] | 232,119 |
| 13 | eq13 | Găng thu thập [409] | 187,156 |
| 14 | eq14 | Phi hành [383] | 57,156 |
| 15 | mwMain | Thần khí chính [381] | 126.5,84 |
| 16-20 | mwSub1..5 | Thần khí phụ 1..5 ([382]+"1".."5") | see `:1385-1447` |
| 21 | eq15 | Thời trang [390] | 57,83 |
| 22 | eq16 | Cánh [459] | 187,82 |

  (`EQUIP_POSITION` 13/14/15/16-20/21/22 = `GamePredef.as:9868-9877`; `GAMEPREDEF_S` values `Language.as:2600-2611,2681-2683,2690,2709,2759`.)
  `initCharEquListen()` (`:4222-4236`) binds double-click on ids `eq1..eq16` (loop to `SLOT_SID_EQUIP[1]-6 = 16`) and `mwMain`, `mwSub1..5`.
- The panel's slots set **no `acceptType`/`acceptPos`** (not present in the descriptors above), so the client does **not** check that
  a dropped item fits the slot (`Slot.canPutHere` is only used by slots that define them, `Slot.as:1420-1451`). The slot an item lands
  in is decided by the server from the template `position` (Go: `EquipItem` auto-selects slot; `equip.go:84-160`, `service.go:667-700`).
- `getInitSlot` returns **bag + equipped items together** in one object keyed by item instance id; each element
  `{id, sid, type, itemId, stackNum, tid}` (`updateEquip()` iterates `_dm.sList` and filters `SLOT_SID_EQUIP[0] <= sid <= SLOT_SID_EQUIP[1]`,
  `CharactorPanel.as:5696-5713`). So H5 `getInitSlot` must also include equipped items (slotType 4, sid 1..22) - currently only `SlotType.BAG`.
- Differences to flag vs Go notes: Go says "Ring slot logic positions 7 & 8" - that is the **0-based slotIndex** (sid = index+1, `equip.go:131`),
  i.e. sids 8 (Dây chuyền) and 9 (Nhẫn). Client names above are authoritative for display.

## 2. Equip / unequip

### 2.1 Client entry points and args
| Trigger | Code | RPC (all fire-and-forget) |
|---|---|---|
| Drag a slot onto an equipment-panel slot (any source slot with `slotData`) | `Slot.as:1089-1108` (case `SLOT_EQUIP`) | `equipOn(itemId)`; **one arg**, the target slot is ignored |
| ... same, but the item template `position` is 50..57 (pet equipment) and pet manager open | `Slot.as:1093-1105` | `petEquipOn(petId, itemId)` (out of scope) |
| Double-click an equipped slot (eq1..16, mwMain, mwSub1..5) | `CharactorPanel.as:5495-5503` | `equipOff(itemId, -1)` |
| Drag an equipped slot onto a **bag** slot | `Slot.as:1006-1013` | `equipOff(itemId, targetSid)` |
| Double-click an equippable item in the bag | **unconfirmed** (BagPanel aborted). Tooltip text `TIPEQUIP_S[33]` "Nhấp đôi để mặc" / `[32]` "Nhấp đôi để tháo gỡ`, chosen by `isEquSid` (below) | presumably `equipOn(itemId)` (**inferred**) |
| Use-item flow on equipment | `Player.useItem` generic branch (`Player.as:1226/1231`) sends `useItem(...)` for any `slot.type`; Go auto-equips from `useItem` (`use.go:121-137`) | `useItem(targetType, petId, itemId)` |

- `itemId` is the **item instance id** (`slotData.id`), `-1` = "to wherever". `targetSid` is a global sid (bag 2101+).
- Tooltip helper RPC: `TipEquip.isEquSid(sid)` -> `remote.call("isEquSid", Responder(onIsEquSid(Boolean)), sid)` (`TipEquip.as:1288-1292, 2656-2666`),
  fired only when the tooltip object has `slotData` (`:1722-1725`); `true` => text "Nhấp đôi để tháo gỡ", `false` => "Nhấp đôi để mặc".
  Reply is a plain Boolean (`sid in [1,22]` per Go notes).

### 2.2 Client-side gating (and its absence)
- **No client gating at all on `equipOn`/`equipOff`**: no level, class, sex, durability or position check in `Slot.as:1089-1108`
  or `CharactorPanel.as:5495-5503` (server must send any refusal itself - Go: `ErrCannotEquip`, `ErrItemBroken`, `service.go:667-682`;
  Go level-not-enough on `useItem` uses `onSystemMidMsgOrNote("Cấp độ không đủ!")`, `use.go:111-114`).
- The only client-visible hints are tooltip-only: requirement level printed in red when `player.level < temp.reqLevel`
  (`TipEquip.as:1596-1609`, `TIPEQUIP_S[15]` "Cấp độ cần: {reqLevel}"); class list from `temp.reqClass` ("|id|id|") coloured red when not
  matching (`:1610-1700`); `TIPEQUIP_S[16]` "Đối tượng dùng: ", `[17]` "Đối tượng dùng: Mọi nghề", `[18]` "... Pet", `[19]` "... Người chơi Pet",
  `[20]` "... Không thể dùng". Switch on `temp.useType` (`:1595-1721`). No sex gating exists in the tooltip either.
- Drag-drop acceptance in general: `dragEnterHandler` accepts every `"slot"` drag when the slot is `acceptable` (`Slot.as:1543-1581`).

### 2.3 Resulting pushes (NOT in client; Go cross-reference `equip.go:84-300`, `appearance.go:22-82`, `handler.go:322-342`)
Order for `equipOn`: `onMoveItem(oldSid, newSid, itemId)` -> (if a displaced item) `onMoveItem(1+slotIdx, displacedSid, displacedId)` ->
`onUPP({currentHp,currentMp})` only if effective max changed -> `onUPP({ee,en,ef})` -> `onUPP({property})` -> `onEquipActiveList({sid:bool})`
-> appearance push `onEquipOn({cid,resCode,ee,ef,star,dressFlag})` | `onFlyerOn({cid,resCode,wavCode?})` | `onWingOn({cid,resCode})`
(weapon pos 3 / flyer 14 / dress 21 / wing 22), sent to **self and scene** (`sendAppearanceCallbackToSelfAndScene`). The `equipOn` reply is
`{success, equipItems}` (client ignores - no Responder).
`equipOff`: `onMoveItem(oldSid, newBagSid, itemId)` -> same stat/active-list pushes -> unequip appearance push -> `stoneSealOnEquipChange`;
reply `null`.
Move-item semantics are unverifiable from the client; the client consumers that exist are the data fields below.

### 2.4 Appearance fields the client reads for other players (broadcast contract)
- Scene character objects carry `wp` (weapon resCode, `object/Charactor.as:40`), `ee`, `ef`, `star` (`:28,29,37`), `dressResCode`,
  `wingResCode`, `flyerResCode` (`object/Creature.as:32,35,49`).
- `CreatureView.as:9078-9088`: for characters in default/rebirth body, if `dressResCode` is NaN or < 0 -> `equipOn(wp, ee, ef, star)`
  else `equipOn(dressResCode, ee, ef, star, true)` (dress replaces weapon, `colorCode = 0`, `CreatureView.as:7127-7130`).
  `equipOn(resCode,...)` loads `getResUrlNoHash(resCode) + "_NEW.swf"` only if `resCode > 0` and the body is default res
  (`:7131-7144`). So an unequip broadcast must set `wp`/`resCode` to 0 or negative-dress to clear the graphic. The push names that update
  these fields (`onEquipOn/onEquipOff/onWingOn/onFlyerOn`) are **in the missing CallBack** - names from Go only.

### 2.5 Durability display
- Tooltip (`TipEquip.as:3372-3397`): `TIPEQUIP_S[22]` "Độ bền: {endureLeft}/{endureMax}", values from `inst.endureLeft` and `inst.endureMax`
  (instance keys; **`endureLeft`, not `endure`**), one decimal for gather gloves (`ProductPanel.isGloveEquip`), red when `endureLeft == 0`;
  hidden for `kind == ITEM_KIND_DRESS (11)`. `TIPEQUIP_S[13]` "Độ bền tối đa: {endureMax}" uses `temp.endureMax` (`:1557`).
  `TIPEQUIP_S[24]` "Không thể bán" (`:1066, 2512`). Repair via bag toolbar: `repair(itemId, 1 | 2)`, `repairAll(1)` with Ctrl (`Slot.as:743-787`,
  `PortraitCanvas.as:603-608`) - **out of M1 scope**.
- Mapping to H5 `BagItem`: `durability` -> wire `endureLeft`, `maxDurability` -> `endureMax` (or expose both names).

## 3. Item use

### 3.1 `useItem` / `useMultiItem` (client gating in `object/Player.as:792-1235`)
- Argument order: `useItem(targetType:int, petId:Number, slotId:Number)` where `slotId` is the **item instance id** (`slot = _core.data.sList[slotId]`,
  `Player.as:810`; callers pass `slotData.id`: `Slot.as:728`, `Core.as:1643`). `targetType`: `1` = character (`MOUSE_TARGET_CHA`),
  `2` = pet (`GamePredef.as:1006-1007`); `petId = -1` for the character (`Slot.as:728`, `Core.as:1643`).
  **Fire-and-forget** (`Player.as:926,947,1165,1221,1226,1231`; no Responder; throttle 800 ms).
- `useMultiItem(targetType, petId, slotId, count:uint)` (`Player.as:939,1149,1213`): only for stacks > 1 of: item ids 5375..5697 or
  `_core.checkBatchItemList(id)`, pet grow potions, wallets/packages (long `ItemConfig` list `:1169-1208`); an input panel asks
  "Nhập số lượng dùng：" (`PLAYER_S[31]`) with title `PLAYER_S[30]` "Dùng"; `stackNum == 1` falls back to `useItem`.
- Gates evaluated **before** sending (all show a mid-screen note `sysMidNote`, no RPC):
  | Check | Code | String |
  |---|---|---|
  | task sweeping and item has no `skillId` | `Player.as:824-828` | `TASKSWEEPPANEL_U[22]` |
  | character target: template `useType` not 1 or 3 | `:856-860` | `PLAYER_S[3]` "Vật phẩm này bạn không dùng được!" |
  | `player.level < tData.reqLevel` | `:861-865` | `PLAYER_S[4]` "Cấp độ bạn chưa đủ!" |
  | `tData.reqClass` (string "|id|id|") lacks `"|"+classId+"|"` | `:866-870` | `PLAYER_S[5]` "Nghề nghiệp bạn không phù hợp!" |
  | pet target: `useType` not 2 or 3 | `:876-880` | `PLAYER_S[6]` "Vật phẩm này pet không dùng được!" |
  | pet target: pet level < `reqLevel` | `:886-890` | `PLAYER_S[7]` "Pet không đủ cấp độ!" |
  | pet equip (kind 9, pos 50..57) with no pet selected | `:833-853` | `Alert PLAYER_S[26]` "Pet không tồn tại." |
  | type 509 (KEY) needs a free bag slot | `:895-905` | `PLAYER_S[8]` "Bạn không có đủ chỗ trống trong túi đồ!" |
  | template id 3012 same bag check | `:910-921` | `PLAYER_S[8]` |
  | `Core.useItem(templateId)` with none in bag | `Core.as:1635-1640` | `CORE_S[9]` "Không có vật phẩm này" |
- No sex gating, no cooldown timer other than the 800 ms RPC throttle (`RPCConfig.as:61`). Item **type 520 (TARGET_ITEM)** uses
  `itemToTarget(slotId)` instead (`:906-908`). Special ids (reset points confirm `PLAYER_S[10]` "Xác nhận tẩy điểm?", radar, seek, transport
  map picker `PLAYER_S[17]`, rename card, sex card, wedding bags, intimacy items, ...) have their own RPCs - out of M1 scope.
- Everything else (`default`) is the plain `useItem(targetType, petId, slotId)` (`:1225-1226`).

### 3.2 HP / MP potions from the HUD (`PortraitCanvas.as`)
- Click `hpBar` (`:995-998`) -> `recoverFullHp(1, -1)`; click `mpBar` (`:398-401`) -> `recoverFullMp(1, -1)`; click the name label ->
  both (`:324-328, 495-498`). The pet HUD calls `recoverFullHp(2, battlePet.id)` / `recoverFullMp(2, battlePet.id)` (`compMain/PetCanvas.as:790-806, 368-373`).
  In maze maps `templateId` 2007/2008/2009 HP recovery is blocked with `sysMidMsg(MAZE_INFO_PANEL_U[13])` (`:1096-1100`).
- Client builds the **candidate list**: scans bag sids `2101..2310` (`SLOT_SID_BAG[0]+1 .. SLOT_SID_BAG[7]`, i.e. 7 pages, not quest/pet pages),
  keeps item instances whose `tid` is a known potion, and sends them sorted ascending by `priority`:
  - HP table (`:1101-1110`): `{1:300, 4:600, 2:600, 110:1000, 113:2000, 321:3000, 371:6000, 1975:9000}`
  - MP table (`:407-415`): `{158:300, 125:600, 126:1000, 127:2000, 322:3000, 370:5000, 1974:7000}`
  - element: `{ sid: <item instance id> (despite the name), priority: tableValue - item.binded }` (`:426-429, 1121-1124`)
    (so bound potions, `binded=1`, sort slightly before unbound ones of the same amount).
- RPC (fire-and-forget, Responder `null`, throttle 800 ms): `remote.call("fullHpRecoverByItem", null, targetType, petId, items[])` and
  `remote.call("fullMpRecoverByItem", null, targetType, petId, items[])` (`:1130, 435`). `targetType` 1 = char (`petId = -1`), 2 = active pet.
  The server must (a) consume lowest-priority potions until full, (b) push stack decrement / delete and `onUPP {currentHp/currentMp}`;
  client does not predict anything (**push contents/order unconfirmed**; Go: `recover.go`, `recovery-targeting.md`).
- "Sinh Mệnh Hoàn / Pháp Lực Hoàn" reserve (separate from potions): `Core.setBloodBag("|hp|mp|x|y")` fills `bloodBag[1..4]`
  (`Core.as:401-434`), buttons `hpBtn/mpBtn` (`PortraitCanvas.as:793-829`), strings `PORTRAITCANVAS_S[0..3]`
  (e.g. "Sinh Mệnh Hoàn tiện dụng\nSau khi kết thúc chiến đấu sẽ tự phục hồi HP cho nhân vật\nLượng trữ hiện tại: ", `Language.as:2176-2179`).
  Not in M1 unless requested.
- HP/MP bars: `hpBar.setProgress(player.currentHp, property.finalHp)`, same for MP/SP/EXP (`PortraitCanvas.as:716-737`); when `property` is
  missing, max = current (`:726-731`) - so `property.finalHp/finalMp/finalSp` must be present before bars look right. Tooltips are
  `"HP: " + value + "/" + max` (`:847-870`).

### 3.3 Result pushes for item use (not in client)
Client side effect is purely data-driven through pushes (CallBack aborted). Go order for a consumed potion (`use.go:~140-190 (onUPP :171, onDelCharactorSlot :179, onAddCharactorSlot :181)`):
`onUPP({money,currentHp,currentMp})` -> (`onDelCharactorSlot(itemId, sid)` if stack == 0, else `onAddCharactorSlot(dto)` with new `stackNum`)
-> effect callbacks. For `useMultiItem`: `onUPP({currentHp,currentMp})`, then `onDelCharactorSlot(itemId, slotId)` when remaining <= 0
(`use.go:199-245` - note Go passes the item id as the "sid" in that one call). Error text arrives as `onSystemMidMsgOrNote` / red messages.

## 4. Buffs (`view/view/compMain/LongBuffCanvas.as`, 777 lines)

### 4.1 Where it renders
- HUD canvas `MAIN_LONGBUFF`, named "增益栏" (buff bar), positioned `left:2, top:115` (`view/view/MainLayer.as:1100-1110`, registered `:436, :1177`),
  initial visible. Inside: a `Tile` of width 200 with a Repeater of **16x16 icons** (`LongBuffCanvas.as:71-110`). Icon url = `ResManager.getIconUrl(TBL_BUFF.iconCode)`
  (`:517`). Hidden while in battle (`Battle.as:994` hide; shown again `:674`).
- Icon tooltip = `toolTip + (type == 1 ? battleLeft : timeLeftStr)` (`:735`).

### 4.2 Pushes consumed (method names on the canvas; invoked by the aborted CallBack - **invocation site unconfirmed**, names match Go)
| Name | Signature | Behaviour (`LongBuffCanvas.as`) |
|---|---|---|
| `initLongBuff(map)` | `Object` keyed arbitrary; each value is a buff object | clears list, `onAddLongBuff` for each truthy value, starts a 10 s timer (`GamePredef.LONG_BUFF_REFRESH_INTERVAL = 10000`, `GamePredef.as:1553`) (`:230-258`) |
| `upLongBuff(buff)` | one buff object | no-op on falsy; removes existing entry with same `id`; if `type == 10`, also removes every other type-10 entry whose `TBL_BUFF[bid].codeName` equals this one (replace-by-codeName); then `onAddLongBuff` (`:260-302`) |
| `delBuff(id)` (method `delBuff(_arg_1:Number)`) | buff `id` | removes all list entries with that `id` (`:746-758`) |
| `addGlobalDoubleExpBuff(buff)` | buff + `desc`, `timeAll`, `addTime`, `timeLeft`, `type`, `id`, `bid` | special event buff (`bid 1092` = `GLOBAL_DOUBLE_EXP_BID`, `GamePredef.as:1554`) (`:376-420`) |
| `delGlobalDoubleExpBuff()` | - | removes `bid == 1092` (`:199-211`) |

### 4.3 Payload keys read by `onAddLongBuff` (`:502-554`)
`id` (instance id, unique key), `bid` (template id -> `TBL_BUFF`; unknown template => buff dropped and `delBuff(id)` is called, `:508-513`),
`type`, and by type:
- `type 3` or `10` (permanent): nothing else; tooltip `name + "\nCấp: " + data.level + "\n" + data.description + "\nDuy trì: Vĩnh viễn"` (`:521-526`).
- otherwise: `battleLeft`, `timeAll`, `addTime`, `timeLeft` (seconds), `ineffectiveTime` (**absolute epoch ms**, compared with
  `Date.now() + core.timeLag`, `:428-441`). Tooltip `name + "\nCấp: " + level + "\n" + description + ("\nSố trận đấu còn lại: " if type 1 else "\nCòn lại: ")`;
  `timeLeftStr` formatted by `setTimeInfo` (>= 86400 s -> "N ngày "; else "H giờ M phút S giây", `:213-228`).
  `type 2` gets `needTimer = true` (except template `codeName == "BUFF102151"`, `RED_CODE_NAME`, `:68, :534-547`, which has no timer and tooltip `name + "\n" + description`).
- Template fields read from `TBL_BUFF` (`GamePredef.TBL_BUFF`): `name`, `level`, `description`, `iconCode`, `buff` (removability flag), `codeName`.
- Type semantics: 1 = per-battle counter, 2 = timed, 3 = permanent, 10 = permanent, one-per-`codeName`.

### 4.4 Client-driven behaviour
- 10 s timer (`timerRepeat`, `:428-458`) recomputes `timeLeft`; when `< 1` it sends **`delBuffClient(id)`** (skipped for `bid 1092`), runs
  `doActionOnBuffDel` and removes the icon locally. So **the server must tolerate `delBuffClient` for already-expired or unknown ids**.
- Per-battle counters are decremented **client side**: `refreshBuffPerBattle()` (`:136-153`, called from `Battle.updateUI`, `logic/Battle.as:591-595`) removes a
  type-1 buff when `battleLeft <= 1`, else `battleLeft--`; `updateRound()` (`:460-476`) from `BattleStage.as:1225`. Server should still push/delete authoritatively.
- Manual removal: clicking an icon (`buffClick`, `:663-696`): `vo.buff == 0` -> `sysMsg` `LONGBUFFCANVAS_S[10]` "BUFF xấu không thể bị xóa." (no RPC);
  otherwise Alert `LONGBUFFCANVAS_S[9]` "Xác nhận xóa BUFF này?"; YES -> `remote.delBuffClient(id)` **fire-and-forget** + local `delBuff(id)` (`:674-682`).
  RPC: `delBuffClient(id:Number)`, one arg.
- Strings `Language.as:2110-2120`: `[0]/[2]` "\nCấp: ", `[1]` "\nDuy trì: Vĩnh viễn", `[3]` "\nSố trận đấu còn lại: ", `[4]` "\nCòn lại: ", `[5]` " ngày ", `[6]` " giờ ",
  `[7]` " phút ", `[8]` " giây", `[9]` "Xác nhận xóa BUFF này?", `[10]` "BUFF xấu không thể bị xóa.".
- Buff effects on stats are applied server side and surface through `property.final*` / `onUPP` (Go: `delBuffClient` then `delBuff(id)` then `onUPP`).

## 5. Bag operations

All slot identifiers below are **global sids** (`Slot.index`, set once via `ViewManager.addSlot`, `Slot.as:1410-1418`), except `dropItem`/`equip*`/`use*` which use the **item instance id** (`slotData.id`).
Bag pages: sid 2101..2310 = 7 regular pages (30 each), 2311..2340 quest page, 2341..2370 pet-item page (`SLOT_SID_BAG`, `GamePredef.as:1164`).
Double-click detection: two clicks within `DCLICK_DELAY = 800` ms (`Slot.as:108, 641-644, 1385-1388`); event `EVENT_SLOT_DCLICK` (`:1678-1682`); right click also fires it (`:1616-1625`).
What the bag does on `EVENT_SLOT_DCLICK` is in the aborted `BagPanel` (**unconfirmed**; H5 can implement "equip if equipment else use").

### 5.1 `moveItem` (drag bag slot -> bag slot) - `Slot.as:967-1003`
- RPC `remote.moveItem(fromSid, toSid)` (both `slot.index`/`index`, fire-and-forget; throttle 1100 ms).
- Client pre-checks before sending (all silent returns): dragged slot `stackNum == 0` -> ignore (`:970-973`); dropping on itself is ignored (`:963-966`);
  target in pet-item page (`2340 < idx <= 2370`) requires the dragged item `kind == ITEM_KIND_PETEQU (9)` (`:984-987`);
  target in quest page (`2310 < idx <= 2340`) requires item template `type == ITEM_TYPE_QUEST (508)` (`:988-1000`, `ITEM_TYPE_QUEST` `GamePredef.as:1061`).
- Swap vs merge vs plain move is **decided by the server** (client sends the same RPC). Go outputs (reference only, `bag.go:17-130`): plain move
  `onMoveItem(from,to,itemId)`; swap `onSwapItem(from,to)`; stack merge `onAddCharactorSlot(dest dto)` then
  `onStackItemInto(fromSid,toSid,fromId,destId,mergedCount)`; error -> `onMidNote`.

### 5.2 `moveItemNum` (split) - `Slot.as:976-981`, `NumPanel.as:317-319, 384-427`
- Split mode starts from the toolbar "Tách rời" (`BAGPANEL_S[12]` "Tách rời: Nhấp vào biểu tượng rồi nhấp vào vật phẩm trong túi đồ để tách rời";
  `Slot.actionOnItem` `ACTION_DIVIDE` sets `itemState = ST_ITEM_DIVIDE` and starts a drag, `Slot.as:730-736`) **or** by holding **Shift** while dropping.
- Condition to open the NumPanel: bag->bag drop, (`itemState == ST_ITEM_DIVIDE` or `shiftKey`) **and the target slot is empty** (`_itemId < 0`) (`Slot.as:976`).
  NumPanel `TYPE_MOVE`: stepper `maximum = source.stackNum` (`NumPanel.as:422`), `value = _defaultStack` (default not read; **inferred 1**), title `NUMPANEL_U[0]` "Chọn số lượng".
- RPC: `remote.moveItemNum(sourceSid, targetSid, count)` (`NumPanel.as:318`, fire-and-forget, throttle 1100 ms). Server must enforce
  `1 <= count <= stack`, target empty (same template stacks are the Go behaviour: `onAddCharactorSlot` for target, then `onDelCharactorSlot(itemId, fromSid)` if source emptied else `onMoveItemNum(fromSid, itemId, remaining)`, `bag.go:132-224`).

### 5.3 `dropItem` (discard) - two UI paths, one RPC
- Path A, drag a bag slot onto the game stage (map): `StageMain.dragDropHandler` (`compGameStage/StageMain.as:88-122`):
  - item template `color > 2` (`GameData.d[type][giid].color`): requires secondary password. If `_core.delPass` cached: Alert `STAGEMAIN_S[0]` "Xác nhận hủy vật phẩm này?" -> `dropItem(itemId, delPass)` (`:564-571`);
    else input panel (`DELETE_BY_PASS[0]` label, title `SLOT_U[0]` "Xóa vật phẩm") -> `dropItem(itemId, MD5.hash(input))` (`:595-604`).
  - `color <= 2` (or no template): Alert "Xác nhận hủy vật phẩm này?" -> `dropItem(itemId)` **without password** (`:611-618`).
- Path B, toolbar "Vứt bỏ" mode (`BAGPANEL_S[11]` "Vứt bỏ: Nhấp vào biểu tượng rồi nhấp vào vật phẩm trong túi đồ để vứt bỏ") then click an item: always asks the password
  (`Slot.as:737-741`, `delSlot` `:1395-1403` -> `dropItem(itemId, MD5.hash(input))`).
- RPC `remote.dropItem(itemId[, passwordMd5])`, fire-and-forget, throttle 1100 ms. Server verifies password only when arg 2 is present (Go `bag_manage.go:17-80`); H5 has no
  secondary password system yet - decide whether to accept and ignore arg 2 (**recommendation**). Push on success (Go): `onDelCharactorSlot(itemId, sid)`.
  `delPass` assignment site is not in the decompiled client (`grep "delPass = "` only finds `= null` resets in `LoginCanvas.as`/`DPassPanel.as`).

### 5.4 `bagSort`
- Only client facts: RPC name `bagSort` exists with a 3000 ms throttle (`RPCConfig.as:63`); strings `BAGPANEL_S[22]` "Sắp xếp: Sau khi nhấn vào biểu tượng, hệ thống sẽ sắp xếp túi đồ của bạn theo thứ tự, thời gian sắp xếp là 30 giây" and
  `BAGPANEL_S[23]` "Xác nhận sắp xếp túi đồ?" (confirm Alert before sending - **inferred** from the string). **The call site is in the aborted `BagPanel`**, so arg list/Responder
  are **unconfirmed**. Go (`bag_manage.go:78-136`): no args; pushes `onDelCharactorSlot(itemId, oldSid)` for merged-away items, then
  `onItemSort([{oldId, newId, stackNum}])` (old/new are **sids**). Other panels use `tempBagSort` with Responder (`TempBagSlot.as:2444`).
- Note the text says 30 s cooldown but the RPC throttle is 3 s.

### 5.5 `getInitSlot`
- `remote.call("getInitSlot", new Responder(setSlot))` from `CharactorPanel.as:5240`, `BankPanel.as:6042`, `EquipFuncBag.as:2598`, `PetStoneEquipBag.as:811`, `MysteryFurnace.as:883`;
  `setSlot(obj)` -> `DataManager.initSlotData(obj)` stores the object as `_sList` (`data/DataManager.as:865-872`) -> **reply is the map itself, keyed by item instance id**
  (`sList[itemId]`, `Player.as:810`), elements `{id, sid, type, itemId, stackNum, tid}` (`updateEquip` reads `sid,type,itemId,stackNum`, `CharactorPanel.as:5702-5711`).
- Item instance data (`tid`, `binded`, `endureLeft`, ...) is fetched lazily by `remote.call("gdc", Responder(onNewData), type, id)` -> `{type, data}` (`DataManager.as:478,892`);
  H5 inlines these in `BagItem`, which is fine as long as `binded`, `endureLeft/endureMax`, `color` keep their legacy names for tooltip ports.

## 6. Contract tables

### RPCs (client -> server)
| Name | Args (order, type) | Reply awaited? | Source |
|---|---|---|---|
| `changeProperty` | `{addStrength,addAgility,addStamina,addIntelligence,addEnergy: string}` | no | `CharactorPanel.as:6448` |
| `lvUp` | `(level:int, passMd5:string\|null)` | yes, `Boolean` | `PortraitCanvas.as:548`, `CharactorPanel.as:5951` |
| `getCharDetailData` | `(cid:number)` | yes, object of `final*` numbers | `DetailPropPanel.as:2024` |
| `getFinalPraDef` | `(key:'finalPraDef', value:number, cid:number)` | yes `{key,value}` | `DetailPropPanel.as:1445` |
| `finalPraMagDef` | `(key:'finalPraMagDef', value:number, cid:number)` | yes `{key,value}` | `DetailPropPanel.as:1465` |
| `getInitSlot` | `()` | yes, `Record<itemId, slot>` | `CharactorPanel.as:5240` |
| `equipOn` | `(itemId)` | no | `Slot.as:1106` |
| `equipOff` | `(itemId, toSid \| -1)` | no | `CharactorPanel.as:5502`, `Slot.as:1012` |
| `isEquSid` | `(sid:int)` | yes `Boolean` | `TipEquip.as:1291` |
| `useItem` | `(targetType:1\|2, petId:number(-1 for char), itemId)` | no | `Player.as:926...` |
| `useMultiItem` | `(targetType, petId, itemId, count)` | no | `Player.as:939` |
| `fullHpRecoverByItem` / `fullMpRecoverByItem` | `(targetType:1\|2, petId, items:{sid:itemId, priority:number}[])` | no (`null` Responder) | `PortraitCanvas.as:1130, 435` |
| `delBuffClient` | `(buffId)` | no | `LongBuffCanvas.as:446, 678` |
| `moveItem` | `(fromSid, toSid)` | no | `Slot.as:1001` |
| `moveItemNum` | `(fromSid, toSid, count)` | no | `NumPanel.as:318` |
| `dropItem` | `(itemId[, passMd5])` | no | `StageMain.as:568,601,615`; `Slot.as:1401` |
| `bagSort` | unknown (probably `()`) | unknown | name only: `RPCConfig.as:63` |

### Pushes (server -> client). Client handler bodies are missing; keys derived from consumers
| Push | Payload keys the client demonstrably reads | Evidence |
|---|---|---|
| `onUPP` | merged into `_core.player`: `currentHp,currentMp,currentSp,level,expSkill,money*,...`; nested `property` = `{finalHp,finalMp,finalSp,finalAttack,finalMAttack,finalDefence,finalMDefence,finalHit,finalCritical,finalDodge,finalSpeed,finalStrength,finalAgility,finalStamina,finalIntelligence,finalEnergy,lastPoint,spirituality,ee,en,ef,makerActive,qualityType,starType}`; `ee,en,ef` also top-level on player; avoid `bagSlotNum/bankSlotNum/petMaxNum` unless expanding | consumers `CharactorPanel.as:5056-5218`, `PortraitCanvas.as:694-781`; merge behaviour **inferred** |
| `initLongBuff` / `upLongBuff` / `delBuff` | see 4.2-4.3 | `LongBuffCanvas.as` |
| `onAddCharactorSlot` / `onDelCharactorSlot` / `onMoveItem` / `onSwapItem` / `onStackItemInto` / `onMoveItemNum` / `onItemSort` / `onUpChaSlotStackNum` | slot `{id,sid,type,itemId,stackNum,tid,...}`; no consumer in client | Go only |
| `onEquipOn` / `onEquipOff` / `onWingOn` / `onWingOff` / `onFlyerOn` | `{cid,resCode,ee,ef,star,dressFlag}` -> end up as `wp`/`dressResCode`/`wingResCode`/`flyerResCode` | field consumers `CreatureView.as:9078-9088` |
| `onEquipActiveList` | `{sid: boolean}` | Go; client usage not found in decompiled panels (TipEquip uses `activeProp`) |
| `onPlayerLevelUp` / `lvUp` push | no consumer in client | Go |

## 7. Proposed shared types (`packages/shared/src/protocol.ts` / new `character.ts` / `inventory.ts`)

```ts
// --- Character core (M1) ---
export const EQUIP_SID_FIRST = 1;
export const EQUIP_SID_LAST = 22;
export const EQUIP_SID = {
  HAT: 1, BELT: 2, WEAPON: 3, CLOTHES: 4, TROUSERS: 5, JEWELRY1: 6, HELPER: 7, NECKLACE: 8, RING: 9,
  SHOULDER: 10, JEWELRY2: 11, SHOES: 12, GATHER_GLOVE: 13, FLYER: 14, MW_MAIN: 15, MW_SUB1: 16, MW_SUB5: 20,
  DRESS: 21, WING: 22,
} as const;
export const MAX_LEVEL = 160;

/** Free point allocation (changeProperty): numeric strings, '' = 0. */
export interface ChangePropertyArg {
  addStrength: string; addAgility: string; addStamina: string; addIntelligence: string; addEnergy: string;
}

/** `player.property` as pushed in onUPP.property / login payload. */
export interface CharProperty {
  finalHp: number; finalMp: number; finalSp: number;
  finalAttack: number; finalMAttack: number; finalDefence: number; finalMDefence: number;
  finalHit: number; finalCritical: number; finalDodge: number; finalSpeed: number;
  finalStrength: number; finalAgility: number; finalStamina: number; finalIntelligence: number; finalEnergy: number;
  lastPoint: number; spirituality: number;
  ee: number; en: number; ef: boolean | number;
  makerActive?: boolean; qualityType?: number; starType?: number;
}

/** getCharDetailData reply (all numbers; % ones displayed with '%'). */
export interface CharDetailData {
  finalCombo: number; finalCounter: number; finalRebornRate: number; finalBreakReborn: number;
  finalDefy: number; finalResiDefy: number; finalResiCritical: number; finalCriticalDamage: number;
  finalReduceHurt1: number; finalReduceHurt2: number; finalEnhPhyHurt: number; finalEnhMagicHurt: number;
  finalPraDef: number; finalPraMagDef: number;
  finalDizzy: number; finalConfusion: number; finalLight: number; finalSleep: number; finalPoison: number; finalRage: number;
  finalResiDizzy: number; finalResiConfusion: number; finalResiLight: number; finalResiSleep: number;
  finalResiPoison: number; finalResiRage: number;
}
export interface FinalPraReply { key: 'finalPraDef' | 'finalPraMagDef'; value: number }

/** onUPP (extend existing PlayerUpdate): */
// PlayerUpdate += currentHp, currentMp, currentSp, expSkill?, property?: Partial<CharProperty>, ee?, en?, ef?

// --- Inventory (extend inventory.ts) ---
export const SlotType = { BAG: 0, EQUIPPED: 4 /* client Slot.SLOT_EQUIP */ } as const;
export interface UseItemArgs { targetType: 1 | 2; petId: number; itemId: number } // wire: [targetType, petId, itemId]
export interface PotionCandidate { sid: number /* item instance id */; priority: number }
// fullHpRecoverByItem / fullMpRecoverByItem wire: [targetType, petId, PotionCandidate[]]
export type MoveItemArgs = [fromSid: number, toSid: number];
export type MoveItemNumArgs = [fromSid: number, toSid: number, count: number];
export type DropItemArgs = [itemId: number, passMd5?: string];
export type EquipOffArgs = [itemId: number, toSid: number /* -1 = first free */];

export interface MoveItemPush { from: number; to: number; itemId: number }          // onMoveItem(from, to, id) positional

// --- Buffs ---
export const BuffType = { BATTLE: 1, TIMED: 2, PERMANENT: 3, PERMANENT_UNIQUE: 10 } as const;
export interface LongBuff {
  id: number; bid: number; type: number;
  battleLeft?: number;        // type 1
  timeAll?: number; addTime?: number; timeLeft?: number; // seconds, type 2
  ineffectiveTime?: number;   // epoch ms, type 2
  desc?: string;              // only global double-exp buff
}
export type InitLongBuff = Record<string, LongBuff>;
```

Ownership: server `modules/character` (`changeProperty`, `lvUp`, `getCharDetailData`, `getFinalPraDef`, `finalPraMagDef`, stat recompute, `onUPP.property`),
`modules/inventory` (`equipOn/Off`, `isEquSid`, `useItem`, `useMultiItem`, potions, `moveItem*`, `dropItem`, `bagSort`), new `modules/buff` (`initLongBuff` at
`chooseCharactor`, `upLongBuff`, `delBuff`, `delBuffClient`). Client: `client/src/ui/characterPanel.ts` (+ detail panel), extend
`client/src/game/BagController.ts` + `ui/bagPanel.ts` (equip, use, drag/split/drop/sort), `client/src/ui/hud/buffBar.ts` (left 2, top 115, 16x16 icons, 10 s timer),
`client/src/ui/hud/portrait.ts` (`lvUp` button already stubbed with `notReady`).

H5 delta (from `protocol.ts`/`inventory.ts`): `PlayerData` has only base `att*` stats - no `final*`/`property`, `lastPoint` is `attrPoints`; `PlayerUpdate` lacks
`currentHp/currentMp/property`; `LEVEL_EXP` treats `exp` as cumulative; `SlotType` only BAG; `BagItem.durability` should map to `endureLeft`; no RPC for any item in sections 1-5 is registered
(`server/src/modules/*/*.rpc.ts` only has `getInitSlot`, `buyAmountItemClient`, `sellItem`).

## 8. Open questions (cannot be settled by static analysis)

1. **expSkill semantics**: client compares `player.expSkill >= levelUpExp(level)` (a per-level delta) everywhere (`PortraitCanvas.as:759`, `Basic.as:199`), so after a level-up the server
   must leave `expSkill` as the residual exp **inside** the new level (or the button would re-show). H5 stores cumulative `exp` and `LEVEL_EXP` as cumulative; `portrait.ts` subtracts a base. Decide which value the
   `onUPP.expSkill`/`exp` key carries; Go notes say `onPlayerLevelUp` carries "cumulative expSkill" - unverified.
2. Push **order** `onUPP` (level/exp/property) -> `onPlayerLevelUp` -> `lvUp` push -> `lvUp` reply: the HUD `onLevelUp` reads `player.level` at reply time (`PortraitCanvas.as:1012`), so the level update must be applied first; arrival order cannot be proven (CallBack aborted).
3. Who invokes `CharactorPanel.onInitViewProp(obj)` and when (`:5480`); how `player.property` is first filled (login `cData`? `onUPP`?). No `.property =` assignment other than that method and pets (`PetManagerPanel.as:7168`).
4. Double-click on a bag item (equip vs use) and the bag toolbar (sort, split, drop, use, repair modes, tabs, `bagSort` args/Responder, the 30 s vs 3 s sort cooldown) live in the undecompiled `BagPanel`.
5. Exact push set after `useItem` potion / `equipOn` / `moveItem` is Go-derived only; the client handlers (`onAddCharactorSlot`, `onMoveItem`, `onSwapItem`, `onStackItemInto`, `onItemSort`, `onUpChaSlotStackNum`) are not decompiled, so their exact payload shapes (esp. `onUpChaSlotStackNum`, which Go notes mention but no source read here) should be taken from `legacy-server-researcher`.
6. `finalPraDef`/`finalPraMagDef` percentage formula (server-side `getFinalPraDef`) is not in the client.
7. Whether `equipOn` should enforce level/class: neither client nor (per `service.go:667-682`) Go does; only tooltip colouring. Decide deliberately for H5.
8. `delPass` provenance (how the cached secondary-password hash gets set) is outside the decompiled files; H5 has no secondary password - decide to accept-and-ignore `dropItem` arg 2 and `lvUp` arg 2.
9. Default value of `NumPanel._defaultStack` (initial split count) not read.
