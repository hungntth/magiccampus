# Main HUD: MiniMapCanvas + ActivityCanvas (research)

Date: 2026-11-03. Legacy root: `E:\mcgame\docs\client` (all paths below relative to it unless noted). Read-only research, no code changes.
Everything is from actual reads/greps; **inferred** marks guesses.

## 1. Summary

The top-right HUD is one MXML-compiled container, `MiniMapCanvas` (220x347, anchored `right:0 top:0`). It is NOT a rendered minimap.
It holds: a title strip (line + map name + x,y), a network/delay strip, a "cav_mini" panel of 6 small icon buttons
(Map, System, Help, PK, Rank, Msg/events), a right-hand shop button, the collapse arrow for that panel, a line-switch button,
a server-clock button, and the **vertical red button column** `funCanvas` (Nạp, Chế tạo, Luyện, Sản xuất, Auto, Ủy thác, Trang Viên, Đấu Pet, Bay)
with its own collapse arrow `btnChange`. `ActivityCanvas` is NOT the vertical menu: it is the horizontal, paged strip of
activity icons (Daily activity, Monthly welfare, ...) to the left of the minimap (`right:190 top:0`, width 450), plus a collapse arrow and the "JXHD" button.
A "Quà" gift button is NOT in either class (see Open questions).

## 2. Key files

- `view/view/compMain/MiniMapCanvas.as` (2321 lines): everything in section 4. MXML descriptor lines 110-623; handlers 681-2300.
- `view/view/compMain/ActivityCanvas.as` (1677 lines): activity icon strip. Descriptor 71-170, click switch 400-995.
- `view/view/compMain/ActivityCanvas_element.as` (+ `_dataClass`): embedded SWF `MovieClipLoaderAsset`, 550x400 (11000/20 x 8000/20) - the red "circle/new" badge MovieClip added to icons (`addCircle`, `addJXHDCircle`, x -7 y -5).
- `ActivityCanvas_Caidanshang1/2`, `_Caidanxia1/2` (20 lines each): embedded skin classes for barUp/barDown (`1` normal, `2` = "has badge on another page"). Their bodies only declare `maskMC`/`maxMc`, art is in the embedded SWF (not in the AS).
- `view/view/MainLayer.as`: placement (UIPropVO list). MiniMap = `_MainLayer_UIPropVO9` (line 185-194, name "迷你地图", style `{right:0, top:0}`); Activity = `_MainLayer_UIPropVO8` (line 1012-1021, name "日常活动", style `{right:190, top:0}`). Both `initVisible = true` (lines 458-479 region, bindings).
- `system/Core.as`: `timer10` (line 134, 10000 ms; started line 185), `onTimer10` (1657-1663), `getNetDelayState` (717-729), `timeLag` (103), `updateSettingNow` (347-358).
- `predef/GamePredef.as`: `NET_DELAY_STATE=[50,100,300,500]` (2065), `NET_DELAY_COLOR=["#66ff00","#66ff00","#ffba00","#ffba00","#ff0000"]` (2066), `FLYING_STATE_*` (1776-1781).
- `config/Language.as`: `MINIMAPCANVAS_S` (2121-2163), `MINIMAPCANVAS_U` (4205-4228), `NET_DELAY_STATE_S` (5021-5025), `ACTIVITY_CANVAS` (5788-5794).
- `logic/Battle.as` 661/673 (show MAIN_MINIMAP, MAIN_ACTIVITY on leaving battle), 979/993 (hide on entering battle), 725 (array of HUD ids).

## 3. Language strings

Keys are `Language.<ARRAY>[n]` (Language.as).

