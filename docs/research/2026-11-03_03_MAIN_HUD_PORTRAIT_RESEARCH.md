# Main HUD: PortraitCanvas / PetCanvas / TargetCanvas (Flash client research)

Legacy root: `E:\mcgame\docs\client` (paths below relative to it). All numbers come from the MXML-decompiled
`_documentDescriptor_` blocks (explicit) unless marked **inferred**. Units are Flash pixels. Flex `Canvas` children use
absolute x/y unless a `stylesFactory` sets `right/bottom/horizontalCenter`.

## 1. Summary
Top-left HUD: player portrait (avatar, level, name, HP/MP/SP/EXP bars, HP/MP potion-reserve buttons, Up/VIP buttons),
pet portrait under it (avatar, level, name, HP/MP, item button, fairy toggle), buff bar below that, and a transient
radial context menu (TargetCanvas) shown on click of another player in the scene.

## 2. Key files
- `view/view/MainLayer.as` - creates all HUD widgets from `UIPropVO` list; per-widget anchoring (`style` dict).
- `view/view/comp/UIBase.as:81-89` - instantiates `cls`, `addChild`, then `setStyle(k, v)` for each `style` key (so left/top/right/bottom are Flex constraints).
- `view/view/compMain/PortraitCanvas.as`, `PetCanvas.as`, `TargetCanvas.as` - the three widgets.
- `view/view/compMain/LongBuffCanvas.as` - buff bar (MainLayer "增益栏", `ViewManager.MAIN_LONGBUFF`).
- `view/view/comp/Property.as` (extends Flex `ProgressBar`, `mode=manual`, `labelPlacement=center`, `label=""`, default font size 10 normal; `setProgress(value,max)`; so **no text is drawn on bars, only tooltip**).
- `view/view/comp/RoundedLabel.as` (Flex `Label`, default color 0xFFFFFF, filters `GamePredef.FILTER_SHADOW_TEXT`, `FILTER_SHADOW_TEXT2` = text drop shadow/outline).
- `vo/PersonInfoVO.as` (infoVO), `view/ViewManager.as:74,89,94` ids: `MAIN_SELF=120`, `MAIN_TARGET=200`, `MAIN_PET=205`.

## 3. Placement in MainLayer (anchoring)
MainLayer is a full-stage container (`UIBase`); each widget gets Flex constraints, so Flash re-lays-out on stage resize automatically.

| Widget (UIPropVO name) | line | style | initVisible | Notes |
|---|---|---|---|---|
| PortraitCanvas "角色头像" (vid MAIN_SELF) | MainLayer.as:1090-1098, 340-360 | `left:2, top:5` | true | anchored top-left, never moves on resize |
| PetCanvas "宠物头像" (MAIN_PET) | 271-285, 362-385 | `left:2, top:67` | (binding VO4.initVisible, not read; see Open Q) | top-left; 67 = 5 + 57 (portrait h) + 5 gap |
| LongBuffCanvas "增益栏" (MAIN_LONGBUFF) | 1105-1112, 436 | `left:2, top:115` | n/a | buff bar; 115 = 67 + 46 (pet h) + 2; width 200 (LongBuffCanvas.as:78); icons 16x16 (:94-95) |
| TargetCanvas "目标头像" (MAIN_TARGET) | 1039-1047, 604-625 | `{}` (no anchor) | false | positioned at runtime, see 6 |
Other left-column neighbours: "系统信息" `left:2 top:280` (VO5), "转向/行动力" etc. not in scope.

## 4. PortraitCanvas (192x57 body)
Root: `Canvas` (scroll policies off, `cacheAsBitmap=true`). Child 1 = `Canvas` 192x57, `styleName="CanvasCharacterPortrait"` (background skin, see 7). Buttons `btnLvUp`/`vip` are siblings outside the 192 body.

