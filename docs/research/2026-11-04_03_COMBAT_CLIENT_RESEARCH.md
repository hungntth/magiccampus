# M2 Combat — legacy Flash client research (solo character vs monsters)

Scope: solo character, no pets, no PvP, no group. All `.as` paths are relative to `D:\mcgame\docs\client`
(legacy tree, read-only). Everything is marked with `file:line`; **inferred** = not provable from the decompile.

## 0. Hard limits of the decompile (read first)

- `system/CallBack.as` is an empty stub ("trait count exceeds set limit", `CallBack.as:11-14`). The push
  names `onBattleStart`, `onBattlePlayList`, `onEndBattle`, `onSetCharState`, `onUpdateQuestKill` are **not visible
  in the client**; they come from the Go notes (`D:\mcgame\docs\memory\battle-combat.md`). Payloads below are derived
  from the consumers: `logic/Battle.as:battleOnStart` (1158), `BattleStage.startBattle` (2767) and
  `BattleStage.startSequence` (1117).
- `com.qeedoo.game.resource.AbstractGameRes` (behavior ids `BH_*`) is **not decompiled**. Numeric values come from
  `BattleCreatureView.as:46-54` (the `BH_DODGE..BH_DEFENDED` constants) and from the Go server
  (`internal/domain/combat/battle.go:369-403`, `pet_actions.go:52`, `turn_executor.go:282`); the 0-7 values are also
  confirmed visually against the converted sheets (section 4.3).
- `ResManager` (asset URL builder), `BagPanel` (item picking), `ViewManager.createUI` placement of the command panels
  are not available. Panel pixel positions of `PlayerCmdCanvas` are therefore unknown.
- `D:\mcgame\docs\research\2026-04-11_00_BATTLE_SOLO_VS_PET_RESEARCH.md` does not exist (only the memory summary).

## 1. Summary

Walking on a non-safe map makes the client fire `cbom(x, y)` about once a second; the server may answer with a battle
push (`onBattleStart`). Walking-monster NPCs and boss NPCs start a fight through `hitNpc` / `clickBoss` /
`clickNpc`. The battle is a full-screen stage: a darkened snapshot of the map, enemies on the upper-left diagonal grid,
the player on the lower-right one. Each round the player gets 25 s to pick a command (attack, defend, skill, item,
flee ...), the client sends `battleUpdateCmd([...])`, the server answers with a playback script
(`startSequence`, an array of action groups) and the client animates it, ends with an `{end:true}` action, sends
`battlePlayEnd` and returns to the map. Death at the end triggers `reliveSwitch` and a revive dialog.

## 2. Key files

| File | Role |
|---|---|
| `logic/Battle.as` | Command queue/sender (`battleCmd`, `battleSendCmd`, `sendNow`), start/end (`battleOnStart`, `battleOnEnd`), grid tables, auto-battle, target-area helpers |
| `view/view/compBattle/BattleStage.as` | Stage: layers, slot coordinates, `startBattle`, `startSequence`/`nextActionRound`/`execBehavior`, round start, end, revive dialogs |
| `view/view/compGameStage/BattleCreatureView.as` | One combatant: bars, name, `battleState` (sSObj/tSObj keys), `battleBehavior` (bid), target validation/click |
| `view/view/compGameStage/CreatureView.as` | Effects (`frontEffect/attackEffect/skillEffect/bulletTo`), move speeds, `fadeOut`, `faceTo` |
| `view/view/compBattle/PlayerCmdCanvas.as` | Command menu (9 buttons) |
| `view/view/compBattle/TimeCountCanvas.as`, `SkillCanvas.as` | Turn timer; center banner text |
| `view/view/compDragable/SkillManager.as`, `view/view/comp/TipSkill.as` | Skill picker in battle; MP-cost display |
| `view/view/comp/StarBattleReport.as` | Result window shown ONLY for the star-instance path (see 6.2) |
| `view/view/compGameStage/PlayerView.as`, `NPCView.as` | `cbom` trigger; `hitNpc`/`clickBoss`/`clickNpc` triggers |
| `view/view/compDragable/QuestGuide.as`, `QuestManager.as`, `view/view/comp/QuestCanvas.as` | Kill-quest progress display |
| `config/RPCConfig.as`, `rpc/RemoteObj.as` | Client-side RPC throttles |
| `predef/GamePredef.as` | Action/state/BS_* constants |

## 3. Battle start

### 3.1 Random encounter (`cbom`)
- Sent from `PlayerView.onWalking` (`view/view/compGameStage/PlayerView.as:94-117`): `_core.remote.cbom(posX, posY)` (no
  Responder; the reply is a server push). Conditions: distance from `lastCheckPoint` >= `CHECK_DIS=100` px (`:23`);
  skipped when `player.mapSafe` (`Player.as:1665`: `mapData.safeFlag > 0`) unless the current map id is in
  `player.safeCBMids` (`Player.as:1338-1349`, filled by `updateSafeCBMids` `:2432`); sent only if on ground OR
  `mapData.airSafe != 1` (`PlayerView.as:112`).
- `lastCheckPoint` is NOT updated after sending; only `Battle.battleOnStart` (`Battle.as:1166`) and `BattleMap.initBattleMap`
  (`BattleMap.as:22`) reset it (initial `(0,0)`, `PlayerView.as:41`). So once 100 px from the last battle point the client
  sends `cbom` on every walk frame; the proxy throttles it: `RPC_DELAY["cbom"]=1000` ms and `RPC_DENY_MAX["cbom"]=24`
  (`config/RPCConfig.as:16,71`, `rpc/RemoteObj.as:89-115`: calls inside the window are dropped, forced through after 24
  drops). Net effect: ~1 `cbom`/s while walking. The server rolls the encounter per call.
- `cb()` (no args, `PlayerView.as:127-150`) is only used when buff `MEET_BATTLE_ON_STILL_BID=1203` is active
  (`GamePredef.as:1556`, `LongBuffCanvas.as:488-496`). Out of M2.
- `basicBattleRate`, `basicMinNum/basicMaxNum` (seed table `data_tbl_map`: `basic_battle_rate`, `basic_min_num`,
  `basic_max_num`) are NOT read anywhere in the client: pure server data. Client reads only `safeFlag` and `airSafe`.
  Seed examples: map 1 and 9 rate 0 / safe_flag 1; map 2, 3, 4 rate 50, min 1, max 10, safe_flag 0.

