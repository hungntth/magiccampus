# Thời trang (Dress) and Phi hành (Flyer / flying) - Flash client contract

Date: 2026-11-07. Scope: (A) the "Tủ Đồ" dress system (fashion costumes + flyer skins, recipes, chips, draws, fake looks, hide
flag) and (B) flying equipment: equip slot, take-off / landing, HUD button, rendering.

Paths are relative to `E:\mcgame\docs\client` unless absolute (the legacy repo is `E:\mcgame`, not `D:\mcgame`). Every
line number below comes from a read or grep in this session. Anything not provable from the decompile is marked
**inferred**. Companion doc (server side, written the same day, not re-read here):
`E:\magiccampus\docs\research\2026-11-07_05_DRESS_FLYER_SERVER_RESEARCH.md`. Existing plan this feeds:
`E:\magiccampus\docs\plans\2026-11-04_16_APPEARANCE_GEAR.md` (13.1 / 13.2).

## 1. Summary

The player opens "Tủ Đồ" from a button on the character panel. It lists 71 fashion costumes (TBL_DRESS `type 1`) and 22 flyer
skins (`type 2`). Each one is activated once by spending a recipe (a "bộ") plus Pha Lê Ma Pháp / Bảo Châu Vĩnh Hằng; activated
sets add flat stats and can be "ảo hoá" (fake look: show another costume / flyer art than the one worn). Recipes come from
free / gold / Điểm-Thời-Thượng draws that yield chips ("mảnh ghép") or sets, from merging chips, from "Chuyển Bộ" (3 sets -> 1
random set) and from buying a set with Điểm thưởng. The real appearance items are ordinary equipment: a costume is
equipment kind 11 at position 21 and replaces the whole character body; a flyer is equipment kind 10 at position 14 and is
drawn only while the character is in the air. Flying is a leader-driven toggle (HUD button "Bay" / "Xuống") that tweens the body
100 px up/down and shows the flyer art under (and optionally over) the body.

## 2. Key files

| File | Role |
|---|---|
| `view/view/compDragable/DressPanel.as` (2976 l.) | Tủ Đồ window `PANEL_DRESS`: 4 tabs, every draw / transform / activate RPC, stat bonus preview |
| `view/view/compDragable/DressDisplay.as` | Overview-tab list (4 per page) for fashion (`TYPE_DRESS 1`) and flyer (`TYPE_FLYER 2`): fake look + "Nhận" buttons |
| `view/view/compDragable/DressBag.as` | Chips (`TYPE_CHIP 2`) / sets (`TYPE_RECIPE 1`) grid, 25 per page, `makeAllChips` |
| `view/view/compDragable/DressLogic.as` | `updateDressInfo(String)`: the one responder every dress RPC feeds; fires `DressEvent.DRESS_CHANGE` |
| `view/view/compDragable/DressItem.as`, `DressItemRenderer.as` | Overview card; Kích Hoạt tree row (name colour, "(Có bộ)" / "(K.Hoạt)") |
| `view/view/compDragable/RecipeExchangePanel.as`, `RecipeItem.as` | "Đổi bộ" window `PANEL_RECIPE_EXCHANGE` 927 (buy a set with Điểm thưởng) |
| `view/view/compDragable/RecipeAlertFree.as`, `RecipeAlertTen.as`, `view/view/comp/RecipeCell.as`, `TipRecipe.as` | "Chúc mừng bạn nhận được" result popups (1 / up to 10 per page), recipe icon cell, tooltip |
| `view/view/compDragable/CharactorPanel.as` | Slots eq14 (index 14 Phi hành), eq15 (index 21 Thời trang), eq16 (index 22 Cánh); `dressHide` / `wingHide` checkboxes; "Tủ đồ" button |
| `view/view/compDragable/UserSystemSetPanel.as`, `system/Core.as:1573-1607` | Second "Ẩn thời trang" checkbox, `flyEffect` setting, `updateSetting` |
| `object/Creature.as` | Flying state machine: `beginFlying`, `stopFlying`, `onBeginFlying`, `onStopFlying`, `data` setter |
| `view/view/compGameStage/CreatureView.as` (10798 l.) | `playFlying`, `flyerOn/Off`, `setFlyerGraphic`, `behaviorForFlying`, `landToSafeArea`, `setCharGraphic`, `equipOn`, `wingOn`, `mountOn` |
| `view/view/compGameStage/CreatureShowView.as` | Preview view used by Tủ Đồ (`setResCode`, `setFlyerCodes`) |
| `view/view/compGameStage/DynamicItemContainer.as:20-96` | Builds the map view of a character: `setRes(dressResCode)` |
| `view/view/compGameStage/ItemContainer.as:80-200` | Layer choice (mid vs fly layer), clouds |
| `view/view/compMain/MiniMapCanvas.as` | Fly button `flyBtn`, `changeFlyingState`, `delayFlyButton` |
| `logic/GameScene.as:215-239`, `logic/ObjectMove.as:21-38` | Ground on non-flyable map; route with no hit layer = straight line |
| `object/Player.as:168, 2233` | `dressInfo` field and its login assignment |
| `predef/GamePredef.as`, `config/Language.as` | Constants, strings (see below) |
| `system/CallBack.as` | **Empty stub** (17 lines, "Decompile aborted ... trait count exceeds set limit"). All `on*` push bodies are invisible |

Not decompiled anywhere in `docs/client`: `AbstractGameRes` (BH_* ids), `ResManager`, `EnterFrameMove`, `CharactorGraphic`.
Behavior ids (breath 0, runFast 1, run 2, ... mount 8-10) therefore come from `E:\mcgame\docs\memory\h5-sprites.md:30,39` and
`mount-system.md:109`, not from the client sources.

## 3. Language strings

### 3.1 `Language.DRESS_PANEL` (`config/Language.as:7772-7819` and `:9434-9440`)