| id | type | x | y | w | h | styleName / notes |
|---|---|---|---|---|---|---|
| selfHead | Image (hand cursor, buttonMode) | 5 | 5 | 49 | 47 | avatar; click -> opens CharactorPanel |
| selfHeadPMFlag | Image | 5 | 1 | 27 | 24 | VIP/"PM" diamond badge, hidden by default; over avatar top-left |
| labelExp | RoundedLabel (center) | 62 | 1 | 22 | auto | **level number** (despite name); default text "99"; bound `htmlText = infoVO.level` |
| _RoundedLabel1 | RoundedLabel (center) | 84 | 3 | 86 | auto | **character name** (`infoVO.charName`); click = refill HP+MP |
| hpBar | Property | 80 | 20 | 89 | 9 | `ProgressHp` |
| mpBar | Property | 80 | 30 | 89 | 9 | `ProgressMp` |
| spBar | Property | 80 | 40 | 105 | 6 | `ProgressSp` |
| expBar | Property | 80 | 47 | 105 | 6 | `ProgressExp` |
| hpBtn | Button (cornerRadius 0) | 175 | 19 | 10 | 9 | style `BtnHp0/1/2` (HP potion reserve) |
| mpBtn | Button | 175 | 29 | 10 | 9 | style `BtnMp0/1/2` |
| _Button3 | Button, `right:4` inside body | right 4 -> x=192-4-w | 3 | skin | skin | `BtnUseItem` (use-item cursor) |
| btnLvUp (outside body) | BasicGlowButton | 198 | 0 | 46 | 22 | `BtnLevelUp`, label "Up", default visible only when exp full |
| vip (outside body) | BasicGlowButton | 198 | 30 | 46 | 22 | `BtnLevelUp`, label "VIP", visible true |

Z-order = descriptor order (bars, buttons, selfHead, flag, name, level, useItem). Total footprint incl. buttons ~244x57.

### Text formats / colors
- Bars show **no inline text**. Tooltips (bound, PortraitCanvas.as:845-870): `"HP: " + value + "/" + max`, `"MP: v/max"`, `"SP: v/max"` (e.g. `HP: 120/300`).
- Level label: plain level int; name: plain charName. Both white (RoundedLabel default 0xFFFFFF) with shadow filter, centered.
- Bar fill colors/fonts are in the compiled CSS styles `ProgressHp/Mp/Sp/Exp` (not in decompile) -> **unknown**; conventionally HP red, MP blue, SP/EXP yellow/green (**inferred**, verify against art).
- EXP tooltip on expBar and btnLvUp: `CHARACTORPANEL_S[34]` with `{exp}` = `player.expSkill`, `{next}` = `Math.round(basic.levelUpExp(level))` or `"-"` at `MAX_LEVEL`.

### Data feeding it (`set gameObj`, PortraitCanvas.as:694-781; invoked by `update()` with `_core.player`)
| UI | Source field |
|---|---|
| level | `player.level` |
| name | `player.name` |
| HP bar | `player.currentHp` / `player.property.finalHp` (fallback max = currentHp if `property` null) |
| MP bar | `currentMp` / `property.finalMp` |
| SP bar | `currentSp` / `property.finalSp` |
| EXP bar | `min(expSkill, maxExp)` / `basic.levelUpExp(level)` (field is `expSkill`, i.e. skill/exp pool) |
| avatar | `ResManager.getIconUrl(player.iconCode)` |
| PM badge | `player.pmLevel` > 0 -> `ResManager["PM_ZUAN"+pmLevel]` |
| potion reserve | `core.bloodBag[1]` (HP), `[2]` (MP), max `core.bagMax[1|2]` |
Refresh triggers: `Core.updatePlayerPortrait()` (Core.as:852), `Battle.as:333,593` (after battle/updateUI), `Core.as:432` `setHpMp()` on blood bag change, `Core.as:1616` `setLevelUpBtn()` on global setting `sjan`. I found **no direct `onUPP`/`onPlayerLevelUp` reference to PortraitCanvas** in `system/CallBack*.as` (grep `onUPP|onPlayerLevelUp` returned nothing); the push -> `player` object -> `update()` path is **inferred** to go through Core/DataManager property setters. The server must keep `player` fields (level, name, currentHp/Mp/Sp, property.finalHp/Mp/Sp, expSkill, iconCode, pmLevel, bloodBag/bagMax) fresh and the H5 HUD should re-render from them.