MINIMAPCANVAS_U (button labels): [1] "Nạp" (btn_exchange), [0] "Chế tạo" (btn_product), [2] "Luyện" (btn_pet), [10] "Sản xuất" (btn_life),
[3] "Auto" (btn_battle), [5] "Ủy thác" (btn_autoExp), [16] "Trang Viên" (btn_fazenda), [30] "Đấu Pet" (btn_petArena; [19] "Đấu pet" unused here),
[7] "Bay" / [8] "Xuống" (flyBtn, set by `changeFlyingButton`), [17] "Bay/Xuống (Phím tắt F)" (flyBtn tooltip), [20] "PK ngẫu nhiên" (randomBattleBtn),
[18] "Thiết lập" (btn_battle_copy, only in the world-boss/copy mode), [9] "Thưởng", [14] "Bảng xếp hạng", [21] "Thú cưỡi", [22] "Không cưỡi" (not referenced by MiniMapCanvas binding code).
[6] "Bạn đang ở bản đồ phụ bản hoặc bang hội, nếu chuyển kênh sẽ được đưa đến Đông Huyền Thành, xác nhận tiếp tục?" (lineSelectResponder; `changeLine()` has no caller in the file, effectively dead),
[12] "Bạn hiện đang trong phụ bản, nếu chuyển kênh sẽ bị đẩy ra khỏi phụ bản, xác nhận chuyển kênh?",
[13] "Cấp độ của bạn chưa đủ 50, không thể bay" (not referenced in this file), [15] "Bạn đang ở phụ bản, khi đổi kênh sẽ tự động rời khỏi phụ bản và túi tạm thời hủy các vật phẩm, xác nhận có đổi kênh?？".

MINIMAPCANVAS_S (tooltips/format): [0] "Đang ở: ", [1] "Bạn có thể chọn vào bằng các kênh khác nhau\n", [2] "Kênh có trạng thái tốt sẽ giúp bạn chơi game thuận tiện hơn" (btnLine tooltip = [0]+lineInfo.name+"\n"+[1]+[2]; without lineInfo = [3]+[4], same text),
[5] " - " (separator between line number and map name), [24] "Giao diện shop (phím tắt N)" (btn_sys_shop),
[25] "Bản đồ (Phím tắt bản đồ thế giới: M, Phím tắt bản đồ hiện tại: ~)" (miMap; `renren` session uses [30] "Đóng mở bản đồ nhỏ (Phím tắt Caps Lock)"),
[26] "Thiết lập hệ thống (Phím tắt: P)" (Button2/BtnSys), [27] "Hệ thống hỗ trợ (Phím tắt: H)" (Button3/BtnHelp), [28] "Các sự kiện, phụ bản, BOSS kiến nghị (Phím tắt: Z)" (btnMsg),
[29] "Cho phép PK; Cấm PK" (btnPK initial tooltip), [34] "Thiết lập hiện tại: Cho phép PK" (btnPK not selected), [35] "Thiết lập hiện tại: Đóng PK" (selected),
[37] "Xếp hạng chiến tích, cấp độ, tài sản, nhân khí, đấu trường và mục lục người yêu" (btnRank),
[38] "Mạng:<font color='{color}'>{state}</font> Delay:<font color='{color}'>{delay}</font> ms" (LB_delay htmlText),
[39] "Chỉ có người chơi cấp 35 trở lên mới than gia đấu pet ", [40] "Thời gian thực：{ltime}\nThời gian server：{stime}" (serverClock tooltip),
[41] "Thời gian đếm ngược {num}", [42] "HP X{num}" (trials info). Item-popup tips [6]-[23],[31]-[33] belong to dead helpers (`showBuff`, `showExp`, `showMove`; no callers in this file).
NET_DELAY_STATE_S: [0] "<font color='#66ff00'>Rất tốt</font>", [1] "<font color='#66ff00'>Tốt</font>", [2] "<font color='#ffba00'>Bình Thường</font>", [3] "<font color='#ffba00'>Yếu</font>", [4] "<font color='#ff0000'>Rất yếu</font>".
Other: FAZENDAPANEL_S[11] "Người chơi cấp 20 trở lên mới có thể vào trang viên"; TEMPORARYBAGWARNCANVAS_U[1] "Túi tạm thời của bạn đang có vật phẩm. Nếu đổi kênh các vật phẩm sẽ tự hủy. Xác nhận có đổi kênh?"; TRIALS_MAIN_PANEL[8] "Xác nhận thoát?".
ACTIVITY_CANVAS: [0] "Đang thao tác", [1] "Đang báo danh" (ACTIVITY_STATE = [1],[0]; red label under icon: state 1 -> "Đang báo danh", state 2 -> "Đang thao tác"), [3] "Chỉ có người chơi đã báo danh mới tham gia sự kiện Đố Vui Có Thưởng tại kênh báo danh! 20:05 - 20:07 thứ ba, năm, bảy hàng tuần hãy tham gia nhé!", [6] "Sự kiện đã bắt đầu, hãy mau đến tham gia".
"Quà": only `QUESTCANVAS_U[3]` and `SYSTEMSHOPPANEL_U[11]` exist (not part of these canvases).

