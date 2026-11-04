# Auto-battle / auto features: Flash client contract

Legacy root `E:\mcgame\docs\client` (paths below are relative to it). Verified by direct reads/greps on 2026-11-04.
Items marked **inferred** were not proven by a direct read.

## 1. Summary

The Flash client has exactly one "auto" gameplay feature: **client-side auto-battle**. There is no server-side autopilot
in the Flash client. When auto is on, the client itself decides every round's command(s) from the saved settings
(`GamePredef.GLOBAL_SETTING`, filled from login `interfaceData`) and sends them with the normal `battleUpdateCmd`.
The server never "runs" auto. A round counter (`MAX_NUM` = 150) limits it unless the buff 1203 ("gặp địch tại chỗ")
or the world-boss auto is active. Settings are edited in `BattleSettingPanel` and saved with `skillSetBattle`
(skills) and `uif` (item slots, thresholds). There is **no** auto-hunt, auto-walk-to-monster or auto-encounter button
in Flash. Random encounters are server-rolled via `cbom` (while walking) / `cb` (only while standing still with buff 1203).

## 2. Key files

| File | Role |
|---|---|
| `logic/Battle.as` | `battleAuto()` L94, `battlePetAuto()` L353, `_aidPet()` L1212, `battleCmd()` L1105, `sendNow()` L845 (`battleUpdateCmd`), target pickers L853-1035 |
| `view/view/compBattle/AutoBattleCanvas.as` | in-battle banner (PANEL_BATTLEAUTO 660): `auto`, `num`, `MAX_NUM`, `startAuto()`, `stopAuto()` |
| `view/view/compBattle/PlayerCmdCanvas.as` | `doCmd("btnAuto")` L555, `show()` L786 (per-round auto trigger) |
| `view/view/compBattle/PetCmdCanvas.as` | `show()` L600 (pet auto trigger), `btnAuto` L398 |
| `view/view/compBattle/BattleStage.as` | `startNewRound()` L1188, `startAuto()` L1969, banner visibility at battle start L2902 |
| `view/view/compMain/AutoBattleCanva.as` | HUD toggle next to hotbar (MAIN_AUTOBATTLE_SET 122): button "Auto bật/tắt" + lock |
| `view/view/compDragable/BattleSettingPanel.as` | settings panel (PANEL_BATTLESET 630) |
| `view/view/compMain/MiniMapCanvas.as` | `btn_battle` label "Auto" opens BattleSettingPanel (L755/L778); `randomBattleBtn` is NOT auto |
| `system/Core.as` | `updateSettingNow` L347, `updateSetting` L1539, `updatePetSetting` L2192, `getItemNum` L1484 |
| `predef/GamePredef.as` | `GLOBAL_SETTING` L42, `interfaceSetting` setter L11000, `BATTLE_ACTION_*` L963-973, `BATTLE_AUTO_DEFENSE_*` L974-975 |
| `view/view/compGameStage/PlayerView.as` | `cbom`/`cb` encounter checks, `startCheckBattleTimer` L60 |
| `view/view/compMain/WbAutoBattleCanva.as` | world-boss "Tự động đánh" (separate feature, `wbAutoBattle`) |
| `config/RPCConfig.as` | `RPC_DELAY["cbom"]=1000` L16, `RPC_DENY_MAX["cbom"]=24` L71 |
| `rpc/RemoteObj.as` | `callProperty` L89 / `call` L117: fire-and-forget vs Responder, RPC_DELAY drop |

There is no `ShortcutCanvas.as` in the decompile (Glob found none). The nearest equivalents are `compMain/AutoBattleCanva.as`
(HUD button) and `compMain/UserBarCanvas.as` (hotbar, no auto code: grep for keyboard/Auto found nothing).

## 3. Language strings (exact)