### Click handlers
- selfHead -> `view.changeVisible(PANEL_CHARACTOR)` (toggle character panel) + set "add points" style if unspent points.
- hpBar click / mpBar click / name label click -> `recoverFullHp(1,-1)` / `recoverFullMp(1,-1)` / both. Builds list `[{sid, priority}]` of HP/MP potion items in bag slots `SLOT_SID_BAG[0]+1..[7]` (tid->heal table HP: 1:300,4:600,2:600,110:1000,113:2000,321:3000,371:6000,1975:9000; MP: 158:300,125:600,126:1000,127:2000,322:3000,370:5000,1974:7000; priority = heal - binded, ascending) then **RPC `fullHpRecoverByItem(1, -1, list)` / `fullMpRecoverByItem(1, -1, list)`** (no Responder; args: target type 1=self, target id -1, sorted slot list). Blocked in maze maps templateId 2007/2008/2009 with `MAZE_INFO_PANEL_U[13]` "Trong Mê Trận không thể sử dụng" (HP path checks; MP path has no check).
- hpBtn -> `PANEL_BLOODADD.showPanel(1)`, mpBtn -> `showPanel(2)` (potion reserve panel).
- `_Button3` (BtnUseItem) -> use-item cursor on self (`ACTION_ITEM`, target `MOUSE_TARGET_CHA`), opens bag; ignored in battle and in maze.
- btnLvUp -> `levelUp()`: level>=MAX_LEVEL hide; level<20 -> `lvUp(level, null)` immediately; >=20 -> Alert `PORTRAITCANVAS_U[2]` "Xác nhận thăng cấp?" Yes/No, then needs delete-password (md5) via input panel `DELETE_BY_PASS[0]` / `PORTRAITCANVAS_U[0]`; **RPC `lvUp(level:int, md5pass:String|null)`** with `Responder(onLevelUp:Boolean)`. btnLvUp visible when `currentExp >= maxExp && level < MAX_LEVEL && level >= 20 && !GLOBAL_SETTING.sjan`; for level<20 level-up fires automatically (`levelUp()` is called directly from the set).
- vip -> `PANEL_PM.initPanelData(infoVO)` (PM/VIP panel).

### Strings (Language.as)
- `PORTRAITCANVAS_S[0]` (:2176) "Sinh Mệnh Hoàn tiện dụng \n Sau khi kết thúc chiến đấu sẽ tự phục hồi HP cho nhân vật \n Lượng trữ hiện tại: 0/1000000" (hpBtn when empty)
- `[1]` (:2177) "Sinh Mệnh Hoàn tiện dụng\nSau khi kết thúc chiến đấu sẽ tự phục hồi HP cho nhân vật\nLượng trữ hiện tại: " + bloodBag[1] + "/10000000"
- `[2]`/`[3]` same for "Pháp Lực Hoàn ... MP ..." (:2178-2179)
- `[4]` "Nhấp xem thông tin chi tiết" (selfHead tooltip), `[5]` "Vật phẩm nhân vật sử dụng" (BtnUseItem)
- `PORTRAITCANVAS_U[0]` "Up", `[1]` "Sức hành động", `[2]` "Xác nhận thăng cấp?", `[3]` "VIP" (:4230-4233)
- `CHARACTORPANEL_S[34]` (:1081) "Exp: {exp}\n Cấp kế: {next}\n Điểm kinh nghiệm không những có thể dùng để thăng cấp nhân vật mà còn có thể thăng cấp kỹ năng"
- Button style swap: reserve 0 -> `BtnHp0`/`BtnMp0`; 0<x<max -> `...1`; x == `bagMax[i]` -> `...2`.

## 5. PetCanvas (179x46 body, `SimpleCanvas` root)
Body `Canvas` 179x46 `styleName="CanvasPetPortrait"`. Inner `Canvas` 131x24 anchored `bottom:2,right:0` (so inner origin x=48, y=20 in body) holds the bars:

| id | x | y | w | h | notes |
|---|---|---|---|---|---|
| (inner canvas) | right 0 | bottom 2 | 131 | 24 | contains bars below, coords relative to it |
| hpBar | 19 | 2 | 89 | 9 | `ProgressHp`, Verdana 9 |
| mpBar | 19 | 12 | 89 | 9 | `ProgressMp`, Verdana 9 |
| hpBtn | right 7 | 2 | 10 | 9 | `BtnHp*` using `bloodBag[3]`/`bagMax[3]` |
| mpBtn | right 7 | 12 | 10 | 9 | `BtnMp*` using `bloodBag[4]`/`bagMax[4]` |
| showCanvas (avatar Image) | 4 | 4 | 38 | 38 | click -> toggle `PANEL_PETMANAGER` |
| _RoundedLabel1 (level) | 48 | 1 | 25 | auto | default "99", centered, `htmlText=_level` |
| _RoundedLabel2 (name) | 68.5 | 1 | 90 | 19 | default text "名字几个字", centered, `htmlText=_name`; click -> refill pet HP+MP |
| itemBtn | 160 | 3 | skin | skin | `BtnUseItem`; `mouseEnabled=false` when no pet |
| fairyTog (Image, outside body) | 175 | -5 | skin | skin | source `ResManager.FAIRY_PANEL_BUTTON`; visible only if `player.level >= 80` (PetCanvas.as:268); toggles `PANEL_FAIRY_MANAGER`; tooltip hardcoded "Mở/Ẩn bảng Tinh Linh" (descriptor) though `PETCANVAS_S[7]` = "Mở/Ẩn bảng Tiểu Tinh Linh" |
Note inner-canvas coordinates: bars appear at absolute (67, 22) and (67, 32) within body (**inferred**: 179-131 = 48, +19; 46-2-24 = 20, +2).