## 4. Layout (MiniMapCanvas)

Container `SimpleCanvas`: width 220, height 347 (descriptor 115-116 and ctor 635-636), `cacheAsBitmap=true`.
Ctor also sets `x=139.35 y=261` (638-639) but MainLayer anchoring (`right:0, top:0`) overrides them (**inferred**: the Flex constraint layout wins).
So container occupies x = W-220..W, y = 0..347. All child coords below are relative to the container (x from container left, y from top).
`right:N` = distance from container right edge (220) to child right edge.

| Child (id) | Type / skin styleName | Geometry |
|---|---|---|
| title strip (anonymous Canvas) | Canvas `MiniMapTitle` | w161 h24, right 0 -> x 59..220, y 0 |
| `titleLabel` | RoundedLabel, centered | 100% x 100%, y 4 |
| `delayCanv` | Canvas `MiniMapTitle`, hscroll off, **visible=false** until first ping reply | w161 h26, right 0, y 24 |
| `LB_delay` | TextArea (non-editable, no border, bg alpha 0), color 0xFFFFFF, size 12, center, filters `[FILTER_SHADOW_TEXT, FILTER_SHADOW_TEXT2]` | w161 h24, x0 y5 (inside delayCanv) |
| `cav_mini` | Canvas `CanvasSystemShopBack`, clipContent false | right 57 -> x 36.1..163, y 53, w126.9 h72 |
| `miMap` | Button `BtnMap` (Bản đồ) | x38.6 y38.5 (in cav_mini) |
| `_MiniMapCanvas_Button2` | Button `BtnSys` (Thiết lập hệ thống) | x89.4 y2 |
| `_MiniMapCanvas_Button3` | Button `BtnHelp` (Hệ thống hỗ trợ) | x76.8 y39.5 |
| `btnPK` | Button `BtnPK` (toggle) | x57.7 y10 |
| `btnRank` | Button `BtnRank` (Xếp hạng) | x27 y2 |
| `btnMsg` | Button `BtnMsg` (events/BOSS) | x3 y21 (alt styles: `setMsgStyleBig`: BtnMsg 75x72 at -16,-13; `setMsgStyleNormal`: BtnMsg2 33x32 at 7,9; no callers found in this file) |
| shop panel (anonymous) | Canvas `CanvasSystemShopBack2`, clipContent false | right 0 -> x 158..220, y 53, w62 h72 |
| `btn_sys_shop` | Button `BtnSystemShop` | x4 y10 (in shop panel) |
| `btn_changeVisible` | Button `MiniCanvaHideBtn` / `MiniCanvaShowBtn` | x148 y78 w12.9 h27.9 (absolute) |
| `serverClock` | Button `BtnServerClock`, mouseOver -> tooltip | right 161, y 24 (size from skin) |
| `btnLine` | Button `BtnChangeLine` | right 161, y 0, w26 h24 |
| `funCanvas` | Canvas `RightButtonBackground` | right 0 -> x 135..220, y 135, w85 h262 |
| funCanvas buttons | `BasicGlowButton`, styleName `BtnStdRed`, `left:6 right:6` (width 73 inside the 85 panel), `paddingTop 2` on the first | x 6, y = 6, 34, 62, 90, 118, 146, 174, 202, 230 (step 28; height from skin, **inferred** <= 28) |
| `btnChange` | Button `BtnHideButtons` / `BtnShowButtons` | x124 y260 w12 h25 (hidden state: x208) |
| `quitBtn`, `quitTrialsBtn` | Button `BtnWbQuit`, invisible by default | x150 y423 w50 h50 |
| `timeTrials` / `liveTrials` | Label bold 15 white, invisible | x10 y423 / x10 y443 |
| `randomBattleBtn` | BasicGlowButton `BtnStdRed`, invisible | x150 y423 w60 |
| `btn_battle_copy` | Button `BtnStdRed`, invisible | x93 y440 |