### 3.2 NPC-triggered
- Walking monster NPC (`NPC_TYPE_WALK=25`): `NPCView.onEnter` (`NPCView.as:307-369`): not in battle, player alive, distance
  < 50 px, and not within 3 s of the last hit of the same NPC id (5 s for `TREASURE_NPC` ids; `Battle.battleOnEnd`
  stores `player.lastHitNpc={nid,last}` `Battle.as:762-773`) -> NPC walks onto the player and
  `_core.remote.hitNpc(npcId)` (throttle 2100 ms, `RPCConfig.as:54`). Where `onEnter` is registered is not in the decompile
  (**inferred**: walking monsters only).
- Boss NPC (`NPC_TYPE_BOSS=15`): click -> `NPCView.clickNpc` (`NPCView.as:108-198`) -> `clickBoss(npcId)` (`:215-217`, throttle
  1100 ms). Confirm dialogs: `NPC lv - 5 > player.level` -> "Tên này xem ra rất khó đối phó, xác nhận tấn công?" (`NPCVIEW_S[4]`);
  `player.level - 10 > lv` (boss, or type-10 NPC with `subType=="all"`) -> "Tên này xem ra chả mang theo thứ gì tốt cả, xác nhận tấn công?"
  (`NPCVIEW_S[5]`, `Language.as:2046-2047`). YES -> `doClick()`.
- Every other NPC (incl. quest-battle types 10/19/20) -> `clickNpc(npcId)` (`NPCView.as:300`); the client does not
  distinguish; the server decides to push `onBattleStart` instead of the dialog. `clickNpc` guards: `core.state == ST_NORMAL`,
  player alive, within 250 px else walk closer (`:117-140`), NPC `busy` -> "Không thấy ta đang bận sao?" (`NPCVIEW_S[3]`).
  Type 20 has no constant in `GamePredef.as:308-334` (H5 already has `NpcType.QUEST_BATTLE=20`).

### 3.3 Order the client expects (from Go notes, not client-provable)
`onUpdatePet` (pet only) -> `onSetCharState {cid, state:5}` (`ST_BATTLE=5`, `GamePredef.as:152`) -> `onBattleStart`. Without
`onSetCharState` Go reports the client falls onto an empty-args `battleUpdateCmd` path. **Needs live capture** to confirm
for solo.

## 4. Battle stage

### 4.1 `onBattleStart` payload (consumers: `Battle.as:1158-1175`, `BattleStage.as:2767-2920`)
Top level keys read: `battleFieldId` (string, stored `Battle.as:1160`), `nid` (NPC id, `:1161`, drives the re-hit cooldown),
`cList` (array/object of participants; iterated with `for each`, `BattleStage.as:1064,1071`), `bossFlag` (`:2851`, selects
background tint + music `Core.as:1259-1272`), `airBattle` (`:2852`; keep false), `guest` (`:2863`; false), `sneakFlag`
(`:2868,2886`: 0 normal, 1 = we ambush -> banner "Đánh lén" `BATTLESTAGE_S[4]`, -1 = ambushed -> banner "Bị đánh lén"
`BATTLESTAGE_S[3]` and no command round `:2969-2986`), `warMap` (`:2828`, star-instance bg), `magicCircle` (`:2838`,
ignore). `battleType`, `mapId`, `battleData` (Go notes) are **not read** by these consumers.

Participant (cList entry) fields read: `battleId` (slot 0-19, the key of the view table, `BattleStage.as:1714-1718`),
`type` (2 char / 12 creature / 39 pet, `GamePredef.as:495,505,532`), `id`, `hp/hpMax/mp/mpMax/sp/spMax`
(`BattleCreatureView.as:1143-1148`), `c` (name colour override `:1219-1222`), plus the object fed to `Creature.data`
(`Core.createCreature` `Core.as:1755-1760`): `name`, `level`, `resCode`, `bossFlag`, `withCloud` (`object/Creature.as` fields).
Characters use the already known scene object `_core.getCharactor(id)` (`BattleStage.as:1091`), so the player's `cList`
entry only needs `id/battleId/type/hp*/mp*/sp*`. Creature names: text before `【` is shown (`BattleCreatureView.as:236-240`).
Pets add `cid` (`:1149-1163`). `sp/spMax` must be numbers (bar always built).

### 4.2 Layout
- Stage = 900x570 (`GamePredef.as:132-137`), `cLayer` 900x570 centred (`BattleStage.as:244-255`). Layer order bottom->top:
  `bgLayer` (map snapshot) -> `bgImg` -> `magicCircleImg0` -> cloud -> `cBuff` -> `backEffectLayer` -> `cLayer` (combatants,
  depth-sorted `:1420,2882`) -> `frontEffectLayer` -> `battleInfo` -> `skillCanvas` (centre banner) -> `watchCmd`/`replayCmd` ->
  `infoPanel` -> `cTime` (`:176-680`).
- Background: snapshot of the main map canvas drawn into `bgLayer` with a colour transform: normal `ColorTransform(1,1.1,1)`
  (green x1.1), boss `ColorTransform(1.1,1,1)` (red x1.1) (`BattleStage.as:2669-2699`, `GamePredef.as:752-753`); then `bgImg` at
  alpha 0.6 with `resource/ui/UI_LOADING_BACK.swf` (`GamePredef.as:120`, `BattleStage.as:2835-2836`); star-instance uses
  `resource/ui/starrySky.jpg` alpha 1 (`:2830`). Main map is hidden (`:2698`). Audio: boss `playMusic("4")`, else `"5"` (`Core.as:1259-1272`).
- Slots (`Battle.as:66-91`): rows `BATTLE_ID[0]=[4,2,0,1,3]` (enemy back), `[1]=[9,7,5,6,8]` (enemy front), `[2]=[18,16,15,17,19]`
  (player front), `[3]=[13,11,10,12,14]` (player back). `isFrontPos` = rows 1 and 2 (`Battle.as:873-881`). Left->right target
  order `battleIdFromLeftToRight` (`BattleStage.as:688-721`).