| Key | Vietnamese (exact) | Where used |
|---|---|---|
| 0 | `Tủ Đồ` | window title (`DressPanel.as` binding) |
| 1 | `["Tổng Quan","Kích Hoạt","Rút Bộ","Chuyển Bộ"]` | `pageTab.dataArray` (4 tabs = ViewStack children 0..3) |
| 2 | `Tổng Quan` | label over the preview |
| 3 | `Thời trang ({activeNum}/{totalNum})` | `DressDisplay.updateView` title, fashion list (`DressDisplay.as:331-335`) |
| 4 | `Vật phẩm bay ({activeNum}/{totalNum})` | same, flyer list |
| 5 | `Kích hoạt` | active button default label; Kích Hoạt-tab button |
| 6 | `Nhận thời trang` | `gainBtn` label, fashion list (`DressDisplay.as:302-303`) |
| 7 | `Nhận vật phẩm bay` | `gainBtn` label, flyer list |
| 8 | `<font color='#00FF00'>Đã kích hoạt</font>` | `DressItem.activeState` |
| 9 | `<font color='#999999'>Chưa kích hoạt</font>` | same |
| 10 | `Thuộc tính gia tăng` | heading above `propText` |
| 11 | `HP + {hp}\nCông VL + {phAtt}\nCông MP + {mgAtt}\nTốc + {sp}` | `propText` (stat bonus, see 5.2) |
| 12 | `{"1":"Thời trang","2":"Vật Phẩm Bay"}` | tree group names (`DressPanel.as:1307`) |
| 13, 14, 15 | `Rút miễn phí` / `Dùng vàng rút` / `Rút 10 lần` | defined, **no binding found** in DressPanel |
| 16 | `Số lần：{time}` | free-draw counter (`freeTime`) |
| 17 | `30 vàng` | label next to the gold-draw icon (4130220000486) |
| 18 | `288 vàng` | label next to the ten-draw icon (4130220000487) |
| 19 | `Rút thưởng` | label of the free-draw button (FilterButton2 -> `freeHandler`) |
| 20 | `Điểm thưởng：{score}` | `dressScore` (Rút Bộ tab) |
| 21 | `Đổi bộ` | button -> opens `PANEL_RECIPE_EXCHANGE`; also the exchange window title |
| 22 | `Hướng dẫn:\n1.Mỗi ngày có <font color='#00FF00'>1 lần</font> miễn phí rút thưởng, số lần sẽ làm mới lúc <font color='#00FF00'>0 giờ mỗi ngày</font>\n2.<font color='#00FF00'>Rút thưởng 10 lần</font> chắc chắn sẽ ra bộ\n3.<font color='#00FF00'>Dùng vàng rút thưởng</font> và <font color='#00FF00'> Rút thưởng 10 lần</font> đều nhận được điểm thưởng, điểm này dùng để đi đổi bộ\n4.Mảnh ghép của các bộ có thể ghép thành các bộ tương ứng, những bộ không cần thiết có thể dùng chức năng Chuyển đổi để tạo ra bộ mới` | `exchangeText` (Rút Bộ tab guide, `DressPanel.as:1369`) |
| 23 | `Hướng dẫn:\n1.Mất <font color='#00FF00'>3 </font>bộ (giống hoặc khác nhau đều được)có thể ngẫu nhiên nhận <font color='#00FF00'>1 </font>bộ mới` | `transformText` (Chuyển Bộ guide, `:1370`) |
| 24 | `["Mảnh ghép","Bộ"]` | `bagTab.dataArray` (Rút Bộ tab: chips tab 0, sets tab 1) |
| 25 | `Pha Lê Ma Pháp：{crystal}  Bảo Châu Vĩnh Hằng：{jewel}` | `itemStat` (Kích Hoạt tab, from `dressInfo.bag`) |
| 26, 27, 28 | `PLê MPháp` / `BChâu VHằng` / `Bộ` | cost labels next to icons 4130220000436 / 437 and recipe cell (Kích Hoạt tab) |
| 29 | `Tự mua Pha Lê Ma Pháp,Bảo Châu Vĩnh Hằng` | `autoBuy` checkbox label |
| 30 | `Chuyển bộ` | Chuyển Bộ tab label (`Label16`) |
| 31 | `Bộ của tôi` | FilterButton11 label (header of the sets grid) |
| 32 / 33 | `Chuyển` / `Nhanh` | Chuyển Bộ buttons (`transformHandler` / `transformAllHandler`) |
| 34 | `Bộ này đã kích hoạt` | defined, no use found |
| 35 | `Chưa kích hoạt, không thể nhận` | `DressDisplay.receiveHandler` -> `_core.sysMidNote` (`DressDisplay.as:629`) |
| 36 | `Kích hoạt cần <font color='#00FF00'>{money} vàng</font>, xác nhận?` | `dressActiveValidate` Alert (`DressPanel.as:1571`) |
| 37 / 38 | `Chúc mừng bạn nhận được` / `Xác nhận` | `RecipeAlertFree` / `RecipeAlertTen` |
| 39 / 44 | `Chuyển bộ` / `Hợp` | FilterButton7: label `[bagTab.selectedIndex == 0 ? 44 : 39]` (`DressPanel.as` binding): chips tab "Hợp", sets tab "Chuyển bộ" |
| 40 | `["Bộ thời trang","Bộ phi hành"]` | `RecipeExchangePanel` tabs |
| 41 | `Điểm：{score}` | `RecipeExchangePanel.scoreText` (`:576`) |
| 42 | `{score} điểm` | `RecipeItem.recipeCost` = `TBL_RECIPE.money` (`RecipeItem.as:194`) |
| 43 | `Đổi ngay` | `RecipeItem` button |
| 45 | `Xác nhận mất <font color='#00FF00'>30 vàng</font> để <font color='#00FF00'> rút thưởng</font>?` | `goldHandler` Alert |
| 46 | `Xác nhận mất <font color='#00FF00'>288 vàng</font> để <font color='#00FF00'> rút thưởng 10 lần</font>?` | `tenHandler` Alert |
| 47 | `Xác nhận mất <font color='#00FF00'>{score}điểm thưởng</font> để <font color='#00FF00'>đổi</font>?` | `RecipeItem.exchangeHanlder` Alert |
| 48 | `Tủ đồ` | label of the character-panel button (`CharactorPanel.as` binding `_CharactorPanel_BasicGlowButton1.label`) |
| 49 | `300 điểm thời thượng/lần` | FilterButton5 label (`ssdHandler`) |
| 50 | `2880 điểm thời thượng /10 lần` | FilterButton6 label (`tenssdHandler`) |
| 51 | `30 vàng/lần` | FilterButton3 label (`goldHandler`) |
| 52 | `288 vàng/10 lần` | FilterButton4 label (`tenHandler`) |
| 53 | `Điểm thời thượng:` | `Label13`; `Label14` shows `_core.player.shishangdian` |
| 54 | `Xác nhận tiêu hao <font color='#00FF00'>300 điểm thời thượng </font> để <font color='#00FF00'>rút </font>?` | `ssdHandler` Alert |
| 55 | `Xác nhận tiêu hao <font color='#00FF00'>2880 điểm thời trang</font> để <font color='#00FF00'>rút 10 lần</font>?` | `tenssdHandler` Alert (note "thời trang" typo in the source) |

### 3.2 Inline Vietnamese in the AS (not in Language.as)

| String | File:line | Meaning |
|---|---|---|
| `Hình ảnh ảo hoá` | `DressDisplay.as:466` | active button label for an activated (book) entry |
| `Bỏ ảo hoa` (sic, no tone mark) | `DressDisplay.as:474` | label when `fakeDressId` or `fakeFlyDressId` equals the selected id; the `unset*` branch compares this literal (`:575`, `:591`) |
| `(Có bộ)` | `DressItemRenderer.as:144` | tree row: not activated, recipe owned |
| `(K.Hoạt)` | `DressItemRenderer.as:148` | tree row: not activated, recipe owned AND Pha Lê >= `num1` AND Bảo Châu >= `num2` ("can activate") |

### 3.3 Other strings touched by these features

| Constant | Vietnamese | Use |
|---|---|---|
| `CHARACTORPANEL_S[53]` / `[54]` | `Phi\n hành` / `Thời\n trang` | slot captions of eq14 / eq15 (`CharactorPanel.as` bindings 7267 / 7292 region) |
| `CHARACTORPANEL_S[56]` | `Chọn ẩn bộ thời trang` | `dressHide.toolTip` (`CharactorPanel.as:7350`) |
| `CHARACTORPANEL_S[64]` | `Chọn ẩn cánh` | `wingHide.toolTip` (`:7367`) |
| `GAMEPREDEF_S[383]` / `[390]` / `[459]` | `Phi hành` / `Thời trang` / `Cánh` | `EQUIP_POSITION[14]` / `[21]` / `[22]` (`GamePredef.as:9869,9876,9877`) and `ITEM_KIND_NAME[10 / 11]` (`:9404,9406`) |
| `MINIMAPCANVAS_U[7]` / `[8]` | `Bay` / `Xuống` | fly button label (`MiniMapCanvas.as:922, 926`) |
| `MINIMAPCANVAS_U[17]` | `Bay/Xuống (Phím tắt F)` | fly button tooltip (`MiniMapCanvas.as:1308`) |
| `MINIMAPCANVAS_U[13]` | `Cấp độ của bạn chưa đủ 50, không thể bay` | **defined, no reference found in the decompile** (grep `MINIMAPCANVAS_U[13]` only matches Language.as) |
| `NPCVIEW_S[0]` | `Đã ở trong nhóm thì cần nghe lời nhóm trưởng!` | follower presses Bay / Xuống (`Creature.as:179, 335`) |
| `TASKSWEEPPANEL_U[23]` | `Khi tự động hoàn thành phụ bản không thể bay hoặc xuống` | `taskSweep` blocks toggles (`Creature.as:184, 340`) |
| `USERSYSTEMSETPANEL_S[25]` / `[26]` | `Ẩn thời trang` / `Hiệu ứng bay` | settings checkboxes (`UserSystemSetPanel.as:1985-1986`) |
| `TIPEQUIP_S[13]` | durability line | **not shown for kind 11** (`comp/TipEquip.as:1555`) |

## 4. Flow

### 4.1 Opening and refreshing the panel

1. Character panel button "Tủ đồ" -> `CharactorPanel.dressHandler` (`CharactorPanel.as:3610-3615`) -> `getUI(PANEL_DRESS 926).show()`
   (`ViewManager.as:299`).
2. `DressPanel.show()` (`DressPanel.as:2027-2049`): sends `checkSameDay` (responder `onCheckSameDay(String)`), calls
   `updateView()` immediately if already initialised, then `super.show()`. `onCheckSameDay` stores
   `player.dressInfo = JSONUtil.JSONfy(reply)` **without** dispatching `DRESS_CHANGE`, and sets `freeTime.text` to
   `DRESS_PANEL[16]` with the **constant** `time: 1`. So the label reads "Số lần：1" after every open until the next
   `DRESS_CHANGE` (which recomputes `1 - dressInfo.extract` in `updatePageThree`, `DressPanel.as:2816-2838`). Client defect; the H5 port should compute it.
3. `onComplete` (`:1362`) wires `DRESS_DROP`, `TREE_SELECTED`, `DressLogic.dressProxy DRESS_CHANGE -> changeHandler -> updateView()`.
   `updateView` = `updatePageOne..Four` (`:2019-2025`): all four tabs are redrawn on every change.