funCanvas order top to bottom (y): 6 `btn_exchange` "Nạp"; 34 `btn_product` "Chế tạo"; 62 `btn_pet` "Luyện"; 90 `btn_life` "Sản xuất"; 118 `btn_battle` "Auto";
146 `btn_autoExp` "Ủy thác"; 174 `btn_fazenda` "Trang Viên"; 202 `btn_petArena` "Đấu Pet"; 230 `flyBtn` "Bay"/"Xuống".
The user's remembered strings "Xếp hạng, PK, Thiết lập, Cách chơi, Bản đồ, Trợ giúp, Shop" are icon-only buttons with tooltips (no text labels): Bản đồ, System settings (BtnSys), Help (BtnHelp, "Hệ thống hỗ trợ" which is also the "Cách chơi/Trợ giúp"), PK, Xếp hạng, Msg.

Skin/asset names: all are Flex CSS style names (`styleName`), compiled into the client's CSS/theme SWF; the AS files contain only the names, no asset class or SWF library path.
Names: MiniMapTitle, CanvasSystemShopBack, CanvasSystemShopBack2, RightButtonBackground, BtnMap, BtnSys, BtnHelp, BtnPK, BtnRank, BtnMsg/BtnMsg2, BtnSystemShop,
MiniCanvaHideBtn/MiniCanvaShowBtn, BtnServerClock, BtnChangeLine, BtnStdRed, BtnHideButtons/BtnShowButtons, BtnWbQuit. Their PNG/SWF art must be located via asset tooling (not resolvable from AS; **open question**).
Effects: `glowEffect` (Glow color 16135947=0xF6E50B?? decimal 16135947 = 0xF63D0B; repeat 10000, blur 0->10) on `btn_fazenda` via `playGlowEffect()` (2198-2204), cleared when the fazenda button is clicked (746-747).

## 5. Flow and behavior