- Pixel positions: `Localizer` markers in a 900x570 container (`BattleStage.as:284-556`). Enemy slots are `left/top`:
  0 (225,245) 1 (282,187) 2 (168,302) 3 (347,133.6) 4 (111,359) 5 (306,283) 6 (364,225) 7 (249,347) 8 (431,166) 9 (184,410).
  Player slots are `right/bottom` (height 10, width 0): x = 900-right, y = 570-bottom-10:
  10 (685,406) 11 (628,458) 12 (744,347) 13 (567,518) 14 (810,292) 15 (602,370) 16 (546,424) 17 (663,313) 18 (491,474)
  19 (728,259). Extra slots 100 (382,332.9) and 110 (531,347) are used for boss/special (`:412,544`). The player/enemy y values
  for right/bottom anchors are **inferred** from Flex constraint layout (no runtime capture). The point is the creature's feet
  (`toPoint` `:3061-3068`, `BattleCreatureView.setPosition` `:1125-1129`).
- Side: `leftSide` = `battlePos.x < 450` (`BattleCreatureView.as:134-141`) -> `leftSide == true` means ENEMY (all enemy x <= 431).
  `setHostGroupPos` maps slot n -> `battlePosN` (`BattleStage.as:1540-1551`).
- Facing (sneakFlag 0): `getDir`: battleId > 9 -> `_dirLower`, else `_dirUpper` (`:2365-2372`); `setHostGroupDir(0)`:
  lower=5 (players), upper=1 (enemies) (`:1720-1740`). `turnBack` re-applies this (`BattleCreatureView.as:205-215`). Sheet dir 1 = front/SW
  view, dir 5 = back/NE view (verified on `PC_MALE_100001`); `docs/assets-pipeline.md` compass is consistent. sneak 1: both 5; sneak -1: both 1
  (**inferred** from `:1720-1739` when `_arg_1 > 0` / `< 0`).
- Bars/labels (`BattleCreatureView.as:166-198,529-548`): `PropBar` 50x4 px, back 0x333333, border 0xDDDDDD (`comp/PropBar.as:16-27,74`);
  HP 0xFF0000, MP 0x3333AA (3355562), SP 0xFFFF00 (`GamePredef.as:809-811`); HP, MP, SP stacked, each bar 1 px overlap. Bar container
  at `y = sprite.headY - 10`, centred; floating number y = headY - 55; wait icon y = headY - 20. Enemy creature: MP/SP bars hidden, name colour white
  (`:1177-1189`), boss name red (`bossFlag==1` 0xFF0000, `==2` 0x00FF00 `:1208-1218`). Own character: all three bars; enemy characters: bars hidden.
  Name text centred above the sprite (`setName` `:217-244`).
- Damage numbers (`comp/ScrollText.as:92-120`): default red 0xFF0000, size 32, rises 20 px at 2 px/frame, bold;
  crit: size 50, step 3, rise 45. Heal: `"+N"` green 0x00FF00. MP loss/gain blue (`PROPERTY_COLOR_MP`). Non-numeric text size 18.
  Crit also shakes the stage `criticalEffectRoute=[3,-2,1]` (`BattleCreatureView.as:59,1070-1096`).

### 4.3 Animation actions (sheet labels `<dir>-<behavior>`, `_cg.play(dir + "-" + behavior)` `BattleCreatureView.as:569-625`)
Verified by rendering `PC_MALE_100001.png` frames and counting frames across 400 creature sheets (all share the layout):

| behavior | `AbstractGameRes` name | evidence | frames (player 5-x) |
|---|---|---|---|
| 0 | `BH_BREATH_SLOW` stand | `battleBehavior` `:347-350`; Go defend/idle=0 | 4-ish loop |
| 1 | `BH_RUN_FAST` | `:303-312` (speed `MOVE_SPEED_BATTLE`) | 4 |
| 2 | `BH_RUN_NORMAL` | `:313-322` | 4 |
| 3 | `BH_ATTACK` | Go bid 3; 3 frames | 3 |
| 4 | `BH_DEAD` (lying pose) | Go die=4; frame 5-4 renders a lying character | 1 |
| 5 | `BH_HURT` (flinch) | Go hurt=5; frame 5-5 renders a flinch | 1 |
| 6 | `BH_DEFENCE` (crouch) | Go "defended"=6; frame 5-6 renders a guard | 1 |
| 7 | `BH_MAGIC` | Go skill=7; 3 frames | 3 |

**This corrects `docs/assets-pipeline.md:32`** (which says `4 HURT, 5 DEAD`). Behaviors not drawn on the sheet (pure movement/logic):
`BH_BACK` 10080, `BH_TURNBACK` 10100, `BH_TURNTO` 10110, `BH_DIE` 10120 (monster: `fadeOut` 1 s then `visible=false`,
`CreatureView.as:9528-9536,10529-10533`), `BH_ESCAPE` 10130, `BH_DODGE` 10140, `BH_DODGE_COOL` 10150, `BH_CATCHED` 10160 (Go),
`BH_ESCAPED` 10170 (Go), `BH_RELIVE` 12000, `BH_POSITION` 14000, `BH_RETURN` 15000, `BH_SUMMON` 16000, `BH_RETURNED` 17000,
`BH_SUMMONED` 18000, `BH_DEFENDED` 19000. Constants for 10140+ are in the client (`BattleCreatureView.as:46-54`); 10080-10130,
10160, 10170 are from Go only (**names in the client, numbers inferred from Go**). Unknown numeric: `BH_CHECKESC`, `BH_RUSH`, `BH_NOTHING`.

## 5. Turn UI

- Round start (`BattleStage.startNewRound` `:1188-1231`, entered by `firstRound` after `START_DELAY=2000` ms `:94,2901` and by `newRound`
  `:2959-2967` when playback ends): clears the cmd list (`Battle.battleClearCmd`), shows wait icons, shows `cTime` + `cPlayerCmd`, sets
  `cmdMode=true`. If the player is dead and a pet lives, auto `battleCmd(-1, DEFENCE, -1)`; if nothing alive, no UI.
  On battle open the centre banner shows "Bắt Đầu" (`BATTLESTAGE_S[2]`, `:2900`).