4. Every dress RPC answer goes through `DressLogic.updateDressInfo(String)` (`DressLogic.as:19-26`): ignores null / empty /
   identical string, else `player.dressInfo = JSONfy(str)` and dispatches `DRESS_CHANGE` (event class `ui/event/DressEvent`, not decompiled here).

### 4.2 Tab 0 "Tổng Quan"

- `updatePageOne` (`:1461-1524`): first call builds `CreatureShowView`: `ObjectUtil.copy(_core.player)` with `wp=-1`, `name=""`,
  `wingResCode=-1`, `doubleFly=false`, `dir=posDir=0`, `flyingState = FLYING_STATE_TAKING_OFF` (so the flyer is drawn),
  then `dressPlay.updateView(1)` and `flyerPlay.updateView(2)`.
- Turn arrows rotate `dir` (`turnHandler`, `:1165-1183`).
- Selecting an entry in either list updates the preview only: `dressChangeHanlder` (`:2769-2788`) ->
  `showView.setResCode(gender == 0 ? equipt.resCodeMale : equipt.resCodeFemale)`; `flyerChangeHanlder` (`:2928-2950`) ->
  `showView.setFlyerCodes({flyerResCode: equipt.resCode, flyerFrontResCode: equipt.wavCode})` (`CreatureShowView.as:125-145`).
- `DressDisplay.updateView(type)` (`DressDisplay.as:289-337`): lists TBL_DRESS rows with `type == showType && isOpen == 1`,
  `sortOn("position", NUMERIC)`, 4 per page (`PAGE_NUM 4`), title counts = entries of `dressInfo.book` whose row has that type and `isOpen == 1`.
- `updateButtonText` (`:450-478`): label `Hình ảnh ảo hoá` if `book[sel]`, else `Kích hoạt` (`DRESS_PANEL[5]`); `Bỏ ảo hoa` if
  `dressInfo.fakeDressId == sel || dressInfo.fakeFlyDressId == sel`.
- Active button (`DressDisplay.activeHandler`, `:529-605`):
  - not in `book` -> `activeCall(sel)` = `DressPanel.activeTab` (`:1808-1835`): jumps to tab 1 and selects the row in the tree.
  - in `book`, `dressMeta.type == 1`: `resCode = player.gender == 0 ? resCodeMale : resCodeFemale` of
    `TBL_EQUIPT_TEMPLATE[dress.equiptId]`; label `Bỏ ảo hoa` and `fakeDressId == id` -> `unsetFakeDress(id, resCode)`, else
    `setFakeDress(id, resCode)`. Responder `cb(String)`: `DressLogic.updateDressInfo` + `updateButtonText`.
  - in `book`, type 2: same with `unsetFakeFlyerDress(id, equipt.resCode, equipt.wavCode)` / `setFakeFlyerDress(...)`.
- "Nhận thời trang / Nhận vật phẩm bay" (`receiveHandler`, `:607-630`): in `book` -> `recieveGoods(selectId)` **with a null Responder**;
  otherwise `_core.sysMidNote(DRESS_PANEL[35])`. No local feedback, the bag item arrives through the normal item pushes.
- Stat panel: see 5.2.

### 4.3 Tab 1 "Kích Hoạt"

- Tree of TBL_DRESS grouped by `type` (group `name = DRESS_PANEL[12][type]`), children sorted by `position` (`updatePageTwo`, `:1278-1360`).
  Note: **no `isOpen` filter here**, unlike the Overview lists. Row text `DressItemRenderer.commitProperties` (`:72-150`): name in
  `MSG_ITEM_COLOR[TBL_DRESS.color]` when `book[id]`, else `#999999`; group row gets the "(K.Hoạt)" / "(Có bộ)" marker of its children.
- Select -> `treeSelectHanlder` (`:1726-1751`): `toActiveSlot` shows `TBL_EQUIPT_TEMPLATE[dress.equiptId]`, `recipeCell` shows `dress.recipeId` (stack 1),
  `crystalNum.text = dress.num1`, `jewelNum.text = dress.num2`.
- "Kích hoạt" -> `activeDress(dressId, autoBuy.selected)` (`:2183-2192`, responder `DressLogic.updateDressInfo`). **No client check** of recipe / crystal / jewel.
- `dressActiveValidate(dressId)` (`:1532-1582`) computes the shortage price (`GamePredef.DRESS_CRYSTAL_PRICE 1` vàng per Pha Lê,
  `DRESS_JEWEL_PRICE 5` per Bảo Châu, `GamePredef.as:6809-6810`), shows `DRESS_PANEL[36]` and on YES sends `ensureBuyActive(dressId)`.
  **No caller exists in the decompile** (grep), so its trigger is either the stubbed `CallBack` or dead code (open question 1).
- Pha Lê / Bảo Châu counts (`itemStat`, `DRESS_PANEL[25]`) come from `dressInfo.bag.crystal` / `.jewel`, shown as 0 when missing (`:1339-1359`).

### 4.4 Tab 2 "Rút Bộ" (draws)

| Control | Handler | RPC | Confirm |
|---|---|---|---|
| FilterButton2 `Rút thưởng` | `freeHandler` `:2147` | `freeExtractRecipe()` | none |
| FilterButton3 `30 vàng/lần` | `goldHandler` `:1879` | `goldExtractRecipe()` | Alert `DRESS_PANEL[45]` |
| FilterButton4 `288 vàng/10 lần` | `tenHandler` `:1600` | `tenExtractRecipe()` | Alert `[46]` |
| FilterButton5 `300 điểm thời thượng/lần` | `ssdHandler` `:1791` | `ssdExtractRecipe()` | Alert `[54]` |
| FilterButton6 `2880 điểm thời thượng /10 lần` | `tenssdHandler` `:1664` | `largessdExtractRecipe()` | Alert `[55]` |
| FilterButton8 `Đổi bộ` | `exchangeTab` `:1623` | opens `PANEL_RECIPE_EXCHANGE` | - |

- Free draw: `FREE_EXTRACT_TIME = 1` (`:82`). Counter = `max(0, 1 - dressInfo.extract)` (`:2821-2832`). The client does **not** block the button
  when the counter is 0; the server decides.
- Results: single draws show `RecipeAlertFree.show(recipeId, recipeNum)`; ten-draws build `{recipeId, recipeNum}` from `planArr[i].{recipeId, num}` and show
  `RecipeAlertTen.show(list)` (10 per page, `RecipeAlertTen.as:55`).
- `dressScore` = `DRESS_PANEL[20]` with `dressInfo.score` (`:2834-2836`); `Label14` = `player.shishangdian` (plain Number, `Player.as:55,308`; assigned from the login `cData.shishangdian`, `Player.as:2242`).
- Grid below (`DressBag`, `bagTab`): chips tab -> `TYPE_CHIP`, sets tab -> `TYPE_RECIPE` (`bagHandler`, `:1265-1270`). FilterButton7: on chips -> `dressBag.makeAll()` ->
  `makeAllChips()` (`DressBag.as:678-685`); on sets -> `pageTab.selectedIndex = 3` (`bagFuncHndler`, `:2162-2176`).
- `DressBag.updateView` (`DressBag.as:201-240`): walks `dressInfo.recipe` (key = recipe id, value = count), keeps entries with count > 0 whose `TBL_RECIPE[id].type == showType`.
  Cell shows count (capped display `9999+`, `RecipeCell.as:35,215`).

### 4.5 Tab 3 "Chuyển Bộ"

- `updatePageFour` (`:1383-1394`) clears the 3 `recipeCell0..2` and lists sets (`TYPE_RECIPE`).
- Dragging a set from the grid into a cell: stock `dressDropHandler` (`:1763-1784`) removes the same id from the other cells (so one stack fills only one cell). The legacy build
  empties it with a bytecode patch (`dress-system.md:108`), i.e. in our port the same id may sit in 2-3 cells.
- "Chuyển" -> `transformRecipe(recipeArr)` (`:1432-1454`); "Nhanh" -> `transformAllRecipe(recipeArr)` (`:1958-1980`). `recipeArr` = recipe ids of the **non-empty** cells only (0..3 entries, no padding).
  Replies: `transformRecipe` -> `{dressInfo, recipeId, recipeNum}` -> `RecipeAlertFree`; `transformAllRecipe` -> `{dressInfo, produceArr:[{recipeId, recipeNum}]}` -> `RecipeAlertTen`.
- No client check that 3 cells are filled (the server answers a refusal text, see Go note `dress-system.md:108`).

### 4.6 "Đổi bộ" window (`RecipeExchangePanel` / `RecipeItem`)