Button actions (MiniMapCanvas handler lines):
- `miMap` click (1061): ctrl+click -> `ViewManager.POPU_WORLDMAP` else `PANEL_MAP` (`changeVisible` toggles).
- `Button2` (BtnSys, 750): `PANEL_SYSTEM`. `Button3` (BtnHelp, 1914): `PANEL_HELP`. `btnMsg` (804): `PANEL_GAMEINTRO`. `btnRank` (1753): `PANEL_ACTIVE`. `btn_sys_shop` (2177): `PANEL_SYSTEM_SHOP`.
- `btnPK` (1023 -> `changePKState` 2067): toggles `selected`, updates tooltip ([34] unselected / [35] selected), then `Core.updateSettingNow("apvp", !selected)` -> local setting + RPC `uif("apvp", bool, false)` (Core.as:357). `selected` means PK closed. Init: `btnPK.selected = !GLOBAL_SETTING.apvp` (2185). `enablePK`/`disablePK` (1016, 1095) enable/disable the button (disable also unselects).
- `btnLine` (1333 -> `switchLine` 1654): if posMapId > 1999999 (INST_MAP_ID) and mapData.templateId != 49, or 535 < posMapId <= 557: Alert YES/NO ([12], or [15] if temp-bag warn) then `MAIN_LINE` panel; else if temp bag warn: Alert TEMPORARYBAGWARN_U[1] then `MAIN_LINE`; else `MAIN_LINE` directly. btnLine tooltip set in `initView` (2187-2194).
- `btn_changeVisible` (1885 -> 1607): toggles `cav_mini.visible`; style MiniCanvaHideBtn (shown) / MiniCanvaShowBtn (hidden). Only the 6-icon cluster hides (shop panel, title, funCanvas stay).
- `btnChange` (1056 -> `change_canFun` 1226): toggles `funCanvas.visible`; visible: x=124, style BtnHideButtons; hidden: x=208, BtnShowButtons. `showFuncBtn(bool)` (1602) sets it directly. `changeWbBtn(n)` (2102): n=1 or default: quit/copy buttons hidden, btnChange visible, funCanvas shown; n=2: quitBtn+btn_battle_copy shown, btnChange hidden, funCanvas hidden; n=4/5: randomBattleBtn shown/hidden.
- `btn_exchange` "Nạp" (968): `PANEL_EXCHANGE`. `btn_product` "Chế tạo" (2086 -> `showProduct` 1568): requires `core.productFlag`; on first open per char/line calls RPC `checkEquipEdit(null, 1)` and `checkEquipEdit(null, 3)` (no responder, push-based), toggles `PANEL_EQUIPTFUNC`.
- `btn_pet` "Luyện" (849): toggles `PANEL_PETFUNC`. `btn_life` "Sản xuất" (767): toggles `PANEL_LIFESKILL`. `btn_battle` "Auto" (755): `PANEL_BATTLESET` + `updateView()`. `btn_autoExp` "Ủy thác" (1919): `MAIN_AUTO_EXP`.
- `btn_fazenda` "Trang Viên" (1051): level < 20 -> Alert FAZENDAPANEL_S[11]; else `PANEL_FAZENDA` + `nextGuide`. `btn_petArena` "Đấu Pet" (1626): level >= 35: if panel initialized and not `first` toggle `PANEL_PET_ARENA`, else RPC `getPetArenaData(null, true)`; else Alert MINIMAPCANVAS_S[39].
- `flyBtn` "Bay"/"Xuống" (973 -> `changeFlyingState` 1960): 3 s client debounce (`delayFlyButton` 1694); on ground -> `player.beginFlying()`, in air -> `player.stopFlying()`; label = "Bay" when flyingState is ON_GROUND(0) or LANDING(4) else "Xuống" (914-928). Updated from `Creature.as:377` via `changeFlyingButton()`. Level>=50 check is server-side (Go `validateBeginFlying`; no client gate in this file).
- `quitBtn` -> RPC `wbLeaveMap(playerId)`; `quitTrialsBtn` -> Alert `TRIALS_MAIN_PANEL[8]` then RPC `trialsOut`; `randomBattleBtn` -> RPC `autoBattleByRandom(playerId)`; `btn_battle_copy` -> `PANEL_BATTLESET`.
- `enableUI`/`disableUI` (1777, 1945) set `.enabled` on shop, exchange, product, pet, life, autoExp, btnLine, flyBtn, btnRank, fazenda, petArena (not btnPK/map/sys/help/msg/battle).

Title text: `titleLabel.text = getLocationInfo(posX/10, posY/10)` via Flex binding (1377-1385, re-evaluated when `_player.posX/posY` change; `_player = core.player` in `initView` 2184).
`getLocationInfo(int x, int y)` (930-937): with `core.lineInfo`: `(lineInfo.id+1) + " - " + gameData[TBL_MAP][posMapId].name + " " + x + "," + y` (e.g. "3 - Xuất Vân Thôn 50,96"); without lineInfo: `name + " " + x + "," + y`. Params are `int`, so division result is truncated (**inferred** from AS int coercion).