| Constant | Vietnamese | Used in |
|---|---|---|
| `AUTOBATTLECANVAS_U[0]` (Language.as:3203) | `Kết thúc auto` | stop button in `compBattle/AutoBattleCanvas` |
| `AUTOBATTLECANVAS_U[1]` (:3204) | `Auto` | banner title |
| `AUTOBATTLECANVAS_S[0]` (:734) | `Auto hiện tại còn lại　　　 lượt.` (contains full-width spaces; the `num` label sits in the gap) | banner text, `RoundedLabel1` |
| `AUTOBATTLECANVA_U[0]` (:4182) | `Auto\nbật` | HUD button label `changBtn` (always this text; the on/off look is the red "xx" image `visible`) |
| `AUTOBATTLECANVA_U[1]` (:4183) | `Auto\ntắt` | defined, no reader found (inferred unused) |
| `AUTOBATTLECANVA_U[2]` (:4184) | `Nút khóa phím tắt` | lock button tooltip (hotbar slot lock, `ubl`) |
| `AUTOBATTLECANVA_U[3]` (:4185) | `Nút tự động chiến đấu` | HUD button tooltip |
| `AUTOBATTLECANVA_U[4]` | `MP của nhân vật không đủ,hãy bổ sung!` | `battleAuto` attack skill MP short (Battle.as:257) |
| `AUTOBATTLECANVA_U[5]` | `HP của nhân vật không đủ,hãy bổ sung!` | HP short (Battle.as:261) |
| `AUTOBATTLECANVA_U[6]` | `HP và MP của nhân vật không đủ,hãy bổ sung!` | both short (Battle.as:265) |
| `AUTOBATTLECANVA_U[7]` | `MP của pet không đủ,hãy bổ sung!` | `battlePetAuto` (Battle.as:526) |
| `AUTOBATTLECANVA_U[8]` | `HP của pet không đủ,hãy bổ sung!` | Battle.as:530 |
| `AUTOBATTLECANVA_U[9]` | `HP và MP của pet không đủ,hãy bổ sung!` | Battle.as:534 |
| `AUTOBATTLECANVA_S[0]` (:2050) | `T.lập` | ChatCanvas only (not auto) |
| `BATTLESETTINGPANEL_U[0]` (:3377) | `Tự động chiến đấu` | panel title |
| `BATTLESETTINGPANEL_U[1]` | `Thao tác nhân vật` | left column header (BasicTxtButton1) |
| `BATTLESETTINGPANEL_U[2]` | `Kỹ năng tấn công` | header (BasicTxtButton2 and 4) |
| `BATTLESETTINGPANEL_U[3]` | `Thao tác pet` | right column header (BasicTxtButton3) |
| `BATTLESETTINGPANEL_U[4]` | `Phục hồi HP` | label for slot 1 (and 2) |
| `BATTLESETTINGPANEL_U[5]` | `Phục hồi MP` | label for slot 9 (and 10) |
| `BATTLESETTINGPANEL_U[6]` | `Pet hỗ trợ` | label for slot 3 (and 4) |
| `BATTLESETTINGPANEL_U[7]` | `Pet hỗ trợ` | label for slot 5 (and 6) |
| `BATTLESETTINGPANEL_U[8]` | `Phím tắc(S)dùng để mở ô kỹ năng` (typo "tắc" preserved) | Label25 hint |
| `BATTLESETTINGPANEL_S[0]` / `[1]` | `Chọn kỹ năng đánh mặc định\n Để trống là tấn công thường` | description above slot 7 / slot 8 |
| `BATTLESETTINGPANEL_S[2]` | `Tự động phòng ngự` | both auto-defence checkboxes |
| `MINIMAPCANVAS_U[3]` (:4208) | `Auto` | label of `btn_battle` -> opens BattleSettingPanel |
| `MINIMAPCANVAS_U[5]` | `Ủy thác` | `btn_autoExp` (offline exp delegation panel, MAIN_AUTO_EXP; not battle auto) |
| `MINIMAPCANVAS_U[18]` | `Thiết lập` | `btn_battle_copy` (visible only in world-boss map; also `showBattle()`) |
| `MINIMAPCANVAS_U[20]` | `PK ngẫu nhiên` | `randomBattleBtn` -> `autoBattleByRandom` (PvP random match, NOT auto-hunt) |
| `MINIMAPCANVAS_S[31..33]` | `1 giờ gặp địch tại chỗ` / `15 phút liên tục gặp địch` / `1 giờ gặp đầy quái` | names of the 3 encounter buffs (buff 1203 = still-encounter) |
| `TEXTUTIL_S[14]` (:3173) | `Tự động chiến đấu` | chat-link menu entry opening PANEL_BATTLESET (TextUtil.as:406) |
| `KEY_S[0]`/`[1]` (:438-439) | `Kết thúc tự động gặp địch` / `Bắt đầu tự động gặp địch` | no code reference found (dead string) |
| `MAP_UTIL_INFO_S[0..4]` (:5542-5546) | `Tự động tìm đường` + 0-4 dots | only defined in Language.as; no reader in `.as` (loading animation text of a path tool that is gone) |
| `WBQUTOBATTLECANVA_U[0]` | `Tự động đánh` | world-boss auto toggle |
| `TASKSWEEPPANEL_U[0]` | `Tự động hoàn thành phụ bản` | `AutoTaskBox` (instance sweep, not battle auto) |

## 4. Flow