- Menu `PlayerCmdCanvas` (83x267, title "Nhân vật", `PlayerCmdCanvas.as:80-275`). Order and labels (`Language.as:3206-3216`):
  Tấn công, Phòng ngự, Kỹ năng, Bắt, Pet, Vị trí, Vật phẩm, Bỏ chạy, Auto. For M2 solo: Tấn công, Phòng ngự, Kỹ năng, Vật phẩm, Bỏ chạy
  matter; Bắt/Pet/Vị trí are pet features; Auto is a client-side loop (`Battle.battleAuto` `Battle.as:94-320`).
  Default `cmdState = ST_BATTLE_ATTACK (410)` with the attack button selected (`PlayerCmdCanvas.as:786-810`).
- Click handlers `doCmd` (`:513-574`): attack -> `cmdState=ST_BATTLE_ATTACK` then target picking (`btnClick` `:405-414`); defend ->
  `battleCmd(-1, -20, -1)`; escape -> confirm "Xác nhận bỏ chạy?" (`PLAYERCMDCANVAS_U[10]`, `:619-644`) then `battleCmd(-1, -30, 0)`; skill ->
  `cmdState=420` + `SkillManager.battleShow()`; item -> `cmdState=425` + bag `showItem()`.
- Target selection: click an enemy sprite (`BattleCreatureView.mouseDownHandler` `:794-857`, only while `cmdMode`); hover shows blue/red
  highlight (`:1687-1758`). `BattleTargetCanvas` (`MAIN_TARGET_SELECT`) is an extra target list (`BattleStage.showTargetCanvas` `:3019-3047`); optional.
  Attack validity (`checkAttackValid` `:885-910`): target must be an enemy; a back-row enemy with a living front neighbour is allowed only if the
  PLAYER is not "behind someone" (`currentRound` is the index of the command inside the batch, `Battle.as:348-351`, so it is 1 for the first/only solo
  command). For a solo player every living enemy is valid (**inferred**: solo player has no vertical neighbour).
- Command object (`Battle.battleCmd` `:1105-1156`): `{tid:Number, action:int, id:Number, level:int}` pushed to `_cmdAry`; defaults
  `id=-1, level=-1`. Actions (`GamePredef.as:963-973`): ATTACK -10, DEFENCE -20, ESCAPE -30, TIMEOUT -40, SKILL -50, ITEM -60, CATCH -70,
  POSITION -80, RETURN -90, PET -100, AUTO -110. Concrete calls:

| command | `tid` | `action` | `id` | `level` | source |
|---|---|---|---|---|---|
| attack | target `battleId` | -10 | 0 | -1 | `BattleCreatureView.as:816` |
| defend | -1 | -20 | -1 | -1 | `PlayerCmdCanvas.as:531` |
| escape | -1 | -30 | 0 | -1 | `:546` |
| skill (enemy target) | target `battleId` | -50 | skill id | skill level | `BattleCreatureView.as:823` |
| skill self (`targetType` 2) | own `battleId` | -50 | skill id | skill level | `SkillManager.as:381` |
| item | target `battleId` (own slot for self-use) | -60 | bag slot id | -1 | `BattleCreatureView.as:834`, slot object from `Core.useItem` `Core.as:1626-1650` |
| timeout | -1 | -40 | -1 | -1 | `TimeCountCanvas.as:98-109` |

- Sending: `Battle.battleCmd` -> when `_cmdAry.length >= 2` or no pet: `battleSendCmd` (`:883-906`) hides menus/timer, banner "Đang chờ..."
  (`BATTLE_S[0]`, `Language.as:2253`), `cmdState=ST_BATTLE_WAIT (440)`; enforces `BATTLE_SEND_DELAY=4000` ms since the last `newSeq()` (called when playback of the previous
  round STARTS, `Battle.as:624-627`, `BattleStage.as:1135-1150`); `battleOnStart` backdates `_newRoundTime` so round 1 can send at once (`:1173`).
  Wire call: `_core.remote.battleUpdateCmd(_cmdAry)` -> **one array argument** `[{tid,action,id,level}, ...]` (`:845-851`). Solo: array length 1.
  `battleCmd` with `AUTO` re-sends `_lastCmd` (`:1120-1125`).
- Timer: `TimeCountCanvas` (`TIME_MAX=25` s, `:51,117-124`), label 75 px yellow, turns red 85 px at 9 s left (`:136-148`), at 0 sends the TIMEOUT command (also a
  second one if a pet is alive, `:98-109`). Position: horizontalCenter 15, bottom 318 (`BattleStage.as:676-681`). Hidden while waiting.
- Strings: see section 9.

## 6. Playback

### 6.1 Entry and pacing
- Entry `BattleStage.startSequence(actionGroups: Array)` (`:1117-1152`): hides cmd UI, `isRoundPlayFinish=false`, stores `_battleSeq`, `nextActionRound()`, `newSeq()`.
- `nextActionRound` (`:830-891`): a group is `Array<Action>`; `_actionCount=group.length`; all actions of a group start together
  (`execBehavior` each); every behavior end (`_sprite.callBack = nextActionRound`, `BattleCreatureView.as:544`, or explicit `behaviorEnd()`) decrements the count; at 0 the next
  group starts. Quirk: when `_currentAction.delay > 0` (the LAST action of the group, `:875`), the first completion defers by `delay` ms (`setTimeout`, `:837-842`) and nulls
  `_currentAction`. Empty/null entries are skipped (`:880-884`). When the queue is empty: `isRoundPlayFinish=true`, `checkEnd()` -> `newRound()` (`:1611-1619`, `2959-2967`).
  **Consequence: every action in a group must reach a behavior end** or the playback stalls (no timeout exists).
- Action object keys (`execBehavior` `:899-997`): `sid` (actor slot = `battleId`), `tid` (target slot), `bid` (behavior id), `sSObj` (state applied to the actor view), `tSObj`
  (applied to the target view), `delay` (ms), `end`, `type`, `result`, `title`, plus for summon `pet`/`creList`/`type`. `cList[sid]`/`cList[tid]` are **slot-indexed views**; `tid=-1` -> no view.
  Order per action: `sView.battleState(sSObj, tView)` -> `sView.battleBehavior(bid, tView)` -> `tView.battleState(tSObj, sView)` -> `globalBehavior` (`:977-996`).
  A missing `sView` shows `sSObj.skill` and advances immediately (`:984-991`).