- Lists `TBL_RECIPE` rows with `type == 1` and `kind == 1` (fashion) or `kind == 2` (flyer), sorted by `position`, 5 per page (`RecipeExchangePanel.as:57-59, 295-321`). **No `isOpen` filter and no money > 0 filter.**
- `scoreText` = `DRESS_PANEL[41]` with `max(0, dressInfo.score)` (`:560-576`). Each item shows `TBL_RECIPE.money` (`RecipeItem.as:194`).
- Click -> Alert `DRESS_PANEL[47]` -> YES -> `exchangeRecipe(recipeId)` with responder `DressLogic.updateDressInfo` (`RecipeItem.as:236-258`). **No client score check.**

### 4.7 Equip / hide flow (CharactorPanel)

- Slots: eq14 `index 14`, `acceptPos [14]`, caption `CHARACTORPANEL_S[53]` "Phi\n hành" (`CharactorPanel.as:522-533`, bindings ~7262-7287);
  eq15 `index 21`, `acceptPos [21]`, caption `[54]` "Thời\n trang" (`:535-`, bindings ~7288-7312); eq16 `index 22` = Cánh (wing). All three accept only `TBL_EQUIPT_INSTANCE`.
  Slot index = template `position` (= `Slot.index` for equipment, see memory `decompile_gaps_and_rpc_semantics.md`).
- Equip / unequip itself is the generic equipment RPC (no dress-specific equip RPC exists in the client; `GamePredef.SLOT_SID_DRESS = 21`, `SLOT_SID_WING = 22`, `GamePredef.as:1177-1178`).
- `dressHide` checkbox at (90, 81), `wingHide` at (174, 81) (`CharactorPanel.as:559-579`). Click -> `setDressHide()` (`:3901-3920`) -> `setDressHide(true|false)`; `setWingHide(wingHide.selected)` (`:4167-4170`).
  Responders `onSetDressHide(v)` (`:6058-6071`) / `onSetWingHide(v)` (`:4662-4672`): `v == -1` means **refused**: box is unticked and `GLOBAL_SETTING.dressHide/wingHide = false`; any other value is stored in `GLOBAL_SETTING` (and for dress also pushed to the system panel `setDressHideCB(v)`).
- Second entry point: system settings checkbox `c9` (`UserSystemSetPanel.as:618-621`) -> `updataInterface` -> `Core.updateSetting("dressHide", bool)` (`Core.as:1584-1587`) -> `CharactorPanel.setDressHideCBSelected(v)` + `CharactorPanel.setDressHide()` (which sends the RPC).
  **Quirk**: `case "dressHide"` has no `return`/`break`, so it falls into the `flyEffect` branch (`Core.as:1588-1607`) and rewrites `FLYING_ZOOM_RATE` (0.7 when ticked, 1 when unticked) and redraws / clears clouds if in the air.
- Initial values: `getDressHideData` / `getWingHideData` read `GLOBAL_SETTING` (`CharactorPanel.as:4976-4988`; `-1` counts as false).

### 4.8 Flying: take-off

1. HUD button `flyBtn` (`MiniMapCanvas.as:495-510`: BasicGlowButton `BtnStdRed`, y 230, left/right 6, in the minimap column). Click -> `changeFlyingState()` (`:1960-1977`):
   gated by `delayFlyButton()` (3000 ms client throttle, `:1694-1709`); `flyingState == 0` -> `player.beginFlying()`; `flyingState == 2` -> `player.stopFlying()`; then `changeFlyingButton()`.
   The button exists always (enabled / disabled with `enableUI` / `disableUI`, `:1777, 1945`); **the client never hides it** and has no level / flyer / map check. Tooltip says hotkey F, but the key handler is not in the decompile.
2. `Creature.beginFlying` (`Creature.as:316-345`): returns unless `flyingState == ON_GROUND`; in a group as non-leader and not AFK -> `remote.fixFlyState()` (once per 30 s, `_oldTime`) + `sysMidNote(NPCVIEW_S[0])`;
   `taskSweep` -> `TASKSWEEPPANEL_U[23]`; else `_core.remote.beginFlying()` (no args, fire-and-forget Proxy call).
3. Server pushes `onBeginFlying {id}` to the whole map (self included). `CallBack.onBeginFlying` is a stub; per the Go bytecode notes (`movement-position.md`, group paragraph) it does `getCharactor(id)`, skips null or `inBattle`, calls `Creature.onBeginFlying()` (same for the pet).
4. `Creature.onBeginFlying` (`Creature.as:192-207`), in this order: `flyingState = TAKING_OFF` (setter refreshes the HUD label via `MiniMapCanvas.changeFlyingButton()`, `:372-379`; TAKING_OFF already shows "Xuống");
   for the local Player `drawClouds()`; `view.playFlying(true, isPlayer, selfIsAirborne)`; `view.switchLayer` to the fly layer; `mountState = OFF` if it was on;
   `view.behaviorForFlying(BH_BREATH_SLOW)`; `view.flyerOn()`.
5. `CreatureView.playFlying` (`CreatureView.as:8215-8354`): `EnterFrameMove` on `_body`, `stepLength 2`, `yBy = -FLIGHT_HEIGHT (100)` (landing +100). While running:
   - `zoomMap` (the local player only): stage zoom from 1 to `C_FLYING_ZOOM_RATE 0.7` via `StageMain.applyZoomEffect`, multiplier `0.7^0.02` per frame (landing `(1/0.7)^0.02`); only if `GLOBAL_SETTING.flyEffect` truthy, else stays at 1 (`:8237-8261`).
   - other characters while self is airborne: view scale from 1 towards `0.9/0.7` (`C_FLYING_PLAYER_ZOOM_RATE / C_FLYING_ZOOM_RATE`, `:8265-8294`), same `flyEffect` gate.
   - End callback (`:8307-8351`): take-off sets `_body.y = -100`, `_gameObject.flyingState = IN_THE_AIR (2)`, fairy `isFlying = true`.
   Duration: 100 px / 2 px per frame = 50 frames, about 2.1 s at the 24 fps global rate (`GamePredef.GLOBAL_FRAME_RATE 24`, `:1975`). **inferred**: `EnterFrameMove` is not decompiled, so "px per frame" is assumed.
6. `flyerOn()` (`CreatureView.as:7483-7517`) is called right after `playFlying` starts, so the flyer is visible from the first frame of the take-off (4.9).

### 4.9 Flying: landing

1. Button `Xuống` (state 2) -> `Creature.stopFlying` (`Creature.as:160-190`): ignored unless `IN_THE_AIR`; follower in group -> `fixFlyState` + `NPCVIEW_S[0]`; `taskSweep` -> notice; else `flyingState = PRE_LANDING (3)` and `view.landToSafeArea()`.
2. `landToSafeArea` (`CreatureView.as:10198-10208`): `moveToSafeArea()` (`:6939-6964`) computes `getSafeRoute(...)` towards `mapData.safeX / safeY` using the hit mask and, when a route exists, sends `udcr {id, route, x, y}` and walks it; if no route -> `remote.stopFlying()` immediately.
3. `CreatureView.stopWalk` (`:8366-8392`): when a `PlayerView` ends a walk in `PRE_LANDING` and is solo / leader / AFK: `hitTestLayer.checkHitTest(x, y)` true (standing on a walkable cell) -> `remote.stopFlying()`, else `landToSafeArea()` again.
4. Server pushes `onStopFlying {id}` (self + map). `Creature.onStopFlying` (`Creature.as:294-303`): `flyingState = LANDING (4)`, `doubleFly = false`, `clearClouds()` for the local player, `playFlying(false, ...)`.
5. Landing tween end (`CreatureView.as:8324-8349`): `_body.y = 0`, `switchLayer(false)`, `flyingState = ON_GROUND (0)`, `flyerOff()` (removes `_flyer_cg` and `_flyer_front`), if walking `behaviorForFlying(RUN_NORMAL)`.
   HUD label returns to "Bay" for states 0 and 4 (`MiniMapCanvas.as:920-927`).
6. If the server refuses a landing (e.g. cooldown) the client stays in `PRE_LANDING`; the next walk end re-sends `stopFlying` (step 3).

### 4.10 Peers and scene entry

- A character already airborne when the view is created: scene / cData `isFlying` truthy -> `Creature.data` setter sets `flyingState = IN_THE_AIR` **without any tween** (`Creature.as:259-277`; the setter copies every key that exists as a property, so `flyerResCode`, `flyerFrontResCode`, `dressResCode`, `wingResCode`, `mountResCode`, `doubleFly`, `isFlying` all apply).
  `ItemContainer.addC` (`ItemContainer.as:82-97`) puts it on the fly layer, `CreatureView.gameObject` setter puts `_body.y = -100` (`CreatureView.as:10406-10409`), and `setCharGraphic` -> `flyerOn()` (`:9109-9119`).