Network/delay: `Core.timer10` (10 s) -> `onTimer10` (Core.as:1657) -> `MiniMapCanvas.handleDelayTimer` -> `checkNetDelay()` (1270): only if `remote.nc.connected`: `startTime = now`, RPC `checkNetDelay` (no args) with Responder `onCheckNetDelay(serverMs:Number)` (1900):
`core.timeLag = serverMs - now`; `delay = round((now - startTime)/2)`; `state = getNetDelayState(delay)` = first index i where `delay <= [50,100,300,500][i]`, else 4; text = S[38] with {state}=NET_DELAY_STATE_S[state] (already wrapped in a colored font tag), {delay}, {color}=NET_DELAY_COLOR[state]; `LB_delay.htmlText`; `delayCanv.visible = true` (so strip hidden until the first reply, i.e. ~10 s after Core init).
Note S[38] colors "Mạng:" status and the number; the "Mạng:"/"Delay:" labels themselves are white (TextArea color 0xFFFFFF). Server reply: Go `CheckNetDelay` returns `time.Now().UnixMilli()` (`internal/presentation/rtmp/handlers/scene/movement.go:256`). This same call also keeps the scene connection alive (Go docs/memory/login-auth-flow.md line 317: server drops scene connections silent > 40 s).
serverClock tooltip (957, 1211): S[40] with {ltime}=local time, {stime}=`now + timeLag + TimeUtil.timeOSOffSet`, formatted by `TimeUtil.dateFormatter`.

Show/hide: `Battle.as` shows MAIN_MINIMAP/MAIN_ACTIVITY on leaving a battle (661, 673) and hides them on entering (979, 993); PVPShadePanel sets `.visible=false` on both while open.
`GameScene.as:281-285` calls `setTrialsInfoVisible(0,-1,false)` on entering non-trials maps. Trials HUD: `setTrialsInfoVisible(ms, life, show)` (1728) -> `timeTrials` "Thời gian đếm ngược {num}" via 1 s Timer counting down (`TimeUtil.secToTime`), `liveTrials` "HP X{num}"; `onTrialsTimerAward({num, life})` (681).

## 6. ActivityCanvas (top activity icon strip)

Placement: MainLayer `{right:190, top:0}` (name "日常活动"). Container width 450 (descriptor 76 and ctor 179), `cacheAsBitmap`. No height set (icons overflow downward: 2 rows of 48, y 0 and 50).

| Child | Skin | Geometry |
|---|---|---|
| `barUp` | `BtnActivityPageUp` (upSkin swapped to `Caidanshang1`/`Caidanshang2`) | x10 y48 |
| `barNum` | RoundedLabel center, text "1", invisible until >1 page | x0 y35 w24.2 |
| `barDown` | `BtnActivityPageDown` (`Caidanxia1`/`Caidanxia2`) | x10 y75 |
| `iconCavas` | Canvas holding icons | x50 y0, right 13 |
| `btnChange` | `BtnHideButtons`/`BtnShowButtons` | right 0, y12 (y37 when >8 icons), w12 h25 |
| `jxhdBtn` | `BtnJXHD` | x-12 y0 w48 h48; click -> `PANEL_JXHD.showPanel()`; badge MovieClip from `ActivityCanvas_element` at (-7,-5) |