- Special actions: `end:true` (6.3); `sid == 9999999999` loads a new wave (`sSObj` = creature list, optional `title` split on `|`, 1.5 s per line, max 10 s,
  `:946-975`); `bid 14000` swaps two views (`:2127-2129`); `bid 16000 type 0/1/2` adds pet/creature views (`:2130-2146`). Buff keys on the own actor's `sSObj`
  (`buffAdd/buffDel/buffColDel/buffClear`) update `cBuff` (`:2162-2193`). Wave/summon/pet are out of M2.

### 6.2 State object keys (`BattleCreatureView.battleState` `:1271-1581`; names in `GamePredef.as:266-307`)
All values are Numbers unless noted. Iteration order does not matter (only `buffDel` is processed first `:1306-1319`).
- `hHp`: **new HP after the hit** (not damage). Popup text `round(oldHp - hHp)` (red, crit variant if `cri`); bar set to `hHp`; also writes `gameObject.currentHp` (this is what makes
  `player.currentHp` reach 0 for the revive check) (`:1360-1371`). Overkill: send unclamped `hHp` to get the right popup (Go note); the bar clamps at 0 (`PropBar.as:97-106`).
- `rHp` new HP after heal (popup `+delta`, green) `:1388-1407`; `rHpMax` new max `:1570`; `rMp` `:1417`; `rSp` `:1384`; `hMp` `:1372`; `hSp` `:1356`; `hSh` (`{sid,hp}` shared damage) `:1466`.
- `uHp/uMp/uSp` resource cost: new absolute value, no popup (`:1486-1513`). **Skill MP cost reaches the bar through `uMp` on the caster.**
- `rtHp/rtMp/rtSp` heal applied to the target view (in `sSObj`) `:1433-1465`; `reborn` `:1408`.
- `cri` (truthy) -> big popup + stage shake (`:1577-1580`). `status` (string, or `{text,color,size,speed,range}`) free popup `:1535`; `say` bubble `:1545`; `hint` pet loyalty `:1560`; `expBattle` number -> green popup "<n>Chiến tích" (`BATTLECREATUREVIEW_S[3]`) `:1557`.
- `skill` (string): banner via `BattleStage.showSkill` -> `SkillCanvas.flash` (1 s, `:1344-1349`, `SkillCanvas.as:209-223`); the name must be on the actor's opening action.
- Effects (all numeric resource codes, `> 0` and `CreatureView.LOAD_EFFECT`): `frontEff` on the view `CreatureView.as:9336`, `attackEff` `:10766`, `skillEff` `:9630`; `bullet` flies from
  actor to target at `MOVE_SPEED_BATTLE` (needs `tView`, `:9375-9405`); `gfe`/`gbe` stage-wide front/back effect (`BattleStage.as:1948-1962`). `buffEff`/`backEff` (GamePredef) have NO handler in `battleState`.
  `battleState(tSObj)` runs on the target, so a hit effect must be in `tSObj` (Go note). Setting `interfaceData.he` disables loading (`LOAD_EFFECT`).
- Effect code decoding: `ResManager.getResUrl(code)` (not decompiled) = same algorithm as `@mc/shared` `resPath`. Example `2080130010008` -> `resource/effect/EFF_PLAYER_010008.swf`.
  **That file is not in the local cache** (`server/resmap.json` has 106 `resource/effect/` files, `EFF_PLAYER_100003..106011`; `client/public/sheets/effect` has 100): the Go default hit effect cannot be rendered; skip silently if the sheet is missing.

### 6.3 Behavior timing
- Client-driven (animation/move completion): ATTACK(3)/MAGIC(7)/HURT(5)/DEAD(4)/DEFENCE(6) end when the sheet label finishes; RUN(1/2): moves to within `VALID_DIS_BATTLE_CLOSETO=60` px of the target
  at `MOVE_SPEED_BATTLE = int(50*28/24) = 58` px/frame (24 fps; `CreatureView.as:61`, `GamePredef.as:1489,1974-1975`), else ends at once; BACK(10080): walks to the slot at the same speed
  (ends at once when within `VALID_DIS_BATTLE_BACK=10` px, `BattleCreatureView.as:1602-1613`); TURNBACK(10100) plays stand, faces the side default, ends at once; TURNTO(10110) faces the target, ends at once;
  DIE(10120) starts a 1 s fade and ends at once; ESCAPE(10130) walks 30 px away at speed 3 (`getEscPoint` `:495-502`, `CreatureView.as:71`); ESCAPED(10170) fades; RELIVE(12000) fade 0.8->0.4 800 ms; DEFENDED(19000) moves 30 px away.
  Speeds: normal 10, rush 46, position swap 15 (`CreatureView.as:69-71,126-127`).
- Server `delay` ms values (Go, not client-verified): Move 300, Attack 500/400, Die 800/200, Back 0/300, TurnBack 100/300 (`battle.go:330-360`, `battle-combat.md:19`).
- Standard melee sequence (Go): TurnTo -> Run(1) -> Attack(3, tSObj `hHp`/`cri`/`attackEff`) -> Hurt(5, sid=victim) -> [Die(4 player / 10120 monster)] -> Back(10080) -> TurnBack(10100). Magic: Magic(7) with `sSObj.skill/uMp/frontEff/skillEff/bullet`, target `tSObj.hHp`, then TurnBack.

### 6.4 Completion and next round
- Queue empty -> `newRound()` (`:2959-2967`): `cleanView`, `checkSelf` (`player.currentHp <= 0` -> `_playerAlive=false`), `startNewRound`, `turnBack` all views, `Battle.newRound()` (`_sending=false`).
- The server does NOT get a "playback done" call between rounds; it only sees the next `battleUpdateCmd`. `battlePlayEnd` is sent once, at the `end` action.

## 7. End of battle

### 7.1 `end` action
- Last group carries `{end:true, type, result}` (`execBehavior` `:910-945`). Branches: (a) `type` truthy AND `result == 1` -> `StarBattleReport.showResult(close)` (a star-rating window for star instances,
  `StarBattleReport.as:772-777`: it sends `battlePlayEnd` WITH a Responder expecting `{r, s:{score,time,die,id,level}}` and shows stars/time/deaths, close -> `watchOnEnd`); (b) otherwise `core.state=NORMAL`,
  `player.inBattle=false`, `battlePlayEnd()` (no Responder) and `Battle.battleOnEnd()`.
  **Binding:** the legacy client has NO exp/money/item "battle report" window for normal PvE. The Go note that `result:1` "shows the battle report" means the star window. For M2 send `{end:true}` WITHOUT
  `type`/`result` (or `result` != 1) to avoid the star window; rewards are shown through ordinary pushes (below). Whether the original server sent `type:1,result:1` on a normal win is **unknown / needs live capture**.