- Maps with `TBL_MAP.flyable != 1`: `GameScene.sceneEnter` forces the own `flyingState = ON_GROUND` before building the view (`GameScene.as:234-237`); the server is not told by this code.
- Body reload while airborne (e.g. `onSetRes`): `setCharGraphic` runs `flyerOn()` again when `flyingState != ON_GROUND`, else `flyerOff()` (`:9107-9125`); then `wingOn()`, `fairyOn()`, `mountOn()`.
- Air battles: `BattleCreatureView` calls `flyerOn()` when `isAirBattle` and not double fly (`:9208-9215`).

### 4.11 Movement while flying

- Route building in the air passes **no hit layer**: `Player.routeTo` (`Player.as:1969-1990`), `Charactor.routeTo/closeTo` (`Charactor.as:72-80, 190-200`) set `hitTest = null` when state is `TAKING_OFF` or `IN_THE_AIR`; `ObjectMove.getRoute(..., null)` returns `[[x, y]]`, a straight line with no mask (`ObjectMove.as:35-37`).
  Landing is the only place the mask matters again (4.9).
- Speed: same `_speed = MOVE_SPEED_NORMAL = int(9 * 28 / 24) = 10` px per frame step (`CreatureView.as:126, 7821`); no flying-specific speed exists (no `_speed` write depends on `flyingState`). **inferred** (EnterFrameMove not decompiled).
- Height offset is purely visual: `_body.y = -100` (the logical `posX/posY` stay on the ground). Name / state sprites shift up by 80 (`setPosState`, `CreatureView.as:8186-8200`: `stateSprite.y = cg.y - h - 80`).
- Random encounters: `PlayerView.onWalking` / `checkBattle` call `cbom` / `cb` only when `flyingState == ON_GROUND || mapData.airSafe != 1` (`PlayerView.as:112, 144`).
- NPC layer 3 (sky NPCs) are visible only while airborne (`NPCView.as:395-401`).
- Group follower distance: `GROUP_FOLLOW_DISTANCE_FLYING 120` vs normal (`GamePredef.as:36`, `CreatureView.as:7620-7623`).
- Camera: `StageMain.globalCenterTo` uses different margins in the air (`StageMain.as:356`); `mapReady` applies `FLYING_ZOOM_RATE` when the player enters a map airborne (`StageMain.as:396-407`).

## 5. Rendering and appearance

### 5.1 How a costume changes the map body

- A costume is **not a layer**: it is the whole body. `DynamicItemContainer.addC` (`DynamicItemContainer.as:69-85`): if `isNaN(dressResCode) || dressResCode <= 0` -> keep `colorCode`; else if the view is on the class default or rebirth body (`isDefaultRes()` `CreatureView.as:10003`, `isRebirthRes()` `:9821`: `resCode == TBL_CLASS.resCodeMale|Female (|2)`) -> `colorCode = 0; setRes(dressResCode)`; else (a transform body is active) `setRes(resCode)`.
  Priority: **transform body > costume > class / rebirth body**.
- `CharactorView.setRes(code)` (`CharactorView.as:536-540`) = `gameObject.resCode = code; loadRes()`. `onSetRes` push is just this (per Go notes). Body art URL = `ResManager.getResUrlNoHash(resCode) + "_NEW.swf"` hashed (`CreatureView.as:9027-9028, 10505-10506`).
- Costume art code = `TBL_EQUIPT_TEMPLATE.resCodeMale` / `resCodeFemale` (by `player.gender`, `DressPanel.as:2786`, `DressDisplay.as:574`), decoded e.g. `2060100200042` -> `creature/NPC_CRE_200042.swf` (`decodeResCode`, checked with `packages/shared/src/resurl.ts`), same 8x8 labels as a class body.
- `setCharGraphic` end (`CreatureView.as:9078-9088`) for characters on the default / rebirth body: `dressResCode` NaN or `< 0` -> `equipOn(wp ...)` (weapon drawn); otherwise `equipOn(dressResCode, ..., dressFlag = true)` which only does `colorCode = 0` (`:7118-7127`) and draws nothing.
  **Binding quirk**: `DynamicItemContainer` treats `dressResCode <= 0` as "no costume" but `setCharGraphic` treats only `NaN` / negative as "no costume". A server value of **0** would therefore hide the weapon and zero the class colour tint without drawing a costume. Use "omit" (NaN) or a negative number (the legacy server sends -1 / -2) for none.
- `setColor` (`CreatureView.as:7176-7190`): `colorCode = 0` while `dressResCode > 0`.
- Weapon: drawn only on the class default / rebirth body and only when no dress code is set (above). Costume or transform hides it.
- Mount: `mountOn` returns unless `isRebirthRes() || isDefaultRes()` (`CreatureView.as:10554-10560`), so a visible costume / transform hides the mount (stock behaviour).
- Wing: `wingOn` returns when `WING_CLASS_OFFSET[resCode]` is undefined (`CreatureView.as:9731-9735`; 104 definitions, class bodies + older costumes). Costumes missing from the table lose wings in stock; the legacy client was patched (`dress-system.md:15`). Do not port the gate.
- Reapplication points: every body reload re-runs `flyerOn/flyerOff`, `wingOn`, `fairyOn`, `mountOn` (`:9107-9139`), and `CreatureShowView` (preview) additionally calls `mountOff` on `flyerOn` and `mountOn` on `flyerOff` (`CreatureShowView.as:86-123, 166-170`).
- Item facts (`data/TBL_EQUIPT_TEMPLATE`, checked in `E:\mcgame\docs\database\game_data\TBL_EQUIPT_TEMPLATE.json`): all 238 `kind 11` rows have `type 1100`, `position 21`; all 90 `kind 10` rows have `type 1000`, `position 14` (`GamePredef.ITEM_KIND_FLYER 10`, `ITEM_KIND_DRESS 11`, `ITEM_TYPE_FLYER_SUBTYPE 1000`, `ITEM_TYPE_DRESS_SUBTYPE 1100`, `GamePredef.as:1019-1020, 1155-1156`). Fashion tooltip omits the durability line (`TipEquip.as:1555`); flyer tooltip skips quality / prefix lines (`:1170-1228`).

### 5.2 Stat bonus panel (`DRESS_PANEL[11]`)

`DressPanel.updatePageOne` (`DressPanel.as:1487-1523`), purely client side:

```
totals = {1:0, 4:0, 5:0, 11:0}
for (id in dressInfo.book)            // key = dress id; value ignored (truthy)
  row = TBL_DRESS[id]                 // missing row -> skipped (adds prop 0 / num 0)
  for n in 1..4: totals[int(row['prop'+n])] += int(row['propNum'+n])
text = DRESS_PANEL[11] with hp = totals[1], phAtt = totals[4], mgAtt = totals[5], sp = totals[11]
```

Other prop ids present in a row land in `totals` but are never displayed. Seed data: every row uses props `1, 4, 5, 11`; amounts `100/25/25/10` (color 3) or `200/50/50/20` (color 4). This is a display value only; the real stat comes from server totals (`dress-system.md:19, 27`).

### 5.3 Flyer rendering

- Data: `flyerResCode` (= `TBL_EQUIPT_TEMPLATE.resCode`) is the main flyer art and `flyerFrontResCode` (= `wavCode`, only 8 of 90 flyers have one, e.g. template 1641 res `2070380000005` / wav `2070380100005`) is an optional overlay. Decoding with the shared decoder: `2070380000002` -> `equip/EQUIP_FLY_000002.swf`; wav `2070380100005` -> `EQUIP_FLY_100005`; URL word2 `380` = `FLY_` (`GamePredef.as:467, 8251`). Loaded as `<path>.swf_NEW.swf`.
- `flyerOn()` (`CreatureView.as:7483-7517`): returns if `flyerResCode` is NaN / <= 0; loads the art (or waits on `ResCacher complete -> flyerLoadCompleteHandler` `:10176-10195`); then same for `flyerFrontResCode > 0` (`flyerFrontLoadComplete`, `:7780-7793`).
- `setFlyerGraphic` (`:6896-6937`): new `CharactorGraphic`, copies `dir` and `behavior` from the body (`_cg`), plays `"<dir>-<behavior>"`, **placement `x = -midX, y = -footY`** (feet at the body origin, no per-flyer offset table), and `_body.addChildAt(_flyer_cg, 0)`: **under** the body (and under wing / weapon). Hides the Hồn Khí foot effect `_tepe_cg` while a flyer is shown (`:6907-6909`); `flyerOff` restores it (`:9346-9349`).
- `setFlyerFrontGraphic` (`:8056-8094`): placed the same way, `_body.addChild` (top of `_body`), **only while `flyingState != ON_GROUND`** at load time; it always plays `BH_BREATH_SLOW` regardless of movement (`:7311-7316`, `:10383-10388`).
- Animation: `behavior(b)` (`:7298-7328`): while `flyingState != ON_GROUND` the flyer plays `b % 8` (so run/walk loops on the flyer); the body is forced to `BH_BREATH_SLOW` when `b == BH_RUN_NORMAL` (and mount-run to mount-breath). `setDir` updates flyer and front too (`:10379-10388`).
  `behaviorForFlying(BH_BREATH_SLOW)` at take-off (`:7719-7773`) switches body + weapon + wing to breath (also with a mount, via `behavior`).