### 4.1 Turning auto on
1. **In battle**: command panel button `btnAuto` -> `PlayerCmdCanvas.btnClick` -> `doCmd("btnAuto")` (PlayerCmdCanvas.as:555-572):
   - `STAGE_BATTLE.startAuto()` -> `AutoBattleCanvas.startAuto()` (AutoBattleCanvas.as:275): `visible=true; auto=true; BattleCreatureView.cmdMode=false; _num=MAX_NUM(150)`.
   - If `auto && num>0`: if buff 1203 present -> `num = maxNum` ("no need to minus"), else `num--` (so this round already uses 1 -> 149).
   - `_core.battle.battleAuto()` immediately for the character this round.
   - `MAIN_AUTOBATTLE_SET.changeStyle(false)` (hide the red "xx" image).
   - The pet half follows through `battleCmd` -> `cPetCmd.show()` -> `battlePetAuto()` (see 4.3).
2. **From the HUD** (on the map, before a fight): `compMain/AutoBattleCanva.changBtn` click -> `autoBattleChange()` (AutoBattleCanva.as:198): if not auto -> `startAuto(); hide(); changeStyle(false); xx.visible=false`; else `stopAuto(); changeStyle(true); xx.visible=true`. The banner is hidden on the map and only shown when a battle starts.
3. **Persistence / auto-start at battle begin**: `auto` and `_num` live in the singleton panel and are **not** reset by `watchOnEnd`/`battleOnStart`. At `BattleStage.startBattle` (BattleStage.as:2902): `_auto.visible = auto && !replay`. Then `firstRound()` (:1661) -> `startNewRound()` -> `cPlayerCmd.show()` (:1200) -> auto path (below). So auto continues across battles and the 150-round budget is shared across them. Only `stopAuto()` (button "Kết thúc auto", HUD toggle) or `num<=0 || num>150` resets it. Auto is not persisted to the server and is lost on relogin (field default `false`, AutoBattleCanvas.as:59).

### 4.2 Per-round trigger (character)
`startNewRound()` (BattleStage.as:1188): `battleClearCmd()` (`_cmdAry=[]`), then if `_playerAlive`: `cTime.show(); cPlayerCmd.show();`.
`PlayerCmdCanvas.show()` (:786-810):
- If `auto && num>0`: if buff 1203 active **or** world-boss `getWbAuto()` -> `num = maxNum`, else `num--`; then `battleAuto()`. The panel stays hidden.
- Else: manual (`cmdState=ST_BATTLE_ATTACK`, panel visible).
- `num` setter (AutoBattleCanvas.as:166-177): `if (num<=0 || num>150) { auto=false; visible=false; }`. The decrement that reaches 0 still runs `battleAuto()` once (the call follows the `num--`), but `auto` is already false when `PetCmdCanvas.show()` runs for that round, so on the last round the pet panel shows manually (**inferred** from call order: `battleAuto` -> `battleCmd` -> `cPetCmd.show()`).
- If the character is dead but the pet alive: `startNewRound` sends `battleCmd(-1, DEFENCE, -1)` itself (BattleStage.as:1210) and the pet panel decides (pet auto only if `auto`).

### 4.3 Per-round trigger (pet)
`battleCmd` (Battle.as:1105): pushes the cmd into `_cmdAry`; if length >= 2 -> `battleSendCmd()`; else hides `cPlayerCmd`; no pet -> send now; pet and `petActive` -> `cPetCmd.show()`; else send.
`PetCmdCanvas.show()` (:600): `if (auto) battlePetAuto(); else manual`. Note: the pet branch checks only `auto`, never `num`, and never decrements `num`.
`battlePetAuto`: if `battleGetPlayerPet(cList)` is null -> `battleCmd(-1, BATTLE_ACTION_AUTO(-110), 0)` and return.