Data (`showPet(petData)`, PetCanvas.as:265-289; called from `PetManagerPanel.as:7240,7245,8336,8388`): avatar `ResManager.getIconUrl(petData.creatureData.iconCode)`; level `PetLogic.expToLv(petData.exp)`; name `petData.petName`; HP `int(currentHp)/int(property.finalHp)`; MP `int(currentMp)/int(property.finalMp)`. `showPet(null)` -> empty state: name "", level "", icon `ResManager.PET_DEFAULT_ICON`, bars 100/100, `itemBtn` disabled; widget stays visible when `Core.state == ST_NORMAL`. Hidden (`visible=false`) only in the non-null-but-falsy branch.
Tooltips: bars `"HP: v/max"`, `"MP: v/max"`; avatar `PETCANVAS_S[4]` "Nhấp xem thông tin chi tiết"; itemBtn `PETCANVAS_S[5]` "Vật phẩm pet sử dụng"; potion buttons `PETCANVAS_S[0..3]` (Language.as:2168-2171) "Sinh Mệnh Hoàn tiện dụng ... cho pet ..." / "Pháp Lực Hoàn ...".
Clicks: hpBtn `showBloodAdd(3)`, mpBtn `showBloodAdd(4)`; hpBar/mpBar/name -> `MAIN_SELF.recoverFullHp(2, battlePet.id)` / `recoverFullMp(2, battlePet.id)` -> RPC `fullHpRecoverByItem(2, petId, list)` / `fullMpRecoverByItem(2, petId, list)` (same list builder as player). itemBtn -> use-item cursor with `MOUSE_TARGET_PET`, `mousePetId = battlePet.id`, requires a selected pet in PetManagerPanel list.

## 6. TargetCanvas (89x83, transient radial menu around the clicked player)
Not a stat frame: it is a ring of 7 icon buttons plus 2 text buttons. Shown by `CharactorView.mouseDownHandler` (compGameStage/CharactorView.as:545-548): clicking a non-self character sets `core.targetPlayer` and calls `MAIN_TARGET.update()`. Hidden when `targetPlayer == null`, `view.actionState == ACTION_PK`, or `targetPlayer.npcFlag`. Positioned in `set visible(true)`: `x = stage.mouseX - width/2`, `y = stage.mouseY - height/2` (i.e. centered on the cursor; no anchoring). Hidden after any button click (`menuClickHandler` ends with `hide()`), in battle (`Battle.as:975`) and on stage click (`StageMain.as:657`).

| id | x | y | style | tooltip (Language TARGETCANVAS_S, :2211-2218) | action |
|---|---|---|---|---|---|
| btn1 | 19 | 57 | BtnTarget1 | [0] "Thông tin" | `PANEL_CHARACTORINFO.showChaInfo(target.id)` |
| btn2 | 2.9 | 35 | BtnTarget2 | [1] "Mời lập nhóm" | RPC `groupInvite(targetId)` |
| btn7 | 8.85 | 10 | BtnTarget7 | [2] "Xem chiến đấu" | RPC `startWatch(targetId)` |
| btn5 | 33.05 | 2 | BtnTarget5 | [3] "Kết bạn" | `core.addFriend(target.name)` |
| btn3 | 57.05 | 10 | BtnTarget3 | [4] "Chat mật" | `MAIN_SYS.wisperChat(target.name)` |
| btn4 | 64.1 | 35 | BtnTarget4 | [5] "Chat riêng" | `ChatPanelUtil.createChatPanel(target.id)` |
| btn6 | 45.9 | 57 | BtnTarget6 | [6] "Giao dịch" | `PANEL_TRADE.newTrade(id, name)` |
| btn8 | hCenter 0 | -30 | BtnNormalRed 40x19 | [7] "Nhấn nút này để mời vào nhóm"; label `TARGETCANVAS_U[0]` "Lập nhóm" | RPC `groupRequest(core.cid, targetId)`; visible only if `targetPlayer.inGroup == true && player.inGroup == false` and not in battle server |
| btn9 | hCenter 0 | -30 | BtnNormalRed 40x19 | label `TARGETCANVAS_U[1]` "Đánh bại" | RPC `assassinate(targetId)`; visible only when `battleServer.inBattleServer` and target `posMapId != 75`; then btn8 hidden |
`enableUI()` re-enables btn3, btn6 (disabled during battle via DISABLE_UI list in `logic/BattleServer.as:36`, **inferred**).
Note: there is **no HP/name frame** for the target in this class; no `TARGETCANVAS` name/level is displayed (`_name/_class/_level` private vars unused in descriptor).