- Vertical offset: whole `_body` moves by -100 so flyer, body, wing, weapon, front all rise together; shadow / `posY` stay on the ground.
- Fake flyer: `setFakeFlyerDress(dressId, resCode, wavCode)` is a **server-side** state; the client only sends the codes of the chosen skin. The visible result arrives as `onFlyerOn` (Go note `dress-system.md:16`).
- Flyer removal: Flash has **no** flyer-off callback (`flyerOn` skips codes <= 0 and `CallBack.onFlyerOn` only sets when `resCode` is truthy, per Go notes `h5-sprites.md:198`), so the legacy server sends `onFlyerOn {cid, resCode: -1, wavCode: -1}`. In H5 we own the client, but peers' scene rows still need `flyerResCode "0"` to mean none.
- Layer summary inside `_body` (bottom -> top): Hồn Khí foot (`_tepe_cg`) / mount, **flyer**, wing (behind for dirs 0, 1, 7; in front otherwise, `coordinateWingPos` `:10288-10302`), body, weapon, **flyer front**, halo.

### 5.4 Double fly (wedding) - out of scope

`onBeginWeddingFly`, `doubleFly`, `weddingFlyer`, `FlyerView`, `DoubleFlyerManager` (`Creature.as:120-148`, `CreatureView.as:6920-6931, 7647-7650`). State 5 `FLYING_STATE_DOUBLE_FLY` is declared (`GamePredef.as:1781`) but never assigned in the files read. Port only if the wedding feature is ported.

## 6. Contract

All client RPCs go through `_core.remote.call("<name>", Responder|null, ...args)` unless stated. `RPC_DELAY` (`config/RPCConfig.as:11-43`) lists **no** dress or flying RPC, so the client never drops them (equipOn/equipOff are 1100 ms). Reply handlers all start with `if (arg == null) return`, so `null` / an error is silently ignored.

### 6.1 Dress RPCs (client -> server)

| RPC | Args (order, type) | Expects back | Call site |
|---|---|---|---|
| `checkSameDay` | none | `String` dressInfo (daily `extract` reset) | `DressPanel.as:2046` |
| `activeDress` | `dressId:Number`, `autoBuy:Boolean` | `String` dressInfo | `:2191` |
| `ensureBuyActive` | `dressId:Number` | `String` dressInfo | `:1578` (trigger unknown) |
| `recieveGoods` (sic) | `dressId:Number` | **no responder**; bag item via item pushes | `DressDisplay.as:624` |
| `exchangeRecipe` | `recipeId:Number` | `String` dressInfo | `RecipeItem.as:251` |
| `freeExtractRecipe` | none | `{dressInfo:String, recipeId:Number, recipeNum:int}` | `:2159` |
| `goldExtractRecipe` | none | same | `:1938` |
| `ssdExtractRecipe` | none | same | `:1718` |
| `tenExtractRecipe` | none | `{dressInfo, planArr:[{recipeId, num}]}` | `:1661` |
| `largessdExtractRecipe` | none | `{dressInfo, planArr:[{recipeId, num}]}` | `:1246` |
| `makeAllChips` | none | `String` dressInfo | `DressBag.as:684` |
| `transformRecipe` | `recipeIds:Array<Number>` (0..3, non-empty cells) | `{dressInfo, recipeId, recipeNum}` | `:1453` |
| `transformAllRecipe` | `recipeIds:Array<Number>` | `{dressInfo, produceArr:[{recipeId, recipeNum}]}` | `:1979` |
| `setFakeDress` / `unsetFakeDress` | `dressId`, `resCode` (gender-resolved `resCodeMale|Female`) | `String` dressInfo | `DressDisplay.as:581 / 577` |
| `setFakeFlyerDress` / `unsetFakeFlyerDress` | `dressId`, `resCode` (= equipt `resCode`), `wavCode` (= equipt `wavCode`) | `String` dressInfo | `DressDisplay.as:597 / 593` |
| `setDressHide` | `hide:Boolean` | `Boolean` or `-1` (refused) | `CharactorPanel.as:3914, 3918` |
| `setWingHide` | `hide:Boolean` | `Boolean` or `-1` | `CharactorPanel.as:4169` |

Notes: the two `unset*` calls also send the resCode (the Go handler ignores it for unset). `dressInfo` replies are strings; the client normalises them with `JSONUtil.JSONfy`.

### 6.2 Flying RPCs (client -> server)

| RPC | Args | Reply | Call site |
|---|---|---|---|
| `beginFlying` | none | none (state arrives as `onBeginFlying`) | `Creature.as:343` via dynamic proxy `remote.beginFlying()` |
| `stopFlying` | none | none (`onStopFlying`) | `CreatureView.as:8374, 10202` |
| `fixFlyState` | none | none | `Creature.as:177, 333` (follower; at most once per 30 s) |
| `udcr {id, route, x, y}` | route to the safe cell before landing | (movement pipeline) | `CreatureView.as:6954` |

### 6.3 Pushes

`system/CallBack.as` is a stub, so **no push body is verifiable in the decompile**. Names below exist in the real CallBack method list extracted from the SWF constant pool (`E:\mcgame\docs\research\2026-10-03_01_CLIENT_DATA_FILE_AND_CALLBACK_LIST_RESEARCH.md` lines 115-116, 202-203, 216, 220, 332, 416, 452, 501, 527-528, 550); payload shapes come from the Go notes (`dress-system.md:92-94`, `h5-sprites.md:163-168`, `movement-position.md`) and are **not** client-verified.

| Push | Payload (secondary source) | Client effect (verified part) |
|---|---|---|
| `onEquipOn` | `{cid, resCode, ee, ef, star, dressFlag}` | `dressFlag true`: `gameObject.dressResCode = resCode` (+ `colorCode = 0`, `CreatureView.equipOn` `:7118-7127`); `false`: weapon (`PlayerView.equipOn` also writes `wp/ee/ef/star`, `PlayerView.as:227-234`) |
| `onEquipOff` | `{cid, resCode, colorCode, dressFlag}` | `dressFlag true`: `dressResCode = -1`, restore `colorCode`, re-equip weapon (Go bytecode dump, `dress-system.md:92`) |
| `onSetRes` | `{id, res}` | `CharactorView.setRes(res)` (`CharactorView.as:536`) = reload the body |
| `onFlyerOn` | `{cid, resCode, wavCode}` | sets `flyerResCode` / `flyerFrontResCode` only when truthy, then `flyerOn()` (Go notes); `-1` = remove (no real off callback) |
| `onBeginFlying` / `onStopFlying` | `{id}` | `Creature.onBeginFlying()` / `onStopFlying()` (4.8 / 4.9) |
| `onFixFlyState` | (unknown) | exists in the callback list; body unknown |
| `onBeginWeddingFly` | (unknown) | wedding double fly |
| `onWingOn` / `onWingOff` | `{cid, resCode}` / `{cid}` | wing layer; also the `setWingHide` result |
| `onMountOn` / `onMountOff` | see `mount-system.md` | mount layer |
| `onUpdateDressList` | `(action, dressId, expiry)` | **mount** dress list, not Tủ Đồ (`mount-system.md:42`) |
| `resetDressHide` | unknown | present in the callback list (line 550); **no caller or definition in the decompile**; probably resets the `dressHide` checkbox / setting |
| `onMidNote` | string | generic centre-screen note; the Go server uses it for "Ghép thành công" (`makeAllChips`) and "Cần trang bị phi hành và đạt cấp 50 mới có thể bay" (`movement.go:324`) |
| `onRedMsg` | string | used by the Go server for the 5 s toggle cooldown text |
| `onUpdateDressInto` | dressInfo string | **not in the real CallBack list** (grep of the extracted list: only `onUpdateDressList`, `resetDressHide`); pushed only by the Go admin tool (`internal/infrastructure/adminhttp/player_action_dress.go:202`). `DressPanel.onUpdateDressInfo(String)` (`DressPanel.as:1912`) exists but nothing calls it in the decompile. Treat as **not a real client push** (open question 2) |