- `checkEndHandler` (`:1918-1941`) is a legacy remote-check path (`BATTLE_WIN=1`, `BATTLE_LOSE=2`, `BATTLE_NOT_END=-1`, `GamePredef.as:976-978`); no caller in the decompile.

### 7.2 `battleOnEnd` (`Battle.as:755-803`)
Clears `battleFieldId`; stores `lastHitNpc`; `core.state=NORMAL`; `BattleStage.endBattle()` = `endBattleStart()` + `endBattleHandler()`:
`endBattleStart` (`BattleStage.as:1553-1609`): hide the stage, `playNormal` music; **if `player.currentHp <= 0` -> `remote.call("reliveSwitch", Responder(onReliveSwitch))`** (`:1592-1595`); re-shows user bar; `useBloodBag()` if any blood-bag stock (`:1605-1608`).
`endBattleHandler` = `clearBattleStage` (destroys views, restores `Charactor.view=normalView`, `inBattle=false`, `:1423-1472`) + `showResult` (`:2441-2474`: sysBlue "Nhận/Mất {n} chiến tích" `BATTLESTAGE_S[5/6]`, "Nhận/Mất {n} danh vọng" `[7/8]`, only if `expBattle`/`rep` set (PvP fields, always 0 for M2)).
Then `restoreUI` (`Battle.as:648-753`) and `walkable=true` if alive and (not grouped or leader) (`:783-793`). HUD hidden at start (`Battle.hideUI` `:973-999`): target, self, pet, group, minimap, sys buttons, award warn, `STAGE_MAIN`,
all panels, quest guide, activity, long-buff, user shade; **chat is not hidden**. `battleOnStart` also sets `ST_CORE_BATTLE=2`, pauses the walking view, `walkable=false` (`:1162-1167`).

### 7.3 Loot / exp / money / quest-kill
- Nothing about rewards is read from the battle payload. They arrive as ordinary pushes after `battlePlayEnd` (Go: `battle-combat.md:63`; Go `EndBattle` `internal/presentation/rtmp/handlers/combat/battle.go:274-420`): `onUPP`, `onAddMoney`,
  `onPlayerLevelUp`, `onAddItem`/`onAddCharactorSlot`, `onBlueMsg`. Client strings tied to those pushes live in the aborted `CallBack` (`CALLBACK_S[16]` "Nhận {num} điểm kinh nghiệm", `[53]` level-up, `[10]` "Nhận ", `[42-45]` "Nhận: ";
  `Language.as:3001-3030`); exact formatting **needs a live capture**. H5 already has `onUPP/onAddMoney/onPlayerLevelUp/onAddItem/onBlueMsg` (`docs/memory/inventory.md`, `quest.md`).
- Kill-quest progress: client consumers are `QuestManager.onAddChaQuest` (`QuestManager.as:528-569`) and `QuestGuide.creatureKill(creatureId, count)` (`QuestGuide.as:673-714`, caller is in the aborted `CallBack`; Go push name `onUpdateQuestKill`
  `{creatureId: count}` is **inferred**). Data model: `quest.questKill = [{cid, creatureId, num}]` where **`num` is the REMAINING kills**; display `(required - num)/required`, `num <= 0` -> " (Hoàn thành)" (`QUESTCANVAS_S[4]`); label "Tiêu diệt " (`QUESTCANVAS_S[5]`)
  + creature link; name = `quest.pos.name` if present else `require[].creature.name` (`QuestGuide.as:362-394`, `QuestCanvas.as:1089-1120`). If `questKill` is absent the client builds it from `require` rows with `kind == 2` (`QUEST_REQUIRE_CREATUR`, `GamePredef.as:343`) using `num = required`
  (`QuestManager.as:550-567`). `creatureKill` only decrements locally and refreshes; the authoritative update is a fresh `onAddChaQuest`.
- H5 delta: `ChaQuest`/`QuestRequire` (`protocol.ts:244-295`) lack `questKill` and `require[].creature {id,name}`; `QuestState` becomes 104 when all kills are done (NPC state via `onSetNpcState`).

### 7.4 Death and revive
- Trigger: only at battle end (7.2) when `player.currentHp <= 0`; `player.currentHp` is updated by `hHp` during playback. Also at login/refresh `Player.checkWalkable` (`Player.as:2447-2480`): dead without "Hình Nhân" (item 721, `ItemConfig.as:78`)
  -> OK `reliveUseItem()` / Cancel `toSafe()` with `PLAYER_S[0]`; `walkable=false`.
- `reliveSwitch` (no args) returns int via Responder -> `onReliveSwitch(result)` (`BattleStage.as:1974-2113`): 0 = nothing; map 78 = nothing; 1 = normal dialog; 2 = free dialog (nothing on map 73); 3 = "bb" gold dialog.
  - Dialog 1/2: `Alert OK|CANCEL`, cancel label "Về" (`BATTLESTAGE_S[9]`), text `BATTLESTAGE_S[1]` (normal) or `[11]` (free), red suffix `BATTLESTAGE_S[10]`, 20 s countdown (`resTime=20`, `onTimer` `:1490-1528`), at 0 the Cancel button fires. If `currentHp > 0` already, just `walkable=true`.
    OK: free -> `freeRelive(1)`; normal -> if bag has no item 721 -> second Alert YES/NO `BATTLESTAGE_S[15]` (20 s; YES `reliveUseItem()`, NO `toSafe()`), else `reliveUseItem()`. Cancel: free -> `freeRelive(2)`; normal -> `toSafe()` (throttle 1100 ms, `RPCConfig.as:20`).
  - Dialog 3 (world-boss map): 30 s `Timer`, price `bbGold = int(bbTime/5)+1` (starts 6), text `BATTLESTAGE_S[23]`; YES: if `player.gold < bbGold` -> Alert "金子不足" (hard-coded Chinese) else `bbGoldRelive(bbGold)`; timeout -> `bbNormalRelive()` (`:1990-2036`). Out of M2.