### 4.4 `battleCmd` / send (Battle.as:1105-1156, 845-906)
- `battleCmd(tid:Number, action:int, id:Number=-1, level:int=-1)`: pushes `{tid, action, id, level}` to `_cmdAry`.
- Special: `if (_lastCmd && action == BATTLE_ACTION_AUTO)` then `_cmdAry = _lastCmd; battleSendCmd(); return` (re-sends the previous round's commands; this is how the pet's `-110` "repeat" works).
- `battleSendCmd()` hides cmd panels, sets `cmdState=ST_BATTLE_WAIT`, throttles to `BATTLE_SEND_DELAY = 4000` ms after `_newRoundTime` (Battle.as:56, :896-905): if less than 4 s since the round started it `setTimeout(sendLater, 4000 - elapsed)`. `_sending` guards double send.
- `sendNow()` (:845): `_lastCmd = _cmdAry; _core.remote.battleUpdateCmd(_cmdAry); _cmdAry = []`. `remote.battleUpdateCmd` is `RemoteObj.callProperty` (fire-and-forget, no Responder). Not in `RPC_DELAY`.
- Skill commands send `level = -1` (the 4th default arg) for auto: `battleCmd(tid, BATTLE_ACTION_SKILL, skillId)`. Item commands send `id = slot.id` (the bag slot's row id from `Core.getItemNum(TBL_ITEM_TEMPLATE, templateId).slot`), `level = -1`.

## 5. Decision chains (exact)

Constants: `BATTLE_ACTION_ATTACK=-10, DEFENCE=-20, ESCAPE=-30, TIMEOUT=-40, SKILL=-50, ITEM=-60, CATCH=-70, POSITION=-80, RETURN=-90, PET=-100, AUTO=-110` (GamePredef.as:963-973). `TBL_SKILL=52, TBL_ITEM_TEMPLATE=29, TBL_PET=39, TBL_CHARACTOR` (type check). `SKILL_TYPE_CLOSE=1`, `SKILL_TYPE_DEFENDER=10`. `SKILL_TARGET_TYPE_ENEMEY=4`, `SELF_PET=3` (Battle.as:27-38). `GS` = `GamePredef.GLOBAL_SETTING`.

Helpers (all use `cList`, the battle creature map): `battleGetRandomEnemy` (any alive visible `leftSide` unit, Battle.as:922), `battleGetRandomFrontEnemy` (alive, not behind a living unit, :853), `battleGetRandomTeam` (any alive own-side unit incl. self/pets, :1001), `battleGetGroupPlayerList` (alive own-side `TBL_CHARACTOR`, :805), `battleGetGroupPetList` (alive own-side `TBL_PET`, :1255), `isFrontPos(bid)` (BATTLE_POS y is 1 or 2, :873). Enemy side is `leftSide==true`. All "random" picks use `Math.random()` (the choice is client-side only). Lists iterate with `for..in` over `cList` (key order, **not** sorted by HP). "Lowest HP ally" is not implemented: the heal loops take the **first** ally in iteration order whose HP% is below the threshold.

### 5.1 `battleAuto()` (character), in priority order. Each step that sends returns immediately.
1. **Self HP** (L111-137): if `GS.bs1 > 0` and `hp/finalHp*100 < GS.p2`:
   - `GS.bt1 == TBL_SKILL(52)`: if the skill's `targetType == 4` (ENEMEY) -> tid = random enemy battleId (or -1), else tid = own `battleId`; send `battleCmd(tid, SKILL, bs1)`; return (no cost check here).
   - else item: `getItemNum(TBL_ITEM_TEMPLATE, bs1)`; if `slot` exists -> `battleCmd(ownBattleId, ITEM, slot.id)`; return. No item -> fall through to step 2.
2. **Self MP** (L138-149): if `GS.bs9 > 0` and `mp/finalMp*100 < GS.p3`: item only (no `bt9`); `battleCmd(ownBattleId, ITEM, slot.id)`; return if the item exists.
3. **Team heal** (L150-181): if `GS.bs3 > 0`: for each alive own character (`battleGetGroupPlayerList`, includes self): if `hp/hpMax*100 < GS.p4`: tid = that unit's battleId; skill (`bt3==52`): if targetType==4 then tid = random enemy; `battleCmd(tid, SKILL, bs3)`; return. Item: `battleCmd(tid, ITEM, slot.id)`; return if the item exists; else continue to the next ally.
4. **Pet heal** (L182-209): if `GS.bs5 > 0`: for each alive own-side pet (`battleGetGroupPetList`, includes other players' pets): if `hp/hpMax*100 < GS.p5`: tid = pet battleId; then `_aidPet(tid)` (L1212): skill (`bt5==52`): if the skill's `targetType == SELF_PET(3)` it is only sent when tid is **the player's own pet**, else sent anyway: `battleCmd(tid, SKILL, bs5)`; item: `battleCmd(tid, ITEM, slot.id)`. Return true -> return. Note `_aidPet` reads `GS.bs5/bt5` directly. (The `bt5==TBL_SKILL` pre-block in the loop L190-202 computes a target that `_aidPet` ignores: decompiler artefact/dead code.)
5. **Auto defence** (L210-214): `if (GamePredef.BATTLE_AUTO_DEFENSE_PLAYER)`: `battleCmd(-1, DEFENCE, -1)`; return. The flag is a client-only static (set from the checkbox, default false, **not** saved to the server, reset on client restart).
6. **Main attack** (L215-310): `tid = random enemy` (or -1).
   - `GS.bs7 > 0`: `skill = GameData.d[TBL_SKILL][bs7]`. Cost check: `useMp >= 1` and `mp < useMp` -> short MP; `0 < useMp < 1` and `useMp > mp/finalMp` -> short MP (fractional = percent of max); `useHp` same logic for HP. If short: `sysMidNote` with `AUTOBATTLECANVA_U[4|5|6]` (mp only / hp only / both) and **fall through to the fallback attack** (step 7). If OK: by `skill.type`: `SKILL_TYPE_DEFENDER(10)` -> tid = random own-side unit; `SKILL_TYPE_CLOSE(1)` -> if own position is not front (`!isFrontPos`) tid = random **front** enemy else random enemy; other types keep the random enemy. Send `battleCmd(tid, SKILL, bs7)`; return.
   - `GS.bs7` empty/0: plain attack: if own position is not front -> random front enemy; `battleCmd(tid, ATTACK(-10), 0)`; return.
7. **Fallback** (L311-319): same plain attack (`ATTACK`, id 0, front enemy if in back row).

### 5.2 `battlePetAuto()` (pet), mirror chain with the pet's own slots
Requires the player's active pet in `cList` (`battleGetPlayerPet`: visible, own side, `type==TBL_PET`, `id == _core.battlePet.id`), else `battleCmd(-1, AUTO, 0)` (repeat last).
1. `GS.bs2 > 0` and pet `hp/hpMax*100 < GS.p6`: skill (`bt2==52`): target enemy if targetType==4 else pet's own battleId; `battleCmd(tid, SKILL, bs2)` / item `battleCmd(petBid, ITEM, slot.id)`.
2. `GS.bs10 > 0` and pet `mp/mpMax*100 < GS.p7`: item only, `battleCmd(petBid, ITEM, slot.id)`.
3. `GS.bs4 > 0`: first alive own **character** with HP% < `GS.p8` (owner/teammates): skill or item exactly like step 3 above using `bt4/bs4`.
4. `GS.bs6 > 0`: first alive own-side **pet** with HP% < `GS.p9`: skill or item using `bt6/bs6` (no `_aidPet`, direct `battleCmd`).
5. `BATTLE_AUTO_DEFENSE_PET` -> `battleCmd(-1, DEFENCE, -1)`.
6. `GS.bs8 > 0`: attack skill with the same cost check (uses pet `mp`, `mpMax`, `hp`, `hpMax`) and messages `AUTOBATTLECANVA_U[7|8|9]`; targeting by skill type as above using the pet's own position; else plain attack (`ATTACK`, 0) with front-row logic from the pet's `battleId`.

### 5.3 Which keys mean what (settings schema)
| Key | Meaning | Panel widget |
|---|---|---|
| `bs1`/`bt1` | char self-heal HP: skill id or item template id; `bt1` = 52 (skill) or 29 (item) | slot `i1` |
| `p2` | HP% threshold for `bs1` (0-100) | slider `hs2` |
| `bs9` | char MP restore item template id (item only, no `bt9`) | `i9` |
| `p3` | MP% threshold | `hs3` |
| `bs3`/`bt3`, `p4` | char heal-teammate (any own character) | `i3`, `hs4` |
| `bs5`/`bt5`, `p5` | char heal-pet (any own-side pet) | `i5`, `hs5` |
| `bs7` | char main attack skill (skill only; 0/empty = plain attack) | `i7` |
| `bs2`/`bt2`, `p6` | pet self-heal HP | `i2`, `hs6` |
| `bs10`, `p7` | pet MP item | `i10`, `hs7` |
| `bs4`/`bt4`, `p8` | pet heals owner/teammates | `i4`, `hs8` |
| `bs6`/`bt6`, `p9` | pet heals pets | `i6`, `hs9` |
| `bs8` | pet main attack skill | `i8` |

Key arithmetic: odd slot = character, even slot = pet (`BattleSettingPanel.setSlot` L1373 `(slot % 2) == 0` -> pet bucket). Slider default in the layout is `value:10` (L159 etc.); real values come from `interfaceData`.
`bt` keys exist only for slots 1-6 (`updateSettingNow(bt..)` is sent only when slot < 7, L1404/L1432).

## 6. Settings UI (`BattleSettingPanel.as`)

Panel 472x438, title `BATTLESETTINGPANEL_U[0]`. Two 226x384 columns. Left = character (canvas at x=10,y=31), right = pet (second canvas, **inferred** mirror at x~236; slot ids confirmed by `i2/i4/i6/i8/i10`, `hs6..hs9`, `updatePetSetting` L2197).

Left column (coordinates inside the 226x384 canvas, L136-511):
- Header buttons `Thao tác nhân vật` (13,10) and `Kỹ năng tấn công` (120,10).
- `i7` at (10,40) + description `BATTLESETTINGPANEL_S[0]` (58,40) + checkbox `chkPlayerAutoDefense` "Tự động phòng ngự" (58,80).
- `Phục hồi HP` label (76,100); `i1` (10,118); slider `hs2` (45,132) 0-100 with end labels `0%`/`100%` at y=125.
- `Phục hồi MP` label (76,169); `i9` (10,188); `hs3` (42,202).
- `Pet hỗ trợ` label (76,237); `i3` (10,257); `hs4` (42,272).
- `Pet hỗ trợ` label (76,320); `i5` (10,341); `hs5` (42,356).
Right column: header `Thao tác pet` / `Kỹ năng tấn công`, `i8` + `S[1]` description + `chkPetAutoDefense`, then `i2/hs6` (HP), `i10/hs7` (MP), `i4/hs8`, `i6/hs9`. Bottom hint Label25 = `U[8]`.

Behaviour:
- Opened via `MiniMapCanvas.showBattle()` = `view.changeVisible(PANEL_BATTLESET); getUI(PANEL_BATTLESET).updateView()` (MiniMapCanvas.as:778-782); also from `UserSystemSetPanel` L674, MazeInfoPanel, PVPGroupPanel, BloodyBattleInfoPanel, world-boss `btn_battle_copy`, chat link `TEXTUTIL_S[14]`.
- `updateView()` -> `initView()` -> `updateCharSetting()` (L2026: `hs2..hs5.value = GS["p"+n]`, `i7.type=TBL_SKILL`, `i9.type=ITEM`, `i1/i3/i5.type = GS["bt1/3/5"]`, `iN.giid = GS["bsN"]` for odd N, awakened skills mapped via `awakenPointDict` + `exSidN`) and `updatePetSetting()` (L2197: only if `_core.battlePet`; `hs6..hs9`, `i8` skill, `i10` item, `i2/i4/i6.type = GS["bt2/4/6"]`).
- Drag-and-drop (`setSlot`, L1346): items accepted only in slots != 7/8; item must have `skillId > 0` or `scriptUse`; pet slots need `useType` 2 or 3, character slots `useType` 1 or 3; skills only in slots != 9/10; character skills reject `reqClass` containing `|100|`; pet skills require the pet to own a skill with the same `codeName` and level >= the dragged one; pet slots refuse when no `battlePet`.
- Saves:
  - **Skill** drop: `remote.skillSetBattle(skillId, level, slotString, isPet)` (L1504; plain `callProperty`, fire-and-forget). Args: `skillId:Number` (awakened variant resolved back to base id when applicable, L1476-1503), `level:int` (from drag source `level`), `slot:String` = `id.slice(1)` e.g. `"7"`, `isPet:Boolean`. Then local `updateSetting`/`updatePetSetting("btN", 52)` and `("bsN", id)`.
  - **Item** drop: `Core.updateSettingNow("btN", 29, isPet)` (only slot < 7) then `updateSettingNow("bsN", templateId, isPet)`; each = local update + `remote.call("uif", null, key, value, isPet)` (Core.as:347-358, null responder).
  - **Slider** `setProgress(n)` (L2106): `updateSettingNow("p"+n, int(value), isPet)`; `isPet = true` for n in 6..9. It fires on every `change` event (no debounce).
  - **Clear slot**: no UI path found in this panel (drag-out/delete not present); the H5 doc `docs/memory/h5-client.md` says `uif("bsN", 0, isPet)`: that is the H5 port's own convention, not verified in Flash.
  - Checkboxes `chkPlayerAutoDefense` / `chkPetAutoDefense` change `GamePredef.BATTLE_AUTO_DEFENSE_PLAYER/PET` and disable the matching attack slot (`i7`/`i8`, `enabled=!flag`, `acceptable`); **no RPC**, not persisted.
  - `setNum()` (L2139) refreshes item counts via `getItemNumNew` (alpha 0.5 when 0); also called from `DataManager.as:442`.

### Loading at login
`GamePredef.interfaceSetting = interfaceData` (GamePredef.as:11000-11029): sets message-channel checkboxes `c0..c3`, then `GLOBAL_SETTING = <whole object>`, overrides `am` from a local SharedObject, `flyEffect`, `maxView` default 100. So `interfaceData` is a flat object containing `bs1..bs10, bt1..bt6, p2..p9, ubl, sid1.., c0..c3, am, he, hm, flyEffect, ac, battleStExpan, apvp ...`. The pet's keys live in the same flat object: `Core.updatePetSetting(key,val)` writes `GLOBAL_SETTING[key]` **and** `_battlePet.pi[key]` (Core.as:2192-2195), so the server must merge the active pet's bucket into `interfaceData` (Go notes in `docs/memory/h5-battle-effects.md` agree) and refresh it when the active pet changes (**inferred**: `PetManagerPanel.as:8714` references PANEL_BATTLESET when switching pets; not read in detail).
`GLOBAL_SETTING` is also written by `Core.updateSetting`/`updateSettingNow` locally before the server ack, so the server is only a persistence store.

## 7. Contract

### RPCs (client -> server)
| Name | Args | Reply | Notes |
|---|---|---|---|
| `battleUpdateCmd` | `[ {tid:Number, action:int, id:Number, level:int}, ... ]` (1 entry for solo, 2 with pet: index 0 owner, 1 pet; may be 1 entry when only one side is acting) | none (fire-and-forget) | one array per round; auto `-110` resend replays the previous array; skill auto `level:-1`; `tid:-1` for defence/escape/auto; item `id` = bag slot row id |
| `skillSetBattle` | `(skillId:Number, level:int, slot:String, isPet:Boolean)` | none | `slot` is the digit string `"1".."10"` (numeric string, see `docs/memory/architecture-protocol.md:73`) |
| `uif` | `(key:String, value:*, isPet:Boolean)` | none | keys: `btN`, `bsN`, `pN` (and unrelated UI keys: am, he, hm, sidN, ...) |
| `us` | `(obj)` e.g. `{ubl:Boolean}` | none from AutoBattleCanva (UserSystemSetPanel uses a Responder) | hotbar lock |
| `cbom` | `(posX:Number, posY:Number)` | none | random-encounter roll while walking >= `CHECK_DIS` 100 px; `RPC_DELAY` 1000 ms, `RPC_DENY_MAX` 24 (PlayerView.as:94-116) |
| `cb` | `()` | none | stationary roll, only while buff 1203 is on (ENTER_FRAME listener, throttled to 2.2 s) |
| `autoBattleByRandom` | `(charId)` | none | "PK ngẫu nhiên" (random PvP match), not auto-battle; button visible when `changeWbBtn(4)` |
| `wbAutoBattle` | `(charId, on:Boolean)` | none | world-boss auto toggle (WbAutoBattleCanva.as:621/625) |

No push is exclusive to auto. It depends on the generic `onBattleStart` / round pushes. The client never reports "auto on/off" to the server.

### Client gating present / absent
- Present: round counter 150, MP/HP cost check for the attack skill (client side only), item existence check (`getItemNum`), `battlePet`/`petActive` conditions, 4 s minimum before send.
- **Absent**: no cooldown, level or VIP checks; no HP check for self-heal skills (`bs1` skill) and no MP cost check for heal skills; no server confirmation. The server must therefore tolerate commands for unknown/unaffordable skills, tid -1, and items already used up (do not rely on client validation).
- Server-side note: auto commands arrive as ordinary `battleUpdateCmd`. A `-110` (`AUTO`) entry means "repeat last round" (the client sends it for the pet when it has no pet in `cList`, and the server should treat it that way or as a defend/attack fallback).

## 8. Map-side auto: findings
- **Auto-hunt / auto-encounter / "Tìm quái" button: does NOT exist** in the Flash client. Grep for `autoWalk|autoRun|AutoPath|autoFind|findPath|goToNpc|autoMove` found nothing. Encounters are rolled by the server: `cbom(x,y)` while moving (PlayerView.onWalking L94, requires the map not to be safe unless `needToCheckBattle()` i.e. `safeCBMids` contains the map, Player.as:1338) and `cb()` per ENTER_FRAME only while the buff `MEET_BATTLE_ON_STILL_BID = 1203` is active (GamePredef.as:1556; `LongBuffCanvas.as:324` stops the timer when removed, `:491` starts it).
- Buff 1203 is the shop item "1 giờ gặp địch tại chỗ" (`MINIMAPCANVAS_S[31]`); with it, auto never decrements `num` (PlayerCmdCanvas.as:560, 792), so auto becomes unlimited.
- **Auto-walk to quest target**: not an auto-walk. Click-to-move uses `Player.closeTo` -> `Core.move.getCloseToRoute` (client-side route) + `remote.udcr({id, route, x, y})` (Player.as:1766-1797). Quest-name links ("nhấp đôi chuột vào tên ... sẽ tự động đến chỗ anh ta", GUIDECANVAS_S[10]) and map-portal clicks (`GUIDECANVAS_S[30]`) walk and trigger the NPC click, but there is no looping "find monster" logic. `GuideAlertPanel.findNpc()` (GuideAlertPanel.as:94) clicks the NPC view for a tutorial step. `MAP_UTIL_INFO_S` "Tự động tìm đường" is a dead string.
- Other things named auto but unrelated: `AutoTaskBox` (PANEL_AUTOTASK 928, RPCs `autoTaskStart/autoTaskCancel/autoTaskGetAward/autoTaskComplete/autoTaskCompleteByGold`, instance sweep), `MiniMapCanvas.btn_autoExp` "Ủy thác" (MAIN_AUTO_EXP offline exp delegation), `StarInstanceCanvas.auto` (star dungeon button, string `STAR_BATTLE[2]` "Tự động"), `WbAutoBattleCanva` (world boss).
- The Go "autopilot" (`E:\mcgame\docs\memory\autopilot.md`) is a **server-side** launcher feature that does not exist in Flash. Its `auto_fight` mirrors `battleAuto` (autopilot.md line 53).

## 9. ShortcutCanvas / MiniMap "Auto"
- `ShortcutCanvas`: no such class in the decompile. The on-screen auto toggle is `compMain/AutoBattleCanva.as` (class `AutoBattleCanva`, MAIN_AUTOBATTLE_SET 122, size 86x52): `changBtn` (x43,y6, 40x40, style `BtnBattleFlag`, label "Auto\nbật", tooltip "Nút tự động chiến đấu") **toggles auto** (`autoBattleChange`); a 20x20 `btnLock` (x22,y26, tooltip "Nút khóa phím tắt") toggles `player.isLockedUB` (locks hotbar slot dragging `setMovable`, saved via `us({ubl})` + `updateSetting("ubl")`; the Go notes say it is never read back, hotbar-userbar.md:17).
- `MiniMapCanvas` button labelled **"Auto"** (`MINIMAPCANVAS_U[3]`, id `btn_battle`, click `__btn_battle_click` MiniMapCanvas.as:755) does **not** start auto: it opens/toggles the **BattleSettingPanel** (`showBattle`). Separate `btn_autoExp` "Ủy thác" opens MAIN_AUTO_EXP.

## 10. Proposed shared types (`packages/shared/src/battle.ts` or `protocol.ts`)
```ts
/** battleUpdateCmd entry; level is -1 for auto skill casts. */
export interface BattleCmdEntry { tid: number; action: number; id: number; level: number }

export const BATTLE_ACTION = {
  ATTACK: -10, DEFENCE: -20, ESCAPE: -30, TIMEOUT: -40, SKILL: -50, ITEM: -60,
  CATCH: -70, POSITION: -80, RETURN: -90, PET: -100, AUTO: -110,
} as const;

/** Flat interfaceData keys read by battleAuto / battlePetAuto (all numbers; bt = 52 skill | 29 item). */
export interface AutoBattleSettings {
  bs1?: number; bs2?: number; bs3?: number; bs4?: number; bs5?: number;
  bs6?: number; bs7?: number; bs8?: number; bs9?: number; bs10?: number;
  bt1?: number; bt2?: number; bt3?: number; bt4?: number; bt5?: number; bt6?: number;
  p2?: number; p3?: number; p4?: number; p5?: number; p6?: number; p7?: number; p8?: number; p9?: number;
}

/** skillSetBattle(skillId, level, slot, isPet): slot is the numeric string "1".."10". */
export type SkillSetBattleArgs = [skillId: number, level: number, slot: string, isPet: boolean];
/** uif(key, value, isPet) */
export type UifArgs = [key: string, value: number | boolean | string, isPet: boolean];
```
Ownership: server `modules/combat` (`battleUpdateCmd`, already present) + a settings RPC in the module that persists `interfaceData`
(`skillSetBattle` is not ported; `uif` is currently in `modules/pk/pk.rpc.ts` and only handles `apvp`; `autoBattleByRandom`, `cb`, `us` are not ported).
Client: decision logic in `client/src/game` (battle controller), settings panel in `client/src/ui`, local `autoCanvas` state (`auto`, `num`).

## 11. Open questions
1. `-110` on the server side: Flash treats `AUTO` as "resend `_lastCmd`" only client-side, and sends it raw only for the pet-less case. Behaviour when the server receives it unrolled is not defined by the client (Go notes say it is resolved as a plain attack).
2. Whether the server pushes the `interfaceData` pet bucket on pet switch (`PetManagerPanel.as:8714`) was not traced.
3. Right-column layout coordinates are mirrored by inference; read L640-1000 for exact pixels if pixel parity is required.
4. Equal-HP/targets: `for..in` order over `cList` is not specified by AS3 for dynamic objects (numeric keys usually ascending); treat "first low ally" as ascending battleId (**inferred**).
5. Whether the 150 counter should reset per battle: Flash does not reset it (shared across battles until `stopAuto`). The Go note `battle-combat.md:440` mentions an "unlimited battle auto (client patch)" which is outside the pure Flash behaviour.