## 7. Art / skins
- All look is Flex CSS styleNames (`CanvasCharacterPortrait`, `CanvasPetPortrait`, `ProgressHp/Mp/Sp/Exp`, `BtnHp0/1/2`, `BtnMp0/1/2`, `BtnUseItem`, `BtnLevelUp`, `BtnTarget1..7`, `BtnNormalRed`) compiled into the main client SWF; **the .css and skin classes are not in `docs/client`** (grep for these names only hits the three canvases + `TipBattle.as`).
- Dynamic images: `ResManager.getIconUrl(iconCode)` (avatar/pet icon), `ResManager.PM_ZUAN1..N`, `ResManager.FAIRY_PANEL_BUTTON`, `ResManager.PET_DEFAULT_ICON`, `ResManager.MOUSE_ACTION_IMG[]` - `ResManager`/`ResCacher` are **not decompiled** (also noted in `E:\mcgame\docs\memory\mount-system.md`).
- Avatar icons are normal resource-code assets under `frontend\s\res\` (md5-named, e.g. `icon/ui/UI_GLOBAL_xxxx.png`; decode via `@mc/shared` `iconPath`).
- Main client SWF: `E:\mcgame\frontend\s\6a41a5ba5c0006ab4e0c1321a2b05027` (16.8 MB; same name in `frontend\s\sv\`, plus `.orig`, `.en`). Header bytes are `BUS` (not `FWS/CWS/ZWS`), i.e. wrapped/obfuscated, so I could not grep skin symbol names in it (grep of `.orig` for `CanvasCharacterPortrait` = 0 hits). No separate `ui.swf`/skin swf/CSS found under `frontend\` (`find` for `*skin*`, `ui*.swf`, `*.css` outside `h5/` only hit launcher/dashboard CSS and `assets\skins` which holds unrelated Yasuo PNGs). Conclusion: HUD frame/bar/button art is **not available as standalone files**; it must be extracted from the main SWF (needs unwrapping BUS header - see `docs/memory/login-auth-flow.md` patch notes, `clientpatch` tool) or redrawn in CSS. Avatars and PM/fairy icons are available via the res cache (resource codes needed).

## 8. Proposed shared types / ownership
- No new RPC types needed for display; HUD binds to existing `PlayerData` (level, name, iconCode:string, currentHp/Mp/Sp, finalHp/Mp/Sp, expSkill, pmLevel) + `bloodBag/bagMax`.
- New RPCs to add later (names verbatim): `fullHpRecoverByItem(targetType:number, targetId:number, slots:{sid:number;priority:number}[])`, `fullMpRecoverByItem(...)`, `lvUp(level:number, md5pass:string|null) -> boolean`, `groupInvite(id)`, `groupRequest(cid, id)`, `startWatch(id)`, `assassinate(id)`.
- Client: `client/src/ui/hud/` (portrait.ts, pet.ts, target-menu.ts) as DOM overlays positioned `left:2px; top:5px`, pet `top:67px`, buffs `top:115px`; target menu at cursor minus (44.5, 41.5).

## 9. Open questions
1. Which server pushes (`onUPP`, level-up etc.) call `Core.updatePlayerPortrait()`: not found in `CallBack*.as`; likely indirect via player-object setters - needs grep in `object/Player.as`/`data/DataManager.as` if exact refresh timing matters.
2. Pet `initVisible` binding was not read (MainLayer.as:380-385 area); `PetCanvas.showNullPet` sets visible when state normal.
3. Bar fill colors/skin geometry live in the compiled CSS of the main SWF (unreadable `BUS` wrapper).
4. `labelExp`/level-label font size/color beyond default white+shadow is only in CSS.
5. `levelUp()` auto-invoked on every `gameObj` set for level<20 when exp full (client auto-sends `lvUp`); server should not assume a click.