Icons: each `Button` w48 h48, `styleName = ACTIVITY_STYLE_ARR[activityId]` (array at line 168, ~80 style names, e.g. [0] BtnDailyAct, [1] BtnMonthAct, [2] BtnStarAct ...), id = activity id string.
Slot index i -> x = `350 - (i % 8) * 50` (right-to-left), y = 0 for the visible first row, 50 for the second row (`getX` 1099, `getY` 1476). A page shows 16 icons (indices (tab-1)*8 .. (tab+1)*8-1); paging scrolls by 8 (one row). `getTabNum(n)` = 1 if n <= 16 else `int((n-17)/8)+2`.
Sorted by `sortType` then `id` (sortByType 1455). State label (red, Flex Label) at icon x+4, y+48 when state 1/2.
Collapse (`change_canFun` 1631): toggles iconCavas, barUp/Down/Num, jxhdBtn visibility, btnChange style. `hideIcons(bool)` (1653) does the same without paging bar.
Clicks: `activityClick` (400-995) is a large switch on `GamePredef.<ACTIVITY>` id opening panels (DAILY_ACTIVITY -> `ViewManager.DAILY_ACTIVITY`; MONTH_WELFARE_PANEL -> PANEL_WELFARE; WB_BOSS_PANEL -> RPC `canEnterWbMap(playerId)`; ANSWER_PANEL -> RPC `canQuest`; BLOODY_BATTLE -> RPC `enterBloodyBattle`; DONGXUAN_PANEL -> `dxdRegister`/`dxdGetIn`; TREASURE_HUNT -> `canEnterTreasureHunt`; PET arena activity -> `getPetArenaActivityInfo`, `getPetArenaDataActivity`; etc., ~70 cases).
Data feed: `initView(Object map)` (1221) per entry `{id, type, flag, sortType}`: type 3 -> `changeView` (flag 0 delete, 1/2 add with state); type 2 -> shown if `player.level >= flag`; type 4 -> shown if `player.expRe > 0`; else shown if `flag` truthy. I did NOT find who calls `ActivityCanvas.initView/changeView/showActivityInfo` (no grep hit outside the file for these, nor `MAIN_ACTIVITY` besides Battle.as/PVPShadePanel/TripleTownTurnPanel) - the push feeding it is unresolved (open question).

## 7. Proposed shared types / H5 mapping

Only one RPC needed for the minimap HUD; the rest are panel opens (client-local) and existing setting RPC.

```ts
// packages/shared/src/protocol.ts additions (proposed)
// RPC checkNetDelay(): number  -- server epoch ms (Date.now())
export type CheckNetDelayResult = number;
// RPC uif(key: string, value: unknown, isPet: boolean): null   (apvp = allow PK flag)
export interface MiniMapHudState { lineId: number | null; mapName: string; posX: number; posY: number; } // client-derived, not wire
export const NET_DELAY_STATE = [50, 100, 300, 500] as const;
export const NET_DELAY_COLOR = ['#66ff00', '#66ff00', '#ffba00', '#ffba00', '#ff0000'] as const;
```
Server: `server/src/modules/scene` (or `session`) `checkNetDelay` RPC returning `Date.now()`; keep non-`quiet` until confirmed. Client: `client/src/ui/hud/minimap.ts` (DOM overlay anchored `position:absolute; right:0; top:0; width:220px`) and `client/src/ui/hud/activity-bar.ts` (`right:190px; top:0; width:450px`); 10 s `setInterval` ping; coordinates `Math.trunc(posX/10)`; line number shown is `lineId + 1`.

## 8. Open questions

1. Skin art: the `styleName`s resolve to the Flex CSS theme SWF; its path/class names are not in the AS (needs asset-pipeline lookup). Button heights for `BtnStdRed` etc. unknown (28 px pitch suggests ~26).
2. Feeder of `ActivityCanvas.initView(...)`: not found by grep in client AS (could be pushed via an untyped call path); needs a `CallBack*.as` read for activity-list push names.
3. "Quà" gift button location: not in MiniMapCanvas/ActivityCanvas; maybe `AwardWarnCanvas` (38x38, `right:80 bottom:170`) or another panel; not verified.
4. Decimal handling for coordinates is inferred from `int` parameter types.
5. First `checkNetDelay` is ~10 s after Core init (timer10 starts at Core.as:185); whether an immediate first ping exists elsewhere was not searched.
6. Glow color constant 16135947 (used on Trang Viên) - decimal given; hex not independently verified.