**Ordering that the client depends on (from reads, not from CallBack):**
- Costume change: `onEquipOn(dressFlag true)` / `onEquipOff(dressFlag true)` must precede `onSetRes`, because `onEquipOn` only stores `dressResCode` and `onSetRes` is what reloads the body (`dress-system.md:14, 94`). A scene rebuild reads `dressResCode` again (`DynamicItemContainer.as:69-85`), so a stale `dressResCode` resurfaces on the next map change.
- `onBeginFlying` for a view that does not exist yet is dropped (`getCharactor(id)` null per Go notes); peers entering later get `isFlying` in their scene row instead.
- Flyer codes must be set before `flyerOn()` runs: `onBeginFlying` calls `flyerOn()` using the `flyerResCode` already on `gameObject`; `onFlyerOn` after take-off redraws only if the code is truthy.
- Static analysis cannot prove the relative order of `onBeginFlying` for self vs `onBeginFlying` for group members.

### 6.4 `dressInfo` object

Stored string `Player.dressInfo` (`Player.as:168`) is set from cData at login `dressInfo = JSONUtil.JSONfy(data.dressInfo)` (`Player.as:2233`) and by every responder. After `JSONfy` all scalars are strings (`JSONUtil.as:30-45`: strips `"` and `'`, then wraps every `\b\w+\b` token, signs included, in `"` and restores `"."`), then `JSON.decode` (as3corelib) is applied on each read.

| Key | Type (as read) | Meaning / readers |
|---|---|---|
| `book` | `{ "<dressId>": truthy }` | activated dresses (both types). Read: stat panel `DressPanel.as:1497`, `DressDisplay.as:318-327, 460-475, 546-551`, `DressItem.as:250-260`, `DressItemRenderer.as` |
| `recipe` | `{ "<recipeId>": count }` | owned sets (TBL_RECIPE `type 1`) and chips (`type 2`) in one dict; entries `> 0` only are shown (`DressBag.as:215-229`). `RecipeCell.caculateAmount` also reads it (`RecipeCell.as:219-232`) |
| `bag.crystal`, `bag.jewel` | number | Pha Lê Ma Pháp / Bảo Châu Vĩnh Hằng (`DressPanel.as:1343-1357, 1550-1558`; `DressItemRenderer.as:152-190`) |
| `extract` | number | free draws used today; counter = `max(0, 1 - extract)` (`DressPanel.as:2826-2833`) |
| `score` | number | Điểm thưởng (`DressPanel.as:2834`, `RecipeExchangePanel.as:566-576`) |
| `fakeDressId` | number | active fake costume (`DressDisplay.as:472, 575`) |
| `fakeFlyDressId` | number | active fake flyer (`DressDisplay.as:472, 591`) |

Constraints for a faithful port: never put free text, dates (hyphens) or the server-private `day` key in this string (`dress-system.md:11`). Because of `JSONfy`, numeric `0` values are the string `"0"` (truthy in AS3 `if ("0")`... **inferred**: AS3 treats a non-empty string as true, so `book: {"1001":"0"}` would still count as activated; send only activated ids).
`player.shishangdian` is **not** part of `dressInfo`; it is a separate cData Number (`Player.as:55, 2242`) updated by `onUPP`.

### 6.5 Static tables (client reads)

| Table (id) | Key | Columns read | Readers |
|---|---|---|---|
| `TBL_DRESS` (104, `GamePredef.as:590`) | `id` | `type` (1 fashion, 2 flyer), `isOpen`, `position` (sort), `name`, `color`, `equiptId`, `recipeId`, `num1` (Pha Lê), `num2` (Bảo Châu), `prop1..4`, `propNum1..4` | all dress classes; 93 rows (71 + 22), all `isOpen 1`; columns confirmed in `docs/database/game_data/TBL_DRESS.json` |
| `TBL_RECIPE` (105) | `id` | `type` (1 set, 2 chip), `kind` (1 fashion, 2 flyer, -1 chips), `iconCode`, `desc`, `name`, `color`, `money` (set price in Điểm thưởng), `position` | `DressBag`, `RecipeCell`, `TipRecipe`, `RecipeExchangePanel`, `RecipeItem`; 185 rows. Client never reads `num` / `product` / `isOpen` (merging chips is server-only) |
| `TBL_RECIPE_PLAN` (106) | - | **not read by the client** (grep: no use outside `GamePredef.as`) | 362 rows; server-side draw data |
| `TBL_EQUIPT_TEMPLATE` (19) | `id` | `name`, `color` (card name colour), `resCodeMale` / `resCodeFemale` (costume body), `resCode` / `wavCode` (flyer), `iconCode` (slot), `position`, `kind`, `type`, `bindPropNum` | `DressItem`, `DressPanel.dressChangeHanlder / flyerChangeHanlder / treeSelectHanlder`, `DressDisplay.activeHandler` |
| `TBL_MAP` | map id | `flyable` (1 = may fly), `airSafe` (1 = no `cbom` in the air), `safeX`, `safeY` | `GameScene.as:234`, `PlayerView.as:112, 144`, `CreatureView.as:6944` |

### 6.6 Constants

| Constant | Value | Source |
|---|---|---|
| `FLIGHT_HEIGHT` | 100 | `GamePredef.as:1775` |
| `FLYING_STATE_*` | 0 ON_GROUND, 1 TAKING_OFF, 2 IN_THE_AIR, 3 PRE_LANDING, 4 LANDING, 5 DOUBLE_FLY | `:1776-1781` |
| `C_FLYING_ZOOM_RATE` / `C_FLYING_PLAYER_ZOOM_RATE` | 0.7 / 0.9 (`FLYING_ZOOM_RATE` / `FLYING_PLAYER_ZOOM_RATE` default the same, forced to 1 when `flyEffect` is off, `:11020-11023`) | `:1786-1789` |
| `GROUP_FOLLOW_DISTANCE_FLYING` | 120 | `:36` |
| `DRESS_CRYSTAL_PRICE` / `DRESS_JEWEL_PRICE` | 1 / 5 vàng | `:6809-6810` |
| `SLOT_SID_DRESS` / `SLOT_SID_WING` | 21 / 22 | `:1177-1178` |
| Equip position of flyer | 14 (`eq14.acceptPos [14]`, template `position 14`) | `CharactorPanel.as` bindings, `TBL_EQUIPT_TEMPLATE` |
| `flyBtn` throttle | 3000 ms client, 30 s for `fixFlyState` | `MiniMapCanvas.as:1694-1709`, `Creature.as:174` |
| `RES_URL_WORD2_FLY` | 380 -> prefix `FLY_` | `GamePredef.as:467, 8251` |

## 7. Gating that exists (and does not) on the client

- Take-off: only `ON_GROUND` state, not a non-leader group member, not `taskSweep`, HUD 3 s throttle. **No client check of level 50, flyer equipped, map `flyable`, cooldown, battle.** Those messages (`Cần trang bị phi hành và đạt cấp 50 mới có thể bay`, `Bản đồ này cấm bay.`, 5 s cooldown text) are server texts in the legacy Go server, not Language.as constants. `MINIMAPCANVAS_U[13]` is the only client string about the level, and it is unreferenced.
- Landing: only `IN_THE_AIR`, group rule, `taskSweep`; the walk-to-safe-cell is client side (the server only sees `udcr` + `stopFlying`).
- Auto-grounding on non-flyable maps: client-only (`GameScene.sceneEnter`), no RPC.
- Dress: no client gating of activate / exchange / draws / transform counts; all failures surface as a null reply (silent) or as server texts. Fake look buttons need `book[id]`; "Nhận" needs `book[id]` (else `DRESS_PANEL[35]`).
- Hide checkboxes: `-1` reply = refused.

## 8. Proposed shared types (`packages/shared/src/protocol.ts`, or a sibling re-exported from `index.ts`)

Keep RPC / push names and original field names (including `recieveGoods`, `acountLv`-style typos). Resource codes are strings. Suggested new file `packages/shared/src/dress.ts`:

```ts
// Tủ Đồ (dress) + Phi hành (flight) wire contract. Names follow the Flash client (typos kept).
export const DRESS_TYPE = { FASHION: 1, FLYER: 2 } as const;
export const RECIPE_TYPE = { SET: 1, CHIP: 2 } as const;
export const RECIPE_KIND = { FASHION: 1, FLYER: 2 } as const;
export const FLYING_STATE = { ON_GROUND: 0, TAKING_OFF: 1, IN_THE_AIR: 2, PRE_LANDING: 3, LANDING: 4, DOUBLE_FLY: 5 } as const;
export const POSITION_FLYER = 14;
export const POSITION_DRESS = 21; // wing is 22
export const FLIGHT_HEIGHT = 100;
export const FREE_EXTRACT_TIME = 1;

/** Object form of the legacy `dressInfo` string; our client reads it typed, same field names. */
export interface DressInfo {
  book: Record<string, 1>;          // activated dress ids
  recipe: Record<string, number>;   // recipeId -> count (sets and chips)
  bag: { crystal: number; jewel: number };
  extract: number;                  // free draws used today
  score: number;                    // Điểm thưởng
  fakeDressId: number;              // 0 = none
  fakeFlyDressId: number;           // 0 = none
}

export interface RecipeDrop { recipeId: number; recipeNum: number; }
export interface DressDrawResult extends RecipeDrop { dressInfo: DressInfo; }                 // free / gold / ssd, transformRecipe
export interface DressTenDrawResult { dressInfo: DressInfo; planArr: { recipeId: number; num: number }[]; } // ten / largessd
export interface DressTransformAllResult { dressInfo: DressInfo; produceArr: RecipeDrop[]; }  // transformAllRecipe

// RPC argument tuples (call(method, ...args))
export type ActiveDressArgs = [dressId: number, autoBuy: boolean];
export type EnsureBuyActiveArgs = [dressId: number];
export type RecieveGoodsArgs = [dressId: number];            // no reply expected
export type ExchangeRecipeArgs = [recipeId: number];
export type TransformArgs = [recipeIds: number[]];            // 0..3 ids, empty cells omitted
export type SetFakeDressArgs = [dressId: number, resCode: string];
export type SetFakeFlyerDressArgs = [dressId: number, resCode: string, wavCode: string];
export type SetHideArgs = [hide: boolean];                    // setDressHide / setWingHide -> boolean | -1

// Appearance fields on scene / login character rows
export interface CharacterLookFields {
  dressResCode?: number;            // omit or < 0 = none; NEVER 0 (CreatureView.setCharGraphic quirk)
  flyerResCode: string;             // "0" = none
  flyerFrontResCode: string;        // "0" = none (template wavCode)
  isFlying: boolean;                // true only on a flyable map
  doubleFly: false;
}

// Pushes
export interface BeginFlyingPush { id: number; }             // onBeginFlying
export interface StopFlyingPush { id: number; }              // onStopFlying
export interface FlyerOnPush { cid: number; resCode: string; wavCode: string; } // -1 / "-1" = remove (legacy has no off push)
export interface SetResPush { id: number; res: string; }     // onSetRes
export interface DressEquipPush { cid: number; resCode: string; ee?: number; ef?: boolean; star?: number; colorCode?: number; dressFlag: boolean; }
```

`EquipOnPush` / `EquipOffPush` in `packages/shared/src/appearance.ts` currently type only `dressFlag: false`; widen to `boolean` (or add `DressEquipPush`) when the costume path is ported.

Owners: server `server/src/modules/dress/` (new: `dress.rpc.ts`, `dress.service.ts`, `dress.schema.ts` or a feature-state row; draws / pools are in the server research doc) and `server/src/modules/scene` for `beginFlying` / `stopFlying` / `fixFlyState` + scene-row fields; look sync lives next to `inventory/weapon-look.service.ts`. Client: `client/src/ui/` (Tủ Đồ window, Đổi bộ window, hide boxes) and `client/src/game/` (`Actor.setFlying`, flyer layer, `CharacterController` look pushes, HUD fly button).

### Delta vs this repo (checked 2026-11-07)

- `packages/shared/src/appearance.ts` has only weapon `EquipOnPush` / `EquipOffPush` (`dressFlag: false`). No dress / flyer / flight types exist in `packages/shared`.
- `packages/shared/src/settings.ts` already carries `dressHide`, `wingHide`, `flyEffect` (labels `Ẩn thời trang`, `Hiệu ứng bay`).
- `server/src` has no `beginFlying`, `stopFlying`, `fixFlyState`, `isFlying`, `flyable`, `flyerResCode`, `dressInfo`, `setDressHide`, `setWingHide` (grep over `server/src`, `client/src`, `packages/shared/src`). `onSetRes` is only used by buff / VIP transform / Mê Huyễn.
  `server/src/modules/inventory/equipment.service.ts` equips by template `position` (slotIndex = position - 1), so fashion (21) and flyer (14) already equip as generic slots but trigger no look push (`weaponChanged` only checks position 3).
- `data_tbl_dress` / `data_tbl_recipe` / `data_tbl_recipe_plan` are imported (seed names); only `recipe_plan` has a loader (`gamedata.service.ts:176`, forge). The client needs TBL 104 / 105 / 19 columns served through gamedata.
- Asset coverage seen in `client/public/sheets` (working tree, pending sheet changes): 18 `EQUIP_FLY_*` sheets (36 files) versus 46 distinct flyer art codes in `kind 10` templates (resCode + wavCode); 176 `NPC_CRE_2*` sheets versus costume bodies referenced by 238 `kind 11` templates (126 referenced codes have no sheet). Flyer sheets use anim keys `0-0 .. 7-7` (64 clips). Verify before relying on the numbers.
- `h5-client.md` (legacy) says the HUD fly button appears only when `flyerResCode != "0"` and the map is flyable. That is an H5 design choice; the Flash button is always present and ungated (4.8).

## 9. Open questions

1. `DressPanel.dressActiveValidate` (the buy-and-activate Alert, `ensureBuyActive`) has no caller in the decompile and `CallBack.as` is a stub. If a push triggers it, its name is not in the extracted CallBack list (no match for `Dress...` except `onUpdateDressList`, `resetDressHide`). Decide in H5 whether `activeDress` shortage opens this dialog client-side (what `h5-growth.md` assumes).
2. `onUpdateDressInto` (Go admin push) and `onUpdateDressInfo` do not appear in the real CallBack method list; the legacy admin tool may therefore never have refreshed an open client. `resetDressHide` exists in the list with unknown payload / effect.
3. `EnterFrameMove` is not decompiled: exact take-off / landing duration (assumed 50 frames, about 2.1 s at 24 fps) and whether `EFFECT_END` fires when `stopPlayingFlying` / a new `playFlying` interrupts the tween (`CreatureView.as:8449-8462`).
4. Hotkey F (tooltip `MINIMAPCANVAS_U[17]`) has no handler in the decompile; presumably in a non-decompiled key manager.
5. Whether a flying character really keeps the same walk speed: only `MOVE_SPEED_NORMAL` is used in `CreatureView`, but `EnterFrameMove` internals are unknown.
6. Push payload bodies (`onEquipOn/Off`, `onSetRes`, `onFlyerOn`, `onBeginFlying`) are Go-side bytecode readings, not client-verifiable here. Ordering "dress flag push before `onSetRes`" is a requirement derived from consumers, not provable from the stub.
7. `Core.updateSetting("dressHide")` falls through into the `flyEffect` branch (`Core.as:1584-1607`). Real behaviour or decompiler artefact; harmless visual side effect while flying either way.
8. `onCheckSameDay` always writes "Số lần：1" (`DressPanel.as:2036`); the H5 panel should show `max(0, 1 - extract)` instead. Confirm the owner wants the fix rather than parity.
9. `JSONfy` side effects on a numeric-0 or hyphenated value inside `dressInfo` are **inferred** from the regex, not run. Our TS client will not use `JSONfy`, so only the Flash-compat note matters.

## 10. Verification checklist

- Paths: all `.as` files above were opened or grepped in this session (`DressPanel`, `DressDisplay`, `DressBag`, `DressLogic`, `DressItem`, `DressItemRenderer`, `RecipeItem`, `RecipeExchangePanel`, `RecipeAlertFree/Ten`, `RecipeCell`, `CharactorPanel`, `MiniMapCanvas`, `Creature`, `CreatureView`, `CreatureShowView`, `DynamicItemContainer`, `ItemContainer`, `GameScene`, `ObjectMove`, `Core`, `Player`, `GamePredef`, `Language`).
- Secondary sources (not client): `E:\mcgame\docs\memory\{dress-system,dress-draw,mount-system,movement-position,h5-sprites,h5-growth}.md`, the 2026-10-03 callback list research, `E:\mcgame\internal\presentation\rtmp\handlers\scene\movement.go:306-401` (push shapes and server texts), `docs/database/game_data/*.json` (column names and counts), `packages/shared/src/resurl.ts` (code decoding, run through `tsx`).
- No `.as` edits are proposed.