- None of these RPCs has a Responder: the effect (HP restore, teleport) must come from pushes (`onUPP`, scene change) — **exact push set needs live capture** (Go: `onUPP`, and `toSafe` restores HP).
- Item 721 auto-purchase "18 vàng" is only text (server-side).

## 8. Skills in battle

- Skill list: `_core.player.skillList` (entries `{sid, position, kind}`, `SkillManager.as:1160-1229`), static data `GameData.d[TBL_SKILL]` (id 52). Source push is in the aborted `CallBack` (`onSkillUpdate` per Go notes); the H5 server has no skills yet.
- Battle skill menu = `SkillManager` window (372x358) via `battleShow()` (`:1446`): tabs by `useEnv` (0 "Chủ động" shown first, `SKILLMANAGER_U[0]`). Clicking a slot (`useSkill` `:358-410`): `Core.checkSkillRequire(skill, true)`
  (`Core.as:1100-1202`) then `core.skill = skillData` and either send immediately (`targetType 2` self-player `:379-384`; `3` self-pet) or `showSelect()` to pick a target (`BattleCreatureView.mouseDownHandler` `:818-826`, validity `checkSkillValid` `:627-726`).
- `checkSkillRequire`: `useHp`/`useMp`/`useSp`: value `>0 && <1` = fraction of `property.finalHp/finalMp/finalSp`, `>=1` absolute; failing -> midNote "MP không đủ, không thể sử dụng kỹ năng [name] " (`CORE_S[6]`+name+`CORE_S[7]`), "HP không đủ ..." (`CORE_S[4..5]`), "Điểm nộ khí không đủ ..." (`CORE_S[10]`) (`Language.as:3147-3157`). The client trusts `player.currentMp` (kept fresh by `uMp`/`onUPP`).
- MP cost display: tooltip `TipSkill.as:311-345`: "MP cần: N" or "N%" (`TIPSKILL_S[3]`), SP "Tiêu hao SP: " (`[15]`), red when `useMp > currentMp`. Name/level/type/target strings `TIPSKILL_S[0-4]` (`Language.as:679-684`).
- `targetType` (`Battle.as:27-38`): 1 SELF, 2 SELF_PLAYER, 3 SELF_PET, 4 ENEMY, 5 ENEMY_PLAYER, 6 ENEMY_CRE, 7 ENEMY_NOBOSS, 8 TEAM, 9 TEAM_PLAYER, 10 TEAM_PET, 11 ALL, 12 PLAYER (validity per target in `checkSkillValid`; side test is `leftSide`).
  `type` (`GamePredef.as:1463-1473`): 1 CLOSE (also requires `checkAttackValid`), 2 REMOTE, 3 MAGIC, 4 MAGIC_BULLET, 5 MAGIC_RECOVER, 6 STATE_ADD, 7 STATE_DEL, 8 FUNC_HURT, 9 FUNC_RECOVER, 10 DEFENDER, 11 OTHER. Area `areaAttack` 1 V, 2 H, 3 C, 4 R with `targetNum`
  (`Battle.as:39-42,1177-1210`; highlight only via `showSkillArea`; the server decides actual targets). Skill with `type 1` closes in (RUN) in Go playback.
- Effect codes (`frontEff/attackEff/skillEff/bullet`) are server-provided per action; the seed `data_tbl_skill` has NO effect columns (`id, area_attack, attack_num, buff_*, code_name, icon_code, target_*, type, use_env, use_hp/mp/sp ...`). Skill icon: `icon_code` (e.g. `4140200100362`).
- Item in battle: `Core.useItem` (`Core.as:1626-1650`) sets `core.item = bag slot` and `cmdState=425`; `checkItemValid` (`BattleCreatureView.as:942-980`): `reqLevel` <= level, template `skillId` target check, and `useType` 1 = only first command, 2 = only second (pet) command, 4 = never in battle (**inferred** meaning).

## 9. Language strings (Vietnamese exact)

| Constant | Value | Where |
|---|---|---|
| `PLAYERCMDCANVAS_U[0..10]` | Kỹ năng / Phòng ngự / Vật phẩm / Pet / Auto / Tấn công / Bỏ chạy / Vị trí / Bắt / Nhân vật / Xác nhận bỏ chạy? | command menu (`Language.as:3206-3216`) |
| `BATTLESTAGE_S[2]` | Bắt Đầu | banner at start (`BattleStage.as:2900`) |
| `BATTLESTAGE_S[3]` / `[4]` | Bị đánh lén / Đánh lén | sneak banner (`:2977,2983`) |
| `BATTLE_S[0]` | Đang chờ... | after sending (`Battle.as:893`) |
| `BATTLESTAGE_S[0]` / `[17]` | Chọn xem / Thông tin | watch/info button (`:2782`) |
| `BATTLESTAGE_S[1]` | Bạn đã tử vong\nNhấn OK để sử dụng Hình Nhân trong túi đồ và tránh hình phạt khi tử vong (nếu trong túi không có Hình nhân thì sẽ tự động dùng 18 vàng để mua).\nNhấn Về sẽ chuyển đến khu vực an toàn, đồng thời mất 20% độ bền trang bị. | revive dialog normal |
| `BATTLESTAGE_S[9]` / `[10]` | Về / {resTime} sau sẽ về thành) (stray ")" is in the original) | cancel label / countdown |
| `BATTLESTAGE_S[11]` | Bạn đã tử vong\n Nhấn 'OK' để hồi sinh tại chỗ.\n Nhấn 'Về' để được chuyển về vị trí an toàn, không mất độ bền trang bị. | free revive |
| `BATTLESTAGE_S[15]` | Trong túi không có Hình Nhân，xác nhận mua Hình Nhân giá 18 vàng để miễn hình phạt tử vong？ | no item 721 |
| `BATTLESTAGE_S[23]` | Bạn đã tử vong\nXác nhận dùng {gold} Vàng lập tức hồi sinh.\nNhấp chọn 'Hủy' thì sau {time} giây sẽ tự chuyển về thành | bb dialog |
| `BATTLESTAGE_S[5..8]` | Nhận/Mất {expBattle} chiến tích; Nhận/Mất {rep} danh vọng | PvP only |
| `BATTLESTAGE_S[12]` | Miễn tử | `reborn` popup |
| `PLAYER_S[0]` | Bạn đã tử vong\nNhấn OK để mua và sử dụng Hình Nhân để tránh hình phạt tử vong.\nNhấn Hủy để chuyển đến khu vực an toàn và mất 20% độ bền trang bị. | dead at login (`Language.as:2265`) |
| `NPCVIEW_S[3..5]` | Không thấy ta đang bận sao? / Tên này xem ra rất khó đối phó, xác nhận tấn công? / Tên này xem ra chả mang theo thứ gì tốt cả, xác nhận tấn công? | NPC fight confirm |
| `CORE_S[4..7,10]` | HP không đủ, không thể sử dụng kỹ năng [ ... MP không đủ ... Điểm nộ khí không đủ, không thể dùng kỹ năng [{skillName}] | skill gating |
| `QUESTCANVAS_S[4,5]` | " (Hoàn thành)" / "Tiêu diệt " | kill-quest line |
| `TIPSKILL_S[3,15]` | MP cần: / Tiêu hao SP: | skill tooltip |
| `AUTOBATTLECANVA_U[4..6]` | MP của nhân vật không đủ,hãy bổ sung! / HP ... / HP và MP ... | auto mode |

## 10. Proposed shared types (`packages/shared/src/protocol.ts`, names from Flash)

```ts
export const BattleAction = {
  ATTACK: -10, DEFENCE: -20, ESCAPE: -30, TIMEOUT: -40, SKILL: -50, ITEM: -60,
  CATCH: -70, POSITION: -80, RETURN: -90, PET: -100, AUTO: -110,
} as const;
export const BattleBehavior = {
  STAND: 0, RUN_FAST: 1, RUN_NORMAL: 2, ATTACK: 3, DEAD: 4, HURT: 5, DEFENCE: 6, MAGIC: 7,
  BACK: 10080, TURNBACK: 10100, TURNTO: 10110, DIE: 10120, ESCAPE: 10130, DODGE: 10140,
  DODGE_COOL: 10150, CATCHED: 10160, ESCAPED: 10170, RELIVE: 12000,
} as const;
export const BattleParticipantType = { CHARACTER: 2, CREATURE: 12, PET: 39 } as const;

export interface BattleCommand { tid: number; action: number; id: number; level: number }
// RPC battleUpdateCmd(cmds: BattleCommand[]) -> null ; battlePlayEnd() -> null ; battleEscaped()

export interface BattleParticipant {
  id: number; type: number; battleId: number; name: string; level: number;
  hp: number; hpMax: number; mp: number; mpMax: number; sp: number; spMax: number;
  resCode?: string;            // creature sprite code (string per project rule)
  bossFlag?: number; withCloud?: number; c?: number;
}
export interface BattleStart {  // push onBattleStart
  battleFieldId: string; nid?: number; cList: BattleParticipant[];
  bossFlag?: number; sneakFlag: number; guest?: boolean; airBattle?: boolean;
}
export interface BattleStateObj {  // sSObj / tSObj
  hHp?: number; rHp?: number; rHpMax?: number; hMp?: number; rMp?: number; uHp?: number; uMp?: number; uSp?: number;
  rtHp?: number; rtMp?: number; cri?: number; skill?: string; frontEff?: string; attackEff?: string;
  skillEff?: string; bullet?: string; gfe?: string; gbe?: string; status?: string | { text: string; color: number; size: number; speed: number; range: number };
  say?: string; buffAdd?: { id: number }; buffDel?: number | number[]; buffClear?: number; reborn?: number;
}
export interface BattleActionStep {
  sid: number; tid: number; bid: number; sSObj?: BattleStateObj; tSObj?: BattleStateObj; delay?: number;
  end?: boolean; type?: number; result?: number;
}
export type BattlePlayList = BattleActionStep[][];   // push onBattlePlayList -> startSequence
// revive RPCs: reliveSwitch() -> 0|1|2|3 ; freeRelive(1|2) ; reliveUseItem() ; toSafe() ; bbGoldRelive(gold) ; bbNormalRelive()
// RPCs: cbom(x, y) ; hitNpc(npcId) ; clickBoss(npcId) ; clickNpc(npcId)
```
Resource codes (`frontEff`, ... `resCode`) as strings per CLAUDE.md. Ownership: server `server/src/modules/combat/` (`combat.rpc.ts`: `cbom, hitNpc, clickBoss, battleUpdateCmd, battlePlayEnd, battleEscaped, reliveSwitch, freeRelive, reliveUseItem, bbGoldRelive, bbNormalRelive, toSafe`; `combat.service.ts` round processing; pushes `onSetCharState, onBattleStart, onBattlePlayList`);
`clickNpc` quest-battle bridge stays in `npc`. Client: `client/src/game/BattleController.ts` (net + state machine), `client/src/game/BattleStage.ts` (Pixi stage, slot table, playback), `client/src/ui/battleMenu.ts`, `battleTimer.ts`, `reviveDialog.ts` (DOM).

## 11. Open questions / needs live capture

1. Real `onBattleStart` / `onBattlePlayList` / `onEndBattle` names and exact payload (CallBack is a stub); `onSetCharState` requirement for solo.
2. What `{end,type,result}` the original sent on a normal PvE win/lose/flee; failed-flee playback; whether `result` ever matters outside the star path.
3. `BH_CHECKESC`, `BH_RUSH`, `BH_NOTHING` numeric values (AbstractGameRes not decompiled); numeric `delay` values are Go-derived.
4. Exact pushes after `freeRelive/reliveUseItem/toSafe/bbNormalRelive` (all fire-and-forget) and the `reliveSwitch` result rules (when 1 vs 2).
5. Where `NPCView.onEnter` is attached (walking-monster-only?), and whether `hitNpc` is also used for fixed boss NPCs.
6. Player command panel position (`ViewManager.createUI` not read), `BattleTargetCanvas` layout, skill-picker "battle only" filtering (tab `useEnv`), and the `skillList` push shape.
7. Facing 1/5 vs the visual map (looks inconsistent with a top-left vs bottom-right layout; verify in the H5 render, flip if needed).
8. Missing hit-effect assets (`EFF_PLAYER_010008` and any `0xxxxx` ids) — decide to skip or substitute.
9. Sheet row `4/5/6` meaning was verified on one player sheet and by frame counts on 400 creature sheets; spot-check a monster visually.
10. Item `id` for the ITEM command = bag slot `id` (same slot id `useItem` uses, `Core.as:1643`); `useType` meanings inferred.
