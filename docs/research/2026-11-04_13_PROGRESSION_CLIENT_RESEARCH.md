# M7 Progression panels: client research (titles, achievements, Than Khi, Tinh Cung, astrology, Hac Dieu Thach, war sprite, monster heart, magic crystal, lighter systems)

Scope: decompiled Flash client at `D:\mcgame\docs\client` (read-only). All paths below are relative to it unless prefixed.
Facts carry `file:line` from an actual read. **inferred** = deduced (usually from a panel's public `on*` method or a
Go note) and not provable from the client alone. Go notes in `D:\mcgame\docs\memory\*.md` were used as hints and checked
against the client; contradictions are called out in "Corrections to the Go notes".

Known decompile gaps that matter here:
- `system/CallBack.as` is an empty stub, so every push body and push *name* is invisible. Payloads are derived from the
  panel methods that consume them (usually public `on*` / `update*` methods of the panel). Push names come from the Go notes
  and are marked **inferred** unless the client calls the method by that name.
- `view/view/compDragable/HeiYaoShiPanel.as` is an aborted stub (20 lines). Only `HeiYaoShiPoint.as`, `HeiyaoshiAlertPanel.as`
  and `HeiYaoShiConfig.as` are readable, so the main Hac Dieu Thach panel flow is partly unknown.
- `view/view/compDragable/BagPanel.as` is aborted; `_core.view.getUI(PANEL_BAG).goldLockFlag` is only seen from callers.

## 1. Summary

Progression panels are a set of independent feature panels that either (a) add flat/percent bonuses to the character
stat pipeline (title buff, Than Khi, Tinh Cung, Hac Dieu Thach, war sprite, monster heart, magic crystal, Ma Phap Bi Tran,
awaken, train soul, medals, stone seal) or (b) are pure collection/reward UIs (achievements, astrology, mystery treasure).
Stats reach the character panel in only two ways visible in the client: an `onUPP`-style refresh that sets
`player.property`, and `CharactorPanel.onInitViewProp(property)` (`view/view/compDragable/CharactorPanel.as:5480-5486`) which
**replaces** `_core.player.property` wholesale and calls `updateView()`. Everything else (gear, buffs) is server-computed.
Most progression RPCs are fire-and-forget (`remote.call(name, null, ...)`); the UI then depends on a server push
(`updateWSPPanel`, `updateMonsterHeartPanel`, `onInitMagicCrystalData`, ...) or on a Responder reply.

Entry points: HUD system bar (achievements, `SystemBarCanvas.as:1599`), character panel buttons/tabs (titles `btnTitle`
`CharactorPanel.as:5648-5651`, Than Khi tab, Tinh Cung tab, awaken `:4868-4872`, Hon Khi/decorate `:6520-6535`), the right-hand
activity icon bar `view/view/compMain/ActivityCanvas.as` (Hac Dieu Thach, war sprite, monster heart, magic crystal,
astrology, medal, Ma Phap Bi Tran, stone seal, mystery furnace, explorer medal, pet stone), and the equipment-function
panel `EquiptFuncPanel.as` (all Than Khi operations).

## 2. Key files

| Area | File | Role |
|---|---|---|
| Titles | `view/view/compDragable/TitleSelectPanel.as` | 260x385 panel, two tabs, `gtl`/`setTitle`/`setActTitle` |
| Titles | `view/view/compDragable/TitleCustomPanel.as` | custom title text (`setCustomTitle`), opened from Tinh Gioi |
| Titles | `view/view/compGameStage/CharactorView.as` | name plate: `_textTitle` (above), `_actTile` (below), `_vipTitle` |
| Titles | `system/Core.as:987,1780,2036` | `getTitleByBuffId`, `checkTitleShow`, `checkTitleType` |
| Titles | `view/view/compMain/LongBuffCanvas.as` | title buff shown/removed as long-buff row 0 |
| Achievements | `view/view/compDragable/AchievementPanel.as` | overview + per-kind lists, 5 per page |
| Achievements | `view/view/comp/AchievementDetail.as` | one row; claim button -> `getAchieveAward` |
| Achievements | `view/view/compDragable/AchievementComparePanel.as` | other player's log (watching) |
| Than Khi | `view/view/compDragable/EquiptFuncPanel.as` (14373 lines) | MW tab group (case 4) tabD 0..7 |
| Than Khi | `view/view/compDragable/CharactorPanel.as` | MW tab (`MWCanvas`, slots 15..20), repair, Tinh Cung tab |
| Than Khi | `view/view/compDragable/VipSuccinctPanel.as` | VIP batch succinct popup (`onSureSuccinctMW(1, saveFlag)`) |
| Than Khi | `view/view/comp/SkillUseSlot.as:455`, `Slot.as:770` | `addMagicWeaponSkill`, mouse-repair `magicWeaponAutoRepair` |
| Tinh Cung | `CharactorPanel.as` (star1..star12 `StarIcon`), `StarAdditionPanel.as`, `StarSpeedUpPanel.as`, `StarExchange.as`, `StarEffectPanel.as`, `comp/StarIcon.as`, `comp/TipStarReq.as` | zodiac level-up |
| Astrology | `view/view/compDragable/AstrologicPanel.as` | 12 elements pick game |
| Hac Dieu Thach | `HeiYaoShiPoint.as`, `HeiyaoshiAlertPanel.as`, `HeiYaoShiConfig.as` | per-point button, gold confirm, static tables (panel itself is a stub) |
| War sprite | `view/view/compDragable/WarSpritePanel.as` (3573 lines) | 2 pages (upgrade / evolve) x 8 sprites |
| Monster heart | `MonsterHeartPanel.as` (5360), `comp/MonsterHeartSlot.as` | 5 boxes x 7 holes, fuse, resolve, box upgrade |
| Magic crystal | `comp/MagicCrystalCanvas.as`, `compDragable/MagicCrystalPanel.as` | 16 energy pools, 4 per page |
| Lighter | `MysteryFurnace.as`, `DecoratePanel.as`, `TrainSoulPanel.as`, `AwakenPanel.as`, `AwakenSkillBox.as`, `MedalPanel.as`, `ExplorerMedalPanel.as`, `StoneSealPanel.as`, `StoneSealBoreCanvas.as`, `MagicArrayPanel.as`, `FairyManagerPanel.as`, `comp/StarInstanceMap.as` | see section 9 |
| Data | `object/Player.as:2190-2270`, `object/Charactor.as` | player fields set from login `cData` |
| Data | `config/Language.as`, `predef/GamePredef.as` | strings, TBL ids, formula tables |

## 3. Language strings (exact Vietnamese)

Titles (`Language.as`): `TITLESELECTPANEL_U[2]` "Danh hiệu" (title bar), `[3]` "Danh hiệu vĩnh viễn" (tab 0), `[4]` "Danh hiệu có thời hạn"
(tab 1), `[0]` "Thiết lập danh hiệu", `[1]` "Hủy danh hiệu hiện tại", `[5]` "Hiển thị danh hiệu", `[6]` "Hủy hiển thị";
`TITLESELECTPANEL_S[0]` "Nhận được danh hiệu {tData.n}!" (f=1), `[2]` "Nhận được danh hiệu {tData.n} cao hơn!" (f=2), `[4]` "Nhận được danh hiệu {tData.n}!"
(f=3), `[6]` "Bạn đã có danh hiệu tương đồng!" (f=4), `[7]` "Bạn đã có danh hiệu cùng loại cấp cao hơn!" (f=5), `[8]` "Vui lòng chọn 1 danh hiệu",
`[9]` "Danh hiệu này đang hiển thị", `[10]` "Giới Thiệu Danh Hiệu", `[11]` "Thuộc Tính Danh Hiệu", `[12]` "Không";
`CHARACTORPANEL_S[35]` "Bật danh hiệu để tăng thuộc tính cho nhân vật"; `CHARACTORPANEL_U[1]` "D.hiệu" (button).
Achievements: `ACHIEVEMENTPANEL_U[0]` "Thành tựu", `[1]` "Tổng quan", `[2]` "Điểm thành tựu {point}", `[3]` "Thành tựu gần đây",
`[4]` "Hiển thị tổng quan", `[5]` "Tổng tiến độ", `[6]` "* Giữ phím shift và nhấn Thành tựu để tạo link", `[7]` "Quan sát thành tựu",
`[8]` "Thành tựu bản thân", `[9]` "Thành tựu {name}"; `MEDAL_P[31]` "Nhận thưởng" (claim button label, `AchievementDetail.as:574,890`);
kinds `GAMEPREDEF_S[423..428]` = "Cá nhân", "Pet", "Giao lưu", "PVP", "PVE", "Sinh hoạt" (`GamePredef.as:9564-9569`).
Than Khi (`EQUIPTFUNCPANEL_U`): `[158]` "Thăng cấp", `[159]` "Phân giải", `[160]` "Sửa chữa", `[205]` "Tẩy luyện thần khí" (also list label
for tab 3, `listArr1[3]`), `[161]` "Tái thiết kỹ năng", `[176]` "Chuyển thuộc tính", `[188]` "Tái lập thuộc tính", `[237]` "Tăng Vòng Thần Khí";
`[165]` "Điểm thần tu cần: ", `[173]` "Đã thăng cấp cao nhất!", `[174]` "Thần khí phải khóa!", `[192]` "Điểm thần tu cần: ", `[193]` "Số Tinh Hồn Thạch cần: ",
`[194]` "Điểm thuộc tính hiện tại: ", `[195]` "Giới hạn thuộc tính: ", `[208]` "Đá Tẩy Luyện:", `[209]` "Cần {num} Đá Tẩy Luyện", `[210]` "Khóa", `[211]` "Tẩy",
`[212]` "Lưu", `[213]` "Tẩy H.Loạt", `[214]` "Kích hoạt", `[215]` "Không có thuộc tính để tẩy luyện", `[216]` "Cần {num} vàng để kích hoạt chức năng này, xác nhận kích hoạt？",
`[221]` "Chỉ có thần khí phụ khóa phẩm chất xanh lam mới có thể tẩy luyện", `[225]` "Cần người chơi cấp {level} mới có thể kích hoạt thuộc tính thần khí này",
`[227]` "Không đủ Đá Tẩy Luyện", `[230]` "Cần kích hoạt 1 dòng thuộc tính", `[239]` "Pha Lê Thần Giới", `[240]` "Điều kiện\n1.Thần khí chính vòng 7\n2.Cấp độ thần khí là 20\n3.Thuộc tính thần khí đạt max",
`[241]` "Thần khí đã đạt vòng 8", `[242]` "Bổ sung"; `EQUIPTFUNCPANEL_S[76]` "Sửa thần khí thành công!", `[77]` "Phân giải thành công, nhận {itemNum} {itemName}!",
`[78]` "Thăng cấp thần khí thành công lên cấp {level}!", `[79]` "Vui lòng chọn kỹ năng thần khí cần thiết lập lại!", `[80]` "Danh sách kỹ năng đang làm mới, vui lòng chờ.",
`[81]` "Chọn kỹ năng thiết lập lại", `[82]` "Vui lòng đặt vật phẩm chính xác", `[86]` "Tái thiết lập kỹ năng thần khí thành công, nhận được kỹ năng: {skillName}",
`[95]` "Sau khi chuyển thuộc tính thì thần khí bên trái sẽ mất, thần khí bên phải sẽ khóa, xác nhận tiến hành chuyển thuộc tính thần khí?", `[109]` "Đặt thần khí chính！",
`[110]` "Điểm thần tu không đủ！", `[111]` "Không đủ Tinh Hồn Thạch！", `[115]` "Phải là thần khí khóa", `[116]` "Cấp độ thần khí thấp nhất là 5", `[132..134]` "Thần khí cấp 13/16/19 cần nhân vật đạt cấp độ 120/130/140.",
`[145]` "Đặt thần khí chính", `[146]` "Thần khí chính không đủ điều kiện tăng vòng", `[147]` "Không đủ Pha Lê Thần Giới", `[148]` "Thần khí chính đã ở vòng 8",
`[151]` "Số Pha Lê Thần Giới cần：{itemNum}\nĐiểm thần tu cần：{spiritNum}\nTỉ lệ thành công：{rate}", `[180]` "Để tiếp tục thăng cấp nhân vật cần đạt cấp 100", `[181]` "Xác nhận mở tất cả túi?";
help texts `[90..93,96,112,143,144]` (full text read at `Language.as:1219-1272`); `CHARACTORPANEL_S[62]` "Cần đạt cấp 50 mới có thể trang bị thần khí", `[77]`/`[78]`/`[79]`
(repair help, "Không đủ Thâm Lam Tinh, cần {num} Thâm Lam Tinh", "Độ bền thân khí chưa giảm, không thể sửa chữa!"), `CHARACTORPANEL_U[32]` "Th.khí", `[33]` "TK\n chính", `[34]` "TK\n phụ", `[45]` "Thần khí",
Vong labels `GAMEPREDEF_S[412..419]` "[Vòng 1]".."[Vòng 8]".
Tinh Cung: `CHARACTORPANEL_U[47]` "Tinh Cung", `[48]` "Tăng tư chất", `[49]` "Bắt đầu tu luyện", `[50]` "Tăng tốc hấp thu", `[51]` "Hiệu quả tăng cấp Tinh Cung：", `[59]` "Cấp độ Tinh Cung：",
`[60]` "Hủy tu luyện", `[56]` "Tư chất Cung："; `CHARACTORPANEL_S[65..76]`: `[68]` "Hoàn hành hấp thu Lực Tinh Tú", `[69]` "Không có Cung đang thăng cấp", `[70]` "Cung chọn chưa thăng cấp",
`[71]` "Cấp độ Tinh Cung là tổng cấp độ các Cung", `[72]` "Đang tu luyện：{name}", `[73]` "Cấp 80 trở lên mới kích hoạt được hệ thống Tinh Cung", `[74]` "Không có Cung đang tu luyện",
`[75]` "'{name}'không đang tu luyện，không thể hủy bỏ", `[76]` "Xác nhận hủy bỏ tu luyện của '{name}'？"; `STAR_ADD_PANEL_U[1..12]` B.Dương, K.Ngưu, SO Tử, Cự Giải, Sư Tử, Xử Nữ, Th.Bình, Hổ Cáp, N.Mã, Ma Kết, B.Bình, S.Ngư;
`STAR_ADD_PANEL_U[13]` "Cấp Độ Cung", `[14]` "Tư Chất Cung", `[15]` "Kết quả cuối", `[16]` "Tỷ Lệ Thành Công", `[17]` "Tăng", `[18]` "Bạc tiêu phí：", `[19]` "Mua";
`STAR_ADD_PANEL_S[0]` "Tăng tư chất thành công", `[1]` "Tăng tư chất thất bại", `[2]` "Bạn chưa có Hoa Tinh Tú，hãy tìm Hoa Tinh Tú đặt vào", `[3]` "Chọn 1 Tinh Cung", `[4]` "Chọn lượng Hoa Tinh Tú muốn dùng", `[6]` "Đặt Hoa Tinh Tú";
`STAR_SPEED_UP_PANEL_S[0..4]`, `STAR_EXCHANGE_PANEL[0]` "Đổi Tinh Toái", `[5]`, `[6]` "Xác nhận đổi {num} {name} thành {name1}?", `[7]` "Đổi thành công {num} {name}", `[8]` "Đổi thất bại".
Astrology: `ASTROLOGIC_PANEL_U[0]` "Năng Lượng Tự Nhiên", `[15]` "Công Thức Nguyên Tố hôm nay", `[18]` "Làm Mới", `[19]` "Thu thập", `[21]` "Miễn phí Làm Mới: num1/num2",
`[22]` "Làm Mới mất: num vàng", `[23]` "Miễn phí Thu thập: num1/num2", `[24]` "Thu thập sẽ Tiêu hao:num vàng", `[33]` "Thu thập sẽ tiêu phí num vàng, Xác nhận?", `[34]` "Làm Mới sẽ tiêu phí 5 vàng, Xác nhận?",
`[35]` "Nhìn Trộm công thức sẽ tiêu phí num vàng, Xác nhận?", `[36]` "Xem", `[38]` "Cách Chơi", `[39]` "Thu thập nguyên tố theo công thức thứ tự sẽ nhận thưởng, cứ 12h trưa mỗi ngày sẽ làm mới công thức",
`[40]` "Hoàn thành c.thức bất kỳ đầu tiên sẽ x10 ph.thưởng!", `[41]` "Thu thập Ng.Tố 5 thì Ng.Tố 1 sẽ tự mất", `[45]` "Chọn Nguyên Tố cần thu thập", elements `[1..12]` Thổ, Diệm, Thủy, Điện, Băng, Thánh, Ám, Lôi, Phong, Quang, Hỏa, Sương.
Hac Dieu Thach `HEIYAOSHI_PANEL[0]` "Hắc Diệu Thạch Trận", `[3]` "Xác nhận dùng {num} Hắc Diệu Thạch kích hoạt góc này?", `[4]` "Không đủ Hắc Diệu Thạch, xác nhận dùng {num} vàng kích hoạt điểm này?",
`[5]` "…Chưa Kích Hoạt…Kích Hoạt cần{num} Hắc Diệu Thạch" (stage 1 tooltip), `[23]` same for stage 2 "T.Hoa H.Diệu Thạch" (`Language.as:8357,8739`, used in `HeiYaoShiPoint.as:114-117`), `[11]`/`[12]` "Mất： {num} Hắc Diệu Thạch" / "Nhận：…".
War sprite `WAR_SPRITE[0]` "Chiến Hồn Bạo Nộ", `[1]` ["Thăng Cấp","Tiến Hóa"], `[2]` "Thuộc tính Chiến hồn", `[3]` "Tổng Thuộc tính tăng:", `[8]` "Cấp:Lv{num}", `[9]` "Dũng Khí Thạch cần:{num}", `[10]` "Dũng Khí Thạch có:{num}",
`[17]`/`[18]` "Ý Chí Thạch cần/có:{num}", `[25]` "Xác nhận dùng {num} Vàng để thăng cấp Chiến Hồn?", `[26]` "…tiến hóa Chiến Hồn?", sprite names `[11..16,23,24]`; `"Đã Max Cấp"`, `"(Cấp sau:+…)"` inline (`WarSpritePanel.as`).
Magic crystal `MAGIC_CRYSTAL_PANEL[0]` "Pha Lê Ma Thuật", `[1]` "Pha Lê Vĩnh Hằng không đủ", `[2]` "Pha Lê Cực Hạn không đủ", `[3]` "Bụi Ảo Năng không đủ", `[4]`/`[5]`/`[6]` confirms for activate / raise cap / recover, `[8]` "VV", `[9]` "Tạm", `[10]` "Nạp", `[11]` "Thu hồi", `[12]` "Kích hoạt", `[13]` "Pha Lê Vĩnh Hằng：", `[14]` "Pha Lê Cực Hạn：", `[18]` "Bụi Ảo Năng：".
Monster heart: `Language.MONSTER_HEART[4,6,7,13,18]` plus inline Vietnamese ("Không đủ Tâm Tinh Thạch sẽ tự động dùng vàng để mua?", "Dung luyện thành công"/"Dung luyện thất bại", "Kết thúc dung luyện toàn bộ dung luyện Ma Tâm", "Đã max cấp", "Không đủ vàng", `MonsterHeartPanel.as:2318,5251-5266,4066`).
Currency labels (HUD wallet list, `Language.as:8020-8070`): npPnt "Năng Lượng Tự Nhiên", heiyaoshiPoint "Hắc Diệu Thạch", warSprite "Dũng Khí Thạch", battleSprite "Ý Chí Thạch", starPnt "Điểm Tinh Cung", elementPnt "Nguyên Tố", stoneSealPoint "Bụi Ấn Thạch", medalExp "Exp Ấn Chương", pvePoint "Điểm Anh Linh".

## 4. Titles (Danh hiệu)

### 4.1 Data model on the client
- `object/Charactor.as`: `t:int` (:45 active permanent title id), `ct:String` (:44 owned permanent ids, `|`-joined), `cts:String` (:30 owned timed/"active" ids), `actT:int` (:16 displayed timed title), `actTN:String` (:20 custom text for special ids), `broT:String` (:23), `vipT:int` (:39).
- `data_tbl_title` = `GamePredef.TBL_TITLE=59` (`GamePredef.as:552`), indexed by `k` (`:8374`). Fields the client reads: `id`, `n` name, `i` description (`TitleSelectPanel.as:521`), `a` style `"color|prefix|suffix"` (`CharactorView.as:166-174`), `b` buff id (`BuffParser.parseBuff2(b)` for the tooltip, `TitleSelectPanel.as:522,691`), `k` kind (1 forever, 2 active/timed, 3 VIP; `GamePredef.as:2043-2045`, `Core.as:2036-2047`), `s` (`Core.as:1780-1790` `checkTitleShow`: `s > 0`).
- Special: `BROTHER_TITLE_ID=153` appends `"-" + broT` to the name (`CharactorView.as:146`, `GamePredef.as:2064`); `SPECIAL_TITLE_IDARR {209, 211}` use the per-player `actTN` text instead of the template name (`CharactorView.as:613-616`, `GamePredef.as:2163`).

### 4.2 UI (TitleSelectPanel.as)
- 260x385 panel (`:316-330`), a two-tab ViewStack: tab 0 "Danh hiệu vĩnh viễn" = `titleList` of `ct` ids with icon (`ICON_TITLE_YES` for the active `t`, `_NO` otherwise), buttons "Thiết lập danh hiệu" / "Hủy danh hiệu hiện tại"; tab 1 "Danh hiệu có thời hạn" = `actTitleList` from `cts`, buttons "Hiển thị danh hiệu" / "Hủy hiển thị". Clicking a row fills an HtmlTextArea: heading "Giới Thiệu Danh Hiệu" + `i`, then "Thuộc Tính Danh Hiệu" + parsed buff text or "Không" (`getStyleDescription` `:344-358`). Shift+click inserts a chat link `TOOLTIP_TITLE=1011` (`:721-727,866-872`).
- Opens from the character panel button (`CharactorPanel.as:5648-5651` `changeVisible(PANEL_TITLE)`); the panel lazily calls `gtl` on first show (`:1014-1034`).

### 4.3 Flow and contract
1. Panel first visible -> `remote.call("gtl", Responder(onTitleList))` no args (`TitleSelectPanel.as:1033`). Reply `{ct:string, cts:string}` stored in `player.ct/cts` (`:1036-1042`).
2. Tab 0 set -> `call("setTitle", Responder(onSetTitle), titleId)` (`:509`); unset sends `-1` (`:1003`). Buttons disabled until reply. Reply `{f:bool, t:int, bd?:LongBuff}` (`:478-503`): on `f` truthy `player.t = t`; if `t > 0` and `bd` present -> `MAIN_LONGBUFF.upLongBuff(bd)`, else `MAIN_LONGBUFF.delBuff(0)` (long-buff row key **0** is reserved for the title buff); then `PANEL_CHARACTOR.updateInfo()` and refresh list.
3. Tab 1 set -> `call("setActTitle", Responder(onSetActTitle), id)` (`:752`); client blocks when the selected id already equals `actT` (`S[9]`). Unset -> `setActTitle(-1)` only if the selected row is the current one (`:438-452`). Reply `{f:bool, t?:int}`: if `f`, `if (t) player.actT = t` (`:454-466`). Note: when `t` is `0/undefined` the client keeps the old `actT` (so the server must send `t:-1` or a non-zero id on clear; **inferred** from truthiness check).
4. Push `onAddTitle({f:1..5, t:id, ct:string})` (consumer `TitleSelectPanel.onAddTitle` `:578-628`): f=1/2/3 set `player.ct = ct`, toast via `sysMsg` with S[0]/S[2]/S[4]; f=4 -> S[6]; f=5 -> S[7]; no list change for 4/5. Push name = panel method name, **inferred** (also in Go note).
5. Push `onAddActTitle(cts:string)` -> `player.cts = cts`, refresh tab 1 (`:674-682`).
6. `updateSelectTitle(id)` (`:668-672`) sets `player.t` (push side, **inferred** name).
7. Over-the-head display (all players): `CharactorView.setName()` runs `setTitle(_gameObject.t)`, `setVipTitle(vipT)`, `setActTitle(actT)` (`:87-98`). `setTitle` (`:133-176`): only if `t > 0`; looks up TBL_TITLE, `_titlePrefix = n`, `_titleStyle = a`; text = `style[1] + n + style[2]` colored `style[0]`; `_textTitle` sits at `y=10` and the name drops to `y=25` (`:152-155`, +50 when flying). `setActTitle` (`:598-628`) shows only when `checkTitleType(actT, KIND_ACTIVE)`; second line `_actTile` at `nameY + 15` (`:61`, `fixTextsPos` `:300-318`). Live updates for other players go through `CharactorView.updateTitle(t)` / `updateActTitle(actT)` / `updateSpeTitle(t)` (`:100-104`, `:372-376`, `:654`), called from hidden CallBack code -> a scene broadcast carrying `{id, t}` / `{id, actT}` is required (push names unknown, open question).
8. Title buff: the title's stats are a TBL_BUFF row (`b`) shown through the long-buff bar row 0 (`bd`); expiry of an active-kind title buff calls `getC(player.id).delActiveTitle(bid)` (`LongBuffCanvas.as:310-322`). The stat effect itself is server-side (Go note: "title buff NOT wired into stats", so H5 must add it to `CharacterStatsService`).
9. Custom title: `TitleCustomPanel.as:356` `call("setCustomTitle", Responder(onSetCustomTitle), index, pre, mid, next)`; reachable only from Tinh Gioi when `starPnt >= GamePredef.TITLE_POINT[211][0]` (=450) (`StarInstanceMap.as:1531-1542`, `GamePredef.as:2774-2778`). Out of M7 core.

| RPC / push | Dir | Args / payload | Await |
|---|---|---|---|
| `gtl` | C->S | none | Responder `{ct,cts}` |
| `setTitle` | C->S | `(id:int \| -1)` | Responder `{f,t,bd?}` |
| `setActTitle` | C->S | `(id:int \| -1)` | Responder `{f,t?}` |
| `onAddTitle` | S->C push | `{f:1..5,t,ct}` | inferred name |
| `onAddActTitle` | S->C push | `cts:string` | inferred name |
| title broadcast | S->C push | other players' `t` / `actT` | name unknown |
| `setCustomTitle` | C->S | `(index,pre,mid,next)` | Responder (reply shape not read) |

## 5. Achievements (Thành tựu)

- Entry: HUD button "Achievement" -> `PANEL_ACHIEVE` (`SystemBarCanvas.as:1599`); `Core.as:1469` pre-inits it at login.
- Login snapshot (set by hidden `onChooseCharactor`; consumers prove shape): `player.achieveLog: {aid: timestampMs}` (an achievement is finished iff `log[aid] > 999999`, `AchievementPanel.as:70,980-983`; the same ms value is shown as `yyyy.MM.dd`, `:749-760`), `player.achieveReqLog: {reqId: {done, progress}}` (`:1402`, progress bars `:790-830`), `player.achPnt:int` (`Player.as:178,2219`, label `ACHIEVEMENTPANEL_U[2]` at `AchievementPanel.as:1413`), `_core.takeAchieveAwardLog: {aid: number>0 if claimed}` (`Core.as:136`).
- UI: overview page ("Tổng quan": point total, last 3 achievements, per-kind progress) plus a tree (kinds 1..6: Cá nhân, Pet, Giao lưu, PVP, PVE, Sinh hoạt via `ACHI_KIND_TYPE` -> sub types) and pages of 5 rows (`AchievementPanel.as:69,1615-1650`). Rows are `AchievementDetail`: icon (`ICON_ACHIEVEMENT` vs `_DISABLED`), name colored by `GamePredef.MSG_ITEM_COLOR[color]`, description, `detail`, award points, and per-requirement lines: `showType 1` = enumerated names green when done, `showType 2` = `v/m` progress (`AchievementPanel.as:786-830`, `AchievementDetail.as:975-1000`).
- Claim gating (client): button shown only if finished and `TBL_ACHIEVEMENT[aid].isAward > 0`; if `isAward == 1` it is hidden once `takeAchieveAwardLog[aid] > 0` (`AchievementDetail.as:966-985,1186-1200`); tooltip = `desc`. The click calls `remote.call("getAchieveAward", null, aid)` **fire-and-forget** (`:1262-1269`); the client early-returns when `isAward` is 0/absent. Result must arrive as pushes: `updateAchieveAwardLog({aid,num})` (Go note, **inferred**: consumer is hidden, but it must write `_core.takeAchieveAwardLog[aid]`), plus `onAchieveTitle(name)` for title rewards.
- Live progress push: `AchievementPanel.updateView(type, id, obj)` (`:633-690`): `type 1` = achievement `id` finished (`obj.done` = timestamp; inserted at the front of the "recent" list of 3, per-kind and total counters incremented); `type 2` = requirement `id` progress changed (`obj.progress`, `obj.done`), repaints the open row. Go calls it `onUpdateAchieve(type, id, obj)` (Go `farm.go:799`, **inferred** push name; the no-arg form `onUpdateAchieve()` from `quest/lifecycle.go:348` hits this method with undefineds, harmless only because `_arg_3.done` is guarded by `_arg_1 == 1`).
- Other players' achievements: `showChaInfo(cid)` reply carries `achLog` and `totalAchPoint`; `btnAchieveWatching` -> `PANEL_ACHIEVE_WATCHING.updateViewByData(achLog, {}, totalAchPoint, name)` (`CharactorInfoPanel.as:3156,1883-1889`, `AchievementComparePanel.as`).
- Tables: `TBL_ACHIEVEMENT=74` (index `kind`, index2 `type`; fields `id,name,description,detail,desc,award,color,kind,type,enable(==1 counted),isAward`), `TBL_ACHIEVEMENT_REQUIRE=75` (index `aid`; fields `id,aid,name,num,showType`) (`GamePredef.as:564-565,8383-8384,8471`; `AchievementPanel.as:687,802`).
- `achPoint` ranking (rankGet) is a separate server concern: the client rank list only displays; ranking value = `achPnt` (Go). `Player.achPnt` is not changed by the claim in the client, so the server should recompute and send the new total (the panel reads `player.achPnt` only on show/updateOverView). Open question: which push updates `achPnt` after a claim.

| RPC / push | Dir | Args / payload |
|---|---|---|
| `getAchieveAward` | C->S fire-and-forget | `(aid:int)` |
| `updateAchieveAwardLog` | S->C | `{aid,num}` (inferred) |
| `onUpdateAchieve` | S->C | `(type:1\|2, id:int, {done?,progress?})` (inferred name) |
| `onAchieveTitle` | S->C | `(titleName:string)` (inferred; consumer hidden) |
| login `cData` | S->C | `achPnt, achieveLog, achieveReqLog, takeAchieveAwardLog` |

## 6. Than Khi / Magic Weapon (slots 15..20)

### 6.1 Character panel tab
- `CharactorPanel` ViewStack: tab 0 "Tr.bị" (equip), 1 "T.tính", 2 "Th.khí" (`MWCanvas`), 3 "Tinh Cung", 4 mount (`tabBtnClick` `:8987-9066`, labels `:8663-8712`). Tab 2 needs level >= 50 else `Alert(CHARACTORPANEL_S[62])`; tab 3 (Tinh Cung) needs level >= 80 (`S[73]`) and builds the star background + `initStars()`; tab 4 (mount) needs `player.expRe` (reborn) and a mount via `checkHaveMount` (`S[81]`) (`tabBtnClick` `:8987-9066`).
- `MWCanvas` descriptor (`CharactorPanel.as:1345-1420+`): ItemSlot `mwMain` `index:15, x:126.5, y:84`, `mwSub1..5` indices 16..20 at (80,22),(170,22),(197,107),... `slotType:4`. A "Sửa" (`mWRepairButton`) button: plain click arms the repair cursor (`ACTION_REPAIR_MAGIC_WEAPON=91`, `Slot.as:758-775` -> `magicWeaponAutoRepair(equipId, stoneSid)`); Ctrl+click repairs all: cost `ceil(sum(endureMax-endureLeft) / MAGIC_WEAPON_REPAIR_ENDURE_BASIC(500))` Thâm Lam Tinh (`ITEM_DARKBLUE_STONE`), `remote.magicWeaponAllRepair(ids[], stoneSlotList[])` (`CharactorPanel.as:4675-4725`, `GamePredef.as:2161`). Blocked in battle.
- Equip/unequip of MW items is the ordinary `equipOn/equipOff` (sid 15..20).
- Instance fields the UI reads (MW tooltip and function panels): `upgradeNum`, `binded`, `color`, `mainProp1/2`, `mainPropNum1/2`, `prop1/2`, `propNum1/2`, `bindMainPropNum1/2`, `t1..t10` (skill ids), `flag` (JSON string; sub MW `succ0..2`, main MW stage info), `q` (Vòng tier: `TipEquip.as:1174`), `endureLeft/endureMax`. Displayed main stat = `int(mainPropNum * GamePredef.MW_GROW_MAP[prop][upgradeNum])` with `MW_GROW_MAP = {1: MW_HP_GROW_MAP, 11: MW_SPEED_GROW_MAP}` (`GamePredef.as:1180-1228`, `EquiptFuncPanel.as:4760-4790`). Sub MW succinct bonus tiers `SUB_MW_*_GROW_MAP` 0/4/12/24 (`GamePredef.as:3035-3112`).
- Constants: `ITEM_KIND_MAGICWEAPON=8`, main type 800, sub 801 (`:1018,1153-1154`); stones `ITEM_TYPE_MW_REPAIR=510`, `_SKILL_RESET=511`, `_TRANS=0x0202 (514)`, `_PROP_RESET=519`, `_STAGE_EIGHT=522` (`:1066-1079`); `STAGE_EIGHT_LEVEL=20`, `STAGE_EIGHT_MIN=0.9`, `STAGE_EIGHT_MAX=2`, `STAGE_EIGHT_ITEMID=4758` (`:6804-6807`); `MAGIC_WEAPON_RESET_LEVEL_LIMIT=5` (`:2096`), `RESET_SPIRITUALITY_NEED=40000`, `RESET_STONE_NEED=5` (`:2094-2095`); `ACTIVATE_MW_LEVEL=[50,50,50,50,50]`, `MW_PRO_COST=20`, `MW_SUCC_ITEM=3740`, `ACTIVATE_MW_PRO` table of `{propType,valMin,valMax,top0..top3}` (`:2931-2934`); `ARTIFACT_QUALITY_ARR=[.3,.4,.5,.6,.7,.8,.9,1]` (`:1983`).
- Spirituality (thần tu) is read from **`_core.player.property.spirituality`** for the reset-prop gate (`EquiptFuncPanel.as:5164`) and the stage gate (`:8549`); the "Thần tu:" label (U[204]) is set by the public `EquiptFuncPanel.setSpirituality(int)` (`:8094-8100`, a push consumer, push name inferred). H5 `CharProperty` has no `spirituality` key yet; it must be added to `property`.
- Function panel: `EquiptFuncPanel` case 4 = MW; list labels `listArr1 = [158,159,160,205,161,176,188,237]` (`:4130`) and help index `introArr1 = [90,91,92,143,93,96,112,144]` (`:4140`). `tabD.selectedIndex`: 0 Thăng cấp, 1 Phân giải, 2 Sửa chữa, 3 Tẩy luyện (sub MW), 4 Tái thiết kỹ năng, 5 Chuyển thuộc tính, 6 Tái lập thuộc tính, 7 Tăng Vòng (`:9607-9645,13488-13560`). Slots are `ItemSlotEquFunc` that accept only kind-8 items (`autoMatchSlots.reqSlots` `:13490-13560`).

### 6.2 RPCs (exact names; `nc.call` = raw NetConnection call, bypasses `RemoteObj` throttle)
| RPC | Args | Reply keys (Responder) | Client gates |
|---|---|---|---|
| `mWeaponUpgrade` | `(equipId)` | `succ:bool, level, require, color, failType 1\|2\|3, msg` | item set; `player.level < 100 && upgradeNum >= 16` -> S[180] (`:14196-14210`); failType 1 -> `msg`, 2 -> U[173] max, 3 -> U[174] must be locked; on `succ` toast S[78], label U[165]+require (`:14110-14180`) |
| `getSpiritRequire` | `(equipId)` | `value` (0/absent = max) | on slot change (`:11811-11830`) |
| `magicWeaponStage` | `(equipId, stoneItemId)` | `msg?, update, itemId, flagStr?, propNum1, propNum2, num` | client: `binded==1`, `upgradeNum >= 20`, `mainPropNum1/2 >= floor(template*0.9)`, not already `>= template*2`; cost from `TBL_ARTIFACT` row (by `tid`; level 1 row when exactly at 0.9, else row whose `propNum1/2` equal current); needs `property.spirituality >= spiritNum` and stack >= `itemNum` (`:8480-8605`) |
| `magicWeaponRepair` | `(equipId, stoneItemId)` | `succ, num` | both slots set (`:8935-8965`) |
| `magicWeaponAutoRepair` | `(equipId, stoneSid)` fire-and-forget | - | `endureMax-endureLeft > 0` (`Slot.as:758-775`) |
| `magicWeaponAllRepair` | `(equipIds[], stoneSids[])` fire-and-forget | - | `CharactorPanel.as:4724` |
| `MWTrans` | `(fromId, toId, stoneId, md5pass)` | `succ, num, msg` | confirm S[95]; password dialog if `_core.delPass` empty (`:9020-9075`) |
| `magicWeaponResolve` | `(equipId, md5pass, type: 0 main\|1 sub-gift-bag)` | `succ, type, giid, stackNum, temp_quality` | S[69] confirm (S[181] for bag type); password gate (`:13655-13740`) |
| `queryMWResetPropMax` | `(equipId)` | `succ, maxMainPropNum1, maxMainPropNum2` | shown as "Giới hạn thuộc tính" (`:4782-4790`) |
| `magicWeaponResetProp` | `(equipId, stoneId)` | `succ, num` | `binded==1`, `upgradeNum >= 5`, `spirituality >= 40000`, stone stack >= 5 (`:5160-5190`) |
| `getMWSkills` | `(equipId)` | `{position: skillSid}` (positions as keys) | builds the dropdown "Chọn kỹ năng thiết lập lại" (`:12208-12245`) |
| `magicWeaponResetSkill` | `(equipId, stoneId, position)` | `succ, num, sid` | list ready, a position chosen (`:11300-11335`); toast S[86] |
| `addMagicWeaponSkill` | `(skillTemplateId, position)` fire-and-forget | - | skill UI slot with `useEnv == 5`, not learned (`SkillUseSlot.as:451-456`); level-up of an MW skill uses `skillLearnByClient(nextLevelSkillId, position)` (`:458`) |
| `showMWInfo` | `(equipId)` | `flag` -> `{succ0..2:{propType,propVal}}` | sub MW only (`:11956,11973`) |
| `succinctMW` (nc) | `(equipId, lockArr[3]:bool, autoBuy:bool)` | `newPro:{succ0..2}, lockArr` | see below |
| `onSureSuccinctMW` (nc) | `(confirm 1\|-1 [, saveFlag])` | `flag` -> new `succ0..2` | answer to the confirm dialog (`:9971-9975,12019`) |
| `activateMWPro` (nc) | `(equipId, index 0..2)` | `f?:error, index, flag:{propType,propVal}` | confirm U[216] "Cần {num} vàng…" (`:7462-7469,14311-14335`) |

Succinct details: only a bound blue (`color == 2`) sub MW (`type 801`) (`:11888-11902`, U[221]); each slot `i` needs player level `ACTIVATE_MW_LEVEL[position-16]` (50) (U[225]). `lockArr[i] = true` means the row is kept (not activated yet, or its lock box is ticked); at least one row must be `false` (U[215]). Cost per roll = number of activated rows + ticked locks in Đá Tẩy Luyện (`MW_SUCC_ITEM 3740`, 5 gold each, U[224]); with fewer in the bag the client refuses (U[227]) unless `autoBuy`. After the reply the UI shows old vs new rows and a **server push** with `saveType == 31` calls `EquiptFuncPanel.showEquipChangeAlert(obj)` -> `showMWSuccinct(obj)` with `obj = {saveType:31, oldPro:{succ0..2}, newPro:{succ0..2}}` (`:8390-8420,9945-10000`); YES/NO sends `onSureSuccinctMW(1|-1)`. `encodePropInfo` colors by `top0..top3` thresholds and appends "(Đầy)" when `propVal` is in the top band (`:12838-12861`).

### 6.3 Pushes (consumers are public methods; names inferred unless noted)
- `showEquipChangeAlert({saveType, ...})` generic equipment-change confirm: 1 pet-equip bind, 3/4/11/21 equipment prefix/bind/soul/element, 6 pet pre, **31 MW succinct** (`EquiptFuncPanel.as:8390-8420`). Push name not visible.
- `updateMWResetView({itemId, mainPropNum1, mainPropNum2})` (`EquiptFuncPanel.as:7594-7625`): repaints "Điểm thuộc tính hiện tại" with the new values only when the open slot's `itemId` matches. There is **no `applyMWResetProp` or confirm dialog anywhere in the client** (grep over the whole client: only these names exist in `EquiptFuncPanel.as`). So the reset-prop tab is single-phase from the client side: `magicWeaponResetProp` rolls and commits, the push updates the view (see Corrections).
- `onMWeaponSkillUpdate` / `onAddCharactorSlot` / `onUPP|onInitViewProp`: not in the client; from the Go notes (**inferred**). The stat refresh after any MW change must carry full `property` incl. `spirituality`.
- Reply-only paths update cached instance data via `_dm.updateData(type, inst)` for stage (`flagStr, mainPropNum1/2`); upgrade/repair/resolve rely on the standard `onAddCharactorSlot` item push (**inferred**).

## 7. Tinh Cung / zodiac stars (`starsData`)

- UI: Tinh Cung tab of the character panel: 12 `StarIcon` buttons `star1..star12` (type 1..12), shows "{name} Lv.{level}" and description of the selected star (`showStar` `CharactorPanel.as:8836-8878`), total "Cấp độ Tinh Cung" = sum of all star levels (`lb_sLevel`, `:3405-3447`, hint S[71]), "Tư chất Cung" = `addition` shown with 2 decimals colored by `getStarColor` (`:8842-8851`), buttons "Bắt đầu tu luyện" (`btn_sj`), "Hủy tu luyện" (`btn_qx`), "Tăng tốc hấp thu", "Tăng tư chất", "Hiệu ứng quan sát" (`PANEL_STAR_EFFECT`, `:4114`), a countdown timer for the running level-up (`handleStarTimer`) and `STAR_EXCHANGE` opened from `PmPanel.as:1313`.
- Login state: `player.starsData: {starType(1..12): {tid, finishDate, addition}}` (`CharactorPanel.as:3405-3412`, `TipStarReq.as:213`). `tid` = `TBL_STARS_TEMPLATE` row id of the current level (0/absent = level 0). `finishDate` = ms epoch while a level-up runs (`> 0`), otherwise `<= 0`; comparison uses `now + _core.timeLag - TimeUtil.timeOSOffSet` (`:3418-3421`). `addition` = float multiplier, default 1 (`getStarColor` thresholds `STAR_ADDITION_COLOR=[1,2,3,4,5]`, `Core.as:1871-1890`).
- `TBL_STARS_TEMPLATE=88` (index `type`, index2 `level`): `id,type,level,name,description,addProp,addValue,reqLevel,reqMoney,reqSeconds,reqStarLevel,reqExp,resCode`. Next template = row of the same type with `level+1` (`getNextStarId` `:9400-9432`); level 0 -> level 1 row.
- Gating the client does (all advisory): `beginStarLvUp` refused if a timer is running (S[65]) or no star selected (S[66]) (`:4640-4650`); glow hint when `totalStarLevel >= next.reqStarLevel && player.level >= reqLevel && (money >= reqMoney || moneyBind >= reqMoney)` (`StarIcon.as:204-221`); tab needs level >= 80 (S[73]). Server must enforce the real rules (reqLevel/reqStarLevel/reqMoney, one upgrade at a time).

| RPC | Args | Reply / effect |
|---|---|---|
| `beginStarLvUp` | `(nextTemplateId:int)` **template id, not star type** (`:4649`) | Responder `onBeginStarLvUp(starsData)` full map; client starts a timer for `finishDate` (`:9117-9170`) |
| `finishStarLvUp` | `(starType:int)` (`:3425,3654`; sent by timer completion or when a login shows `finishDate` already past) | Responder `onFinishStarLvUp(starsData)`; toasts S[68]; hides speed-up panel (`:5589-5606`) |
| `cancelStarLvUp` | `(starType)` after confirm S[76] (`:4808`) | Responder `onCancelStarLvUp(starsData)` (`:9198-9206`) |
| `speedUpStarLvUp` | `(starType, useAll:bool, num:int, itemId:int)` (`StarSpeedUpPanel.as:504`) | Responder `{d:starsData, n:consumed}`; client calls `onBeginStarLvUp(d)` and lowers the stack by `n` (`:437-445`). Item must have `tid == STAR_SPEED_UP_ITEM_IDS[type]` (3316..3327) (`:480-503`) |
| `addStarAddition` | `(starType, num:int, itemId:int)` fire-and-forget (`StarAdditionPanel.as:757,762`) | result by push; `CharactorPanel.onAddStarAddition(starType)` (`:8802-8807`) re-clicks the star to refresh (push payload shape visible to client = `int`; Go sends `{t,f,n,d}`, so the real push handler is hidden — see open questions). Client shows rate = `min(1, BASIC_SUCCESS[tier]*num + ADD_SUCCESS[tier])`, silver = `round(BASIC_MONEY[type]*20*rate*addition)`; confirm S[5] when the star is still level 0 (`:659-720`) |
| `pmStarExchage` | `(slotId, targetTemplateId, num, tempBagFlag)` | Responder `{flag, finalNum, finalNme, slotId}`; swaps star shards (`StarExchange.as:1500,1962-2005`) |

Tables in `GamePredef.as:2120-2145`: `STAR_ADDITION_BASIC_SUCCESS=[1,0.045,0.0225,0.01125,0.005625]`, `STAR_ADDITION_ADD_SUCCESS=[0,0.015,0.0075,0.00375,0.001875]`, `STAR_ADDITION_BASIC_MONEY={1:300,2:4500,3:18000,4:1200,5:36000,6:18000,7:36000,8:36000,9:4500,10:1200,11:18000,12:9000}`. Stat effect = per star `addValue(level) * addition` (Go note; the client only displays via `StarEffectPanel`). Stat refresh after finish/addition is server side.

## 8. Astrology (Chiêm Tinh, "Năng Lượng Tự Nhiên")

- Entry: activity icon id 28 `ASTROLOGIC_PANEL` (`GamePredef.as:2718`, `ActivityCanvas.as:581-592`); setting `visible` is silently ignored while `player.level < 70` (`AstrologicPanel.as:1849-1851`; help text U[42] says level 70). Opening calls `call("getAstrologicData", null)` (null Responder; result arrives as a push `onGetAstrologicData` -> `initData`, `:1799-1830,1859`). Also reachable from `PetEvolutionPanel.as:4315`; its output currency `npPnt` ("Năng Lượng Tự Nhiên") is used by pet evolution.
- UI: 12 clickable element icons (`star1..12`, icons `iconsUrl`, visible only when in `starsToPick`), "Làm Mới" and "Thu thập" buttons, up to 4 collected elements shown (`myStars` truncated to last 4, `:1631-1665`), the daily formula list "1: p00 + p01 =" ... "6: p50 + p51 + p52 + p53 =" with revealed elements, 6 award icons (90,90,140,140,195,195), history "Kỷ Lục" list built from `award_record` (`FORMULA_TEMPLE` `:77`, `awardInfo` `:805`).
- Formula row `i` (0..5) has `ceil((i+1)/2)+1` elements (2,2,3,3,4,4). A hidden row shows "？"; "Nhìn Trộm" (`lookFormula`) reveals one for gold. Matching is on the **tail** of `myStars` (last k picks in order) (`getCheck` `:2217-2260`). Daily formula refresh "12h trưa mỗi ngày" (U[39]); first completed formula gives x10 (U[40]).
- Gold costs enforced only by confirm dialogs on the client (server must charge): refresh when `refreshTimes <= 0` costs 5 gold (`:2325-2356`, U[34]); pick when `pickTimes <= 0` costs `5 + buyPickTimes` gold (`:2690-2720`, U[33]); `lookFormula(fid)` costs 180 (fid 0-1) / 280 (fid 2-3) / 380 (fid 4-5) gold and requires gold unlocked (`unlockMoney`) (`:2550-2610`). `FREE_REFRESH_TIMES=10`, `FREE_PICK_TIMES=12`, `PICK_AWARD=12` (+12 `npPnt` per pick, `:73-75`).

| RPC / push | Dir | Args / payload |
|---|---|---|
| `getAstrologicData` | C->S | none; result push |
| `onGetAstrologicData` | push (inferred name) | `{award:[6], formula:[null\|[elemId..]]x6, starsNow:[ids], starsToPick:[ids], pickCount, buyPickCount, refreshCount, award_record:[{aid,cid,name}]}` (`initData` `:1799-1830`); note `refreshCount`/`pickCount` are **remaining** free counts (label "num1/num2") |
| `refreshStars` | C->S null responder | no args (`:2339,2355`) |
| refresh push | S->C (name `onAstrologicStarsRefresh`, inferred) | `(refreshTimes:int, starsToPick:int[])` -> `refreshStarsToPick(times, stars)` (`:2099-2125`) |
| `pickStar` | C->S null responder | `(elementId 1..12)` (`selectIndex` is the element id, not a list position, `:2705,2719`) |
| `onPickStar` | push (inferred name) | `{sid, leftTimes, buyTimes, refreshTimes, newStars:[ids], result?:{fid, formula, stars:[ids], aid, mult}}` (`onPickStar` `:2060-2072`, `toResult` `:1480-1520`; `result.aid*mult` is the awarded npPnt text) |
| `lookFormula` | C->S Responder | `(fid 0..5)` -> `{id, formula:[ids]}` (`onLookFormula` `:1073-1080`) |

`npPnt` itself moves via the generic currency push (Go: `onAddMoney(cid,"npPnt",n,balance)`), not via astrology payloads.

## 9. Hắc Diệu Thạch (stub panel)

- Entry: activity id 57 `HEIYAOSHIZHEN` (`GamePredef.as:2747`, `ActivityCanvas.as:773-780`). Currencies: stage 1 `player.heiyaoshiPoint` ("Hắc Diệu Thạch"), stage 2 `heiyaoshiPoint2` ("T.Hoa H.Diệu Thạch") (`Player.as:134,144,2252-2253`).
- `HeiYaoShiConfig.as` is the client truth: `POINT_FIGURE[1..20][pointId] = {price (stones), gold (gold alternative), around:[pointIds], area:[triangleIds], aroundLine:[lineIds]}` (`:11`, 296 `price` entries), `TRIANGLE_FIGURE[fig][areaId] = {LResNum, AResNum, attribute:{propId:value}}` (`:2125`), `ALL_HEIYAOSHI[fig] = {propId:value}` full-figure bonus (`:2970`). Prop ids are the equipment prop ids (1 HP, 4/5/6/7, 11 speed, 13/31/34/61 percent-like, `0.32`-style fractions).
- `HeiYaoShiPoint`: `pStage` is 0 (figures 1-10) or 10 (figures 11-20), global figure index `pStage + pIndex`; a point with `price <= 0` renders as already active and hides its button (`:109-122`). Click -> `Core.remote.call("lightHeiyaoshiPoint", null, pStage + pIndex, pointId)` fire-and-forget (`:154`). Tooltip uses HEIYAOSHI_PANEL[5] (stage 1) or [23] (stage 2) with the price.
- `HeiyaoshiAlertPanel`: confirm popup text set by the (unreadable) panel; "Xác nhận" calls `remote.call("activateHeiyaoshiPoint", null, typeNum, pointNum)` (`:303`). `typeNum == 2` is the gold path and first requires gold unlock (`unlockMoney(md5)`, `:286-299`) — so `typeNum 1` = stones, `2` = gold (**inferred** from the gate).
- Unknown (stub): the panel's init RPC and push names. Go note says `initHeiyaoshiPanelData` (Responder `{TRIANGLE_FIGURE, data:{actPoint, actLine, actArea, Buff, lastActFigure}}`) and pushes `gotoLightHeiyaoshiPoint/Area/Line/AllJihuo` (all **inferred**, no client consumer readable). Stat path: `onInitViewProp(property)` after each activation (Go note), consumer at `CharactorPanel.as:5480`.

## 10. War sprite (Chiến Hồn Bạo Nộ)

- Entry: activity id 61 `WAR_SPRITE` -> `PANEL_WAR_BATTLE.showPanel()` (`ActivityCanvas.as:798-804`). `showPanel()` calls `getSpWarData` only when `_core.cid != _cid` (first open per character) (`WarSpritePanel.as:2863-2880`).
- UI: left list of 8 sprite icons (`wspCvs1..8`) -> page "Thăng Cấp" shows level `Lv n`, six current prop lines (`+value`) and "(Cấp sau:+…)" lines, "Dũng Khí Thạch cần:{costNum}" / "…có:{player.warSprite}", two buttons (stones / gold); page "Tiến Hóa" shows class stars (`starBtn1..10`), "Ý Chí Thạch cần/có:{player.battleSprite}" and gold button; totals box shows aggregated props (`onUpdateTotalPropCvs`). Props of type 5 and 7 are skipped in the 6-line display (`WarSpritePanel.as:2985-3040`); value formatting: types 1,4,5,6,7,11 raw int; 13,14,31,61 `v/10000`; others `v/100` + "%".
- `TBL_WAR_SPRITE=130`: `id, level, nextId, costNum, costGold, pT1..pT8, pN1..pN8` (`:2972-2978,1671-1679`). `wObj[1..8]` / `bObj[1..8]` = current template id per sprite (war chain / battle chain).

| RPC | Args | Notes |
|---|---|---|
| `getSpWarData` | none | Responder `updateWarSpritePanel({wObj,bObj})` (`:2876`); same method is the push consumer (Go push `updateWSPPanel`, inferred) |
| `addWarSprite` | `(lvlIndex 1..8)` | fire-and-forget, stones (`:1613`) |
| `addWarSpriteGold` | `(lvlIndex)` | after confirm WAR_SPRITE[25] with `costGold` of the current row (`:2427-2440`) |
| `addBattleSprite` | `(claIndex 1..8)` | fire-and-forget (`:2665`) |
| `addBattleSpriteGold` | `(claIndex)` | confirm WAR_SPRITE[25] (note: uses the upgrade text, `[26]` is unused) (`:1671-1684`) |
| `getWSPBuffList` | none | Responder `{propType: rawTotal}`; re-requested after every panel update (`:3122,3396-3440`); display: 1/4/6/11 floor; 13/14/31/61 `floor(v/100)/100`; 59/60/62/63 `floor(v)/100` |

No level gate is enforced in the client. Wallet fields `warSprite`, `battleSprite` come from login and the currency push.

## 11. Monster heart (Ma Vật Tâm)

- Entry: activity id 64 `MONSTERHEART` (`ActivityCanvas.as:816-822`, `GamePredef.as:2754`); init RPC on panel open (`MonsterHeartPanel.as:5167-5175`).
- Layout: 5 boxes x 7 holes (`holeNum1..7`, `MonsterHeartSlot`), a bag grid with 7 tabs by type (`BagTypeArr` keys `ji, lon, mo, ren, shou, te, zhi`), a resolve slot, a fuse slot (`needUpSlot` -> `afterUpSlot`, 2..5 heart units + optional "Tâm Tinh Thạch" `jinshiHeartSlot` item 5884 + gold option), box upgrade (`TBL_CREATUREH_CONTAIN`, id = `box*10 + level`, fields `exp`, `goldNum`, max box level 6) (`:2330-2350,4035-4075`).
- Wallet: `player.monsterHeart` (box-upgrade exp), `player.mhjingshi` (Tâm Tinh Thạch count) (`Player.as:94,175`).

| RPC | Args | Reply / push |
|---|---|---|
| `initMonsterHeartData` | none | Responder `{bag:{type:{itemId:{itemId,n}}}, data:{hadActCombine, hadActHole:{box:{hole:itemId\|-1}}, heartBoxLev:{box:level}}}` (`onInitMonsterHeartData` `:2330-2350`) |
| `monsterHeartSet` | `(bagPos, holePos, box, monsterHeartType)` (`MonsterHeartSlot.as:144`; `bagPos` = the bag-entry key, **inferred** to be the heart item id) | null; push `updateMonsterHeartPanel({bag,data})` (`:4633-4641`) (+ Go `onInitViewProp`) |
| `monsterHeartReMove` | `(holePos, box)` (`:150`) | same |
| `openHoleMonsterHeart` | `(box, hole)` after confirm S[13] with gold from `TBL_CREATUREH_POINT[box*10+hole].goldnum`; gold lock gate (`MonsterHeartSlot.as:196-228`) | not in Go notes |
| `openHoleMonsterHeartJingang` | `(box, hole, itemInstance)` uses diamond items (`pointObj.itemId/num/quality`) (`:231-242`) | not in Go notes |
| `upgradeMonsterHeartItem` | `(isAll:bool, giid, tempNumUp 2..5, useJinshi:bool, useGold:bool)` (`MonsterHeartPanel.as:2231-2321`) | null; push `updateMonsterHeartAfterUp(isAll:bool, resultNum)` toasts "Dung luyện thành công/thất bại" and sets `afterUpSlot.stackNum` (`:5247-5266`) |
| `resolveMonsterHeart` | `(giid, num)` after password gate (`:3809-3840`) | null; exp is credited through `monsterHeart` currency (client `changeResolveExp`) |
| `upgradeMonsterHeartBox` | `(boxIndex)` (`:4063`) | null; push `onUpgradeMonsterHeartBox(heartBoxLev map)` (`:2904-2908`) and `updateMonsterHeartBox(data)` (`:3780-3789`) |

Tables: `TBL_CREATUREH_HEART=131` (fields `color`, id +1 = next quality), `TBL_CREATUREH_COMBINE=132`, `TBL_CREATUREH_CONTAIN=133`, `TBL_CREATUREH_POINT=134`. Fusion UI blocks colors >= 5 (`MonsterHeartSlot.as:~174`). `TIP_MONSTER_H[propId]` labels the stat names (same as magic crystal).

## 12. Magic crystal (Pháp Tinh / "Pha Lê Ma Thuật")

- Entry: activity id 66 (`MAGICCRYSTAL`, `ActivityCanvas.as:838-844`); `MagicCrystalPanel.showPanel()` -> `initView()` -> `call("initMagicCrystalData", null)` (`MagicCrystalPanel.as:755-758,1240-1247`). **The reply is a push**: `onInitMagicCrystalData(map)` is the panel's public handler (`:1203-1218`).
- Data: `{ "0".."15": {a:0|1, max, l, s, lv} }`; 16 pools, paged 4 per page (`max_num=16`, `page_num=4`), a radio selects the **resource type** sent to `MagicCrystalAddPower`: "1" = Vĩnh Hằng (`l`, `player.magiccystalpre`), "2" = Cực Hạn (`s`, `player.magiccystallimit`) (`getSelectPointType` `:772-775`). Bụi Ảo Năng is `player.magiccystalrec`.
- Pool stat shown: `v * (l+s)/max` per slot type `GamePredef.MAGIC_CRYSTAL_UP[slot][lv] = {max, num, t, v}`, floor 4 decimals; props 59/60/62/63 get a "%" (`MagicCrystalPanel.as:710-745`, `MagicCrystalCanvas.as:617-640`). Activation cost `MAGIC_CRYSTAL_ACTIVE[slot].num`, raise-cap cost `MAGIC_CRYSTAL_UP[slot][lv].num` (0 at max, hides the button) (`GamePredef.as:7057,8051`).

| RPC | Args | Client gate |
|---|---|---|
| `initMagicCrystalData` | none | reply is the push above |
| `MagicCrystalActive` | `(index)` | `ACTIVE[index].num <= magiccystalrec` else toast MAGIC_CRYSTAL_PANEL[3]; confirm [4] (`MagicCrystalCanvas.as:719-741`) |
| `MagicCrystalUp` | `(index)` | `UP[index][lv].num <= magiccystalrec`; confirm [5] (`:897-923`) |
| `MagicCrystalAddPower` | `(index, num, pointType:"1"\|"2")` | blocked when `l+s == max`; `num` capped by `magiccystalpre/limit` (`:475-495,925-936`) |
| `MagicCrystalRecovery` | `(index)` | needs `magiccystalrec >= 1`; confirm [6] (`:589-613`) |

All four mutators use a **null Responder** and the client never re-polls (no timer anywhere in the two files), so the server must push a fresh `onInitMagicCrystalData` after each mutation (see Corrections), plus a currency/`onUPP` push for `magiccystalrec/pre/limit` and stat refresh.

## 13. Lighter systems (RPCs, purpose, reachability)

| System | Entry (reachable?) | RPCs seen | Notes |
|---|---|---|---|
| Mật Bảo (mystery treasure) | `DecoratePanel` ("Hồn Khí Vương Tộc", tab 4 "Mật Bảo"; `DECORATE_PANEL[1]`) opened from the character-panel Hồn Khí button (`CharactorPanel.as:6520-6535`: if `player.decoInfo` show else `initDecoratePanel(cid)`) | `onGetMysBookData`, `onGetMysMakeData`, `onGetMakeLimitTimes`, `onGetMysBagData`, `onGetChipBagData` (all Responder, `DecoratePanel.as:4228-4232`), `getMysTreBuffByKind(kind)` (`MysTreShow.as:321`), `getMysTreBuffSimpleData` (`:8187`), `onGetMysAddTimes` (`:8283`), `makeMysTre(recipeId, {slot:{idx}}, {slot:count})` null (`:10233`), `mysTreObjResolve({id:true…})` null (`:8878`), `addLimitMakeTimes` (`:10168`) | `TBL_MYSTRE=123`, `TBL_MYSTRE_RECIPE=122`; also rune/deco RPCs (`runeUpLvl`, `getRuneBagData`, `addDecoHoleLevel[TenTimes]`, `showDecoShow`, `hideDecoShow`, `updateActiveDecoShow`, `getDecoSuitProp`). Large separate system; defer |
| Lò Luyện Thần Bí | activity id 51 (`MysteryFurnace.as`) | `MysteryExchangeItem({instId:true}, md5pass)` -> `{num,mysteryCrystal}`, `MysteryExchangeScore({scoreType:count}, md5pass)` -> `{num}` (`:1165-1217`) | feeds `player.mysteryCrystal` ("Kết Tinh Thần Bí"), used by Train Soul; button opens `PANEL_TRAIN_SOUL` (`:1297`) |
| Luyện Hồn (train soul) | via Lò Luyện Thần Bí | `trainSoul()` Responder `{soulLvl, soulExp}` -> `player.trainSoulLvl/Exp` (`TrainSoulPanel.as:~665,610-619`); client blocks when `mysteryCrystal <= 0` or level >= 100 (`MAX_SOUL_LVL`, `:68`) | needs level 50 (help text TRAIN_SOUL_PANEL[7]); 1 crystal = 1 exp |
| Awaken | `CharactorPanel` awaken button (`:4868-4872`) | `awakening(autoBuy:bool)` Responder; reply: `needGold` (confirm then `ensureBuyAwaken()`), or `{success, awakenLevel?, awakenPoint?, awakenAdd?, itemNum?}` (`AwakenPanel.as:975-985,1097-1132,768`); `addAwakenPoint(skillId)` / `reduceAwakenPoint(skillId)` -> `{awakenPoint, awakenPointUsed, awakenDict}` (`AwakenSkillBox.as:235,290,313-330`) | tables `TBL_AWAKENING=113`, `TBL_AWAKENING_SKILL=114`; login keys `awakenLevel/Add/Point/PointUsed/PointDict` (`Player.as:2257-2261`) |
| Medal (Ấn Chương) | activity id 26 (`MEDAL_PANEL`) | `getMedalInfo()` Responder (`MedalPanel.as:5256`), `upMedal(slotIndex)` -> `onUpMedal` (`:3696`, gated by `upExp <= player.medalExp` and `clevel <= level`), `breakMedal(index,1,1)` (`:3744`), `arrangeMedalBag()` (`:3964`) | `TBL_MEDAL=98` |
| Explorer medal (EMedal) | activity id 72 (`ExplorerMedalPanel.as`) | `initEMPanel(cid)` Responder `updateEMPanel`, `levelUpEMedal(cid)`, `levelUpEMedalByGold(cid, type)` after unlockMoney (`:1507,1685,2524`) | `TBL_EXPLORER_MEDAL=137` |
| Stone seal | activity id 39; pet/equipment seal slots | `stoneSealGetData`, `getInitSlot`, `stoneSealSetStone(equipSid, sealIndex, itemId, tempBagFlag)`, `stoneSealSwapStone(equipSid,a,b)`, `stoneSealRemoveStone(equipSid,idx)`, `stoneSealRemoveAllStone(equipSid)`, `stoneSealSuccinct(equipSid, x)` (`StoneSealPanel.as:2498-3996`, `StoneSealBoreCanvas.as:391`) | wallet `stoneSealPoint` |
| Ma Pháp Bí Trận ("praBuff") | activity id 24 / `MilitaryPanel.as:135` | `getMagicArrayData(praType 1..8)` Responder `onGetMagicArrayData` (`MagicArrayPanel.as:6153...`/`showPanel`), `addPracticeExp(praType, isGold)` null; push `updatePraView({praType, buff, exp, elementNum, goldNum, critMulit?})` (ignored unless all of praType/buff/exp/elementNum/goldNum are present, `:2981-2995`). 8 tracks, `MAX_LEVEL 30`, tables `PLAYER_PARBUFF_*` (`GamePredef.as:3121-3127`) | the identifier `praBuff` does not appear in the client; the Go name is `praBuffInfo` in login |
| Fairy | `PetCanvas.as:649` -> `PANEL_FAIRY_MANAGER` | `initCharFairy`, `changeFairyState(id,0\|1)`, `delFairy(id)`, `fairyGrowUp(id,type)`, `fairyRaise(id,itemId,1)`, `addFairyExp(id,sids[],1)`, `upFairySkill(id,skillIndex)`, `getFairyResAndList`, `setFairyRes(tid,1\|2)`, `setFairyResList(tid)` | `TBL_FAIRY=87`, `TBL_FAIRY_TEMPALTE=86`; separate feature |
| Tinh Giới (star instance) | `StarInstanceMap.as`, `TBL_WAR_MAP=89` | `getWarMap()`, `clickWarMap(sid, level)`, `addWarMapTime(max)` (cost `(max-4)*10` gold, max 10), `initTaskSweepPanelByClient(0, level, id, 3)` (`:864,1407,1576,1585`) | a battle instance map; `starPnt` >= 450 unlocks custom title 211 |
| Pet soul / realsoul / pet stone | `PANEL_PET_SOUL`, `PANEL_PET_REAl_SOUL`, `PANEL_PET_STONE` | out of M7 (pet-side) | |

## 14. How progression stats reach the character panel

- Login: `onChooseCharactor` -> `Player.data` setter assigns the progression numbers (`Player.as:2216-2270`): `achPnt, starPnt, npPnt, elementPnt, stoneSealPoint, pvePoint, medalExp, mysteryCrystal, heiyaoshiPoint(2), warSprite, battleSprite, monsterHeart, mhjingshi, magiccystallimit/pre/rec, awaken*, trainSoulLvl/Exp, ...`. Complex blobs (`starsData`, achievement logs, `ct/cts/t/actT`, `astrologicData`, `praBuffInfo`, `medalInfo`, ...) are hydrated by hidden CallBack code: **shape known only from consumers (above)**.
- Combat/panel stats: server aggregates every bonus into `property` (`final*` keys). Client replaces `player.property` in `onInitViewProp` (`CharactorPanel.as:5480-5486`) and in the `onUPP` path (H5 already ports `onUPP.property`). `onInitViewProp` is the "refresh stats now" push used by feature handlers in the Go server (heiyaoshi, monster heart, change element/soul); the payload must be the full `CharProperty`, not a delta.
- Extra property keys the progression UI reads from `player.property`: `spirituality` (Than Khi cost gates). The character panel also reads `player.property` for the existing detail rows.

## 15. Delta vs this repo (`D:\mc-game-new`)

- Missing entirely in `packages/shared/src` and `server/src/modules`: titles, achievements, Than Khi, stars, astrology, heiyaoshi, war sprite, monster heart, magic crystal, awaken/train soul/medals; `CharProperty` lacks `spirituality`; no `onInitViewProp` handler; no currency fields for `npPnt, starPnt, heiyaoshiPoint(2), warSprite, battleSprite, monsterHeart, mhjingshi, magiccystal*, mysteryCrystal, achPnt, medalExp, ...` (grep shows none).
- Already there: client `Entity.setTitles(title, actTitle)` + `EntityLabels` (`client/src/game/Entity.ts:183-186`, `EntityLabels.ts:14-42`) — not fed by the server; HUD button `Achievement` key R (`client/src/ui/hud/systemBar.ts:23`); `rankGet` category `achPoint` (`packages/shared/src/ranking.ts:6,42`) currently empty; stat service `server/src/modules/stats/character-stats.service.ts` with guild skill buffs (add providers for title buff, MW, stars, heiyaoshi, war sprite, monster heart, crystals).
- Seeds present in `D:\mcgame\supabase\seeds`: `data_tbl_title, achievement, achievement_require, artifact, stars_template, war_sprite, creatureh_{heart,combine,contain,point}, awakening(_skill), medal, explorer_medal, mystre(_recipe), soul`; gamedata module only loads a short list today, so each needs importer + `GameDataService` accessors. `HeiYaoShiConfig`, `GamePredef` MW/star/crystal tables are client constants: copy them into shared TS.

## 16. Proposed shared types (`packages/shared/src`; new files re-exported from `index.ts`)

```ts
// title.ts
export interface TitleList { ct: string; cts: string }                       // gtl reply, '|'-joined ids
export interface SetTitleResult { f: boolean; t: number; bd?: LongBuff }     // setTitle reply (LongBuff from buff module)
export interface SetActTitleResult { f: boolean; t?: number }
export interface TitleAdded { f: 1 | 2 | 3 | 4 | 5; t: number; ct: string }  // onAddTitle push
export interface TitleBroadcast { id: number; t?: number; actT?: number }    // scene broadcast, name TBD
// achievement.ts
export interface AchieveReqProgress { done: number; progress: number }
export interface AchieveSnapshot {
  achPnt: number; achieveLog: Record<string, number>;               // aid -> ms timestamp
  achieveReqLog: Record<string, AchieveReqProgress>; takeAchieveAwardLog: Record<string, number>;
}
export interface UpdateAchieveArgs { type: 1 | 2; id: number; obj: { done?: number; progress?: number } }
export interface AchieveAwardLog { aid: number; num: number }
// magicWeapon.ts
export interface MWUpgradeResult { succ: boolean; level?: number; require?: number; color?: number; failType?: 1 | 2 | 3; msg?: string }
export interface MWStageResult { msg?: string; update?: boolean; itemId?: number; flagStr?: string; propNum1?: number; propNum2?: number; num?: number }
export interface MWSucc { propType: number; propVal: number }
export interface MWSuccFlag { succ0?: MWSucc; succ1?: MWSucc; succ2?: MWSucc }
export interface MWSuccinctResult { newPro: MWSuccFlag; lockArr: boolean[] }
export interface MWChangeAlert { saveType: 31; oldPro: MWSuccFlag; newPro: MWSuccFlag }
export interface MWResetPropView { itemId: number; mainPropNum1: number; mainPropNum2: number }
export type MWSkills = Record<string, number>;                                // position -> skill sid
// zodiac.ts
export interface StarSlot { tid: number; finishDate: number; addition: number }
export type StarsData = Record<string, StarSlot>;                             // '1'..'12'
export interface StarSpeedUpResult { d: StarsData; n: number }
export interface StarExchangeResult { flag: boolean; finalNum?: number; finalNme?: string; slotId?: number }
// astrology.ts
export interface AstrologicData { award: number[]; formula: (number[] | null)[]; starsNow: number[]; starsToPick: number[];
  pickCount: number; buyPickCount: number; refreshCount: number; award_record: { aid: number; cid: number; name: string }[] }
export interface PickStarResult { sid: number; leftTimes: number; buyTimes: number; refreshTimes: number; newStars: number[];
  result?: { fid: number; formula: number[]; stars: number[]; aid: number; mult: number } }
// featurePanels.ts
export interface WarSpriteData { wObj: Record<string, number>; bObj: Record<string, number> }
export type WspBuffList = Record<string, number>;                              // propType -> raw total
export interface MonsterHeartData { bag: Record<string, Record<string, { itemId: number; n: number }>>;
  data: { hadActCombine: Record<string, unknown>; hadActHole: Record<string, Record<string, number>>; heartBoxLev: Record<string, number> } }
export type MagicCrystalData = Record<string, { a: 0 | 1; max: number; l: number; s: number; lv: number }>;
export interface PraView { praType: number; buff: number; exp: number; elementNum: number; goldNum: number; critMulit?: boolean }
```

Owners: server modules `title`, `achievement`, `magicweapon`, `star` (zodiac), `astrology`, `heiyaoshi`, `warsprite`, `monsterheart`, `magiccrystal` (state in per-feature Mongoose docs; each exposes a stat bonus provider consumed by `stats/character-stats.service.ts` and triggers `onUPP`/`onInitViewProp` with full `property`). Client: `client/src/ui/titlePanel.ts`, `achievementPanel.ts`, `ui/equipFunc/*` (Than Khi tabs) + character-panel MW/Tinh Cung tabs, `ui/featurePanels/*`, `client/src/game/Entity` fed by scene title fields.
Suggested slicing (client risk order): (1) titles + `t/actT` scene fields + achievements; (2) property `spirituality` + `onInitViewProp` + Than Khi; (3) stars + astrology; (4) heiyaoshi/war sprite/monster heart/crystal; (5) the lighter systems.

## 17. Corrections to the Go notes (verified against the client)

1. **MW reset prop is single-phase in the client.** No `applyMWResetProp`, no confirm dialog; the Go "pending reset + apply" flow is unreachable. Roll must commit and push `updateMWResetView({itemId,mainPropNum1,mainPropNum2})`.
2. **Magic crystal has no 60-tick poll in the client** (`MagicCrystalPanel/Canvas.as` contain no timer; `initView` runs only on open/`showPanel`). The 4 mutators need an explicit post-mutation `onInitMagicCrystalData` push.
3. `initMagicCrystalData` and `getAstrologicData` send a **null responder**; their data arrives as pushes (`onInitMagicCrystalData`, `onGetAstrologicData`), whereas `getSpWarData`, `initMonsterHeartData`, `getMagicArrayData`, `getMedalInfo`, `initEMPanel` use Responders.
4. Astrology has 6 formulas (2,2,3,3,4,4 elements), `lookFormula(fid)` RPC (180/280/380 gold) and a 12:00 daily refresh; the Go server implements only 2 formulas and no `lookFormula`. `pickStar` arg is the element id 1..12 (matches Go), `onPickStar.result` carries `{fid, formula, stars, aid, mult}` (not just a boolean).
5. `beginStarLvUp` takes the **next-level template id**, `finishStarLvUp`/`cancelStarLvUp` take the star type.
6. Monster heart has 5 more RPCs than the Go note covers (`openHoleMonsterHeart`, `openHoleMonsterHeartJingang`, `upgradeMonsterHeartItem`, `resolveMonsterHeart`, `upgradeMonsterHeartBox`) and 4 pushes (`updateMonsterHeartAfterUp`, `onUpgradeMonsterHeartBox`, `updateMonsterHeartBox`, `updateMonsterHeartPanel`).
7. Than Khi stage panel text (U[144], S[144]): "Bổ sung thành công 50 lần thì có thể tăng Vòng 8"; the client code only sends `(equipId, stoneId)` and expects `update/propNum1/propNum2/num/msg`, so the 50-step counter/probability bonus lives server-side (in `flagStr`).
8. Title `bd` / `delBuff(0)`: the title buff uses long-buff row key 0, confirmed `TitleSelectPanel.as:489-498`.

## 18. Open questions

1. Push names for: title broadcast to other players, `onAchieveTitle`, `updateAchieveAwardLog`, `achPnt` refresh after a claim, `showEquipChangeAlert`, `onGetAstrologicData`, `onPickStar`, `onAstrologicStarsRefresh`, heiyaoshi pushes. Static analysis cannot prove them (CallBack stub); take them from live Go captures or define them in H5 (the client work in `GameClient.on` is ours).
2. Order of pushes after MW mutations (item push vs `onUPP`/`onInitViewProp`): unprovable; the client reads whichever arrives last for `property`.
3. `EquiptFuncPanel.setSpirituality(int)` (`:8094`) is a push consumer for the thần tu total; its push name is hidden. Either send it or rely on `property.spirituality` (both are read).
4. `addStarAddition` push payload: the client method `onAddStarAddition(int starType)` only needs the star type, but the Go server sends `{t,f,n,d}`; the true consumer is hidden. Safe choice: send the Go shape and also update `player.starsData`.
5. `monsterHeartSet` first arg (`monsterHeartBagPos`): the bag grid keys by item id; whether it is item id or a bag index is not provable.
6. `typeNum` semantic of `activateHeiyaoshiPoint` (1 vs 2) and what the Hac Dieu Thach panel sends first (panel decompile aborted).
7. `setActTitle` clear reply (`t` field) and whether other players need `actTN` text for special ids 209/211.
8. Level/entry gating of activity icons (flags/levels such as `type 2 ... flag`, `ActivityCanvas.as:1220-1255`) comes from a server-sent activity list that is hidden; H5 has no activity bar yet. Reaching these panels in H5 needs either that bar or HUD/character-panel buttons.
9. Whether the 50-step Vòng-8 stage counter is client-visible (the `hintTxt` strings U[240/241], S[149-151]) — only text is known.
10. Reply shape of `setCustomTitle`, `getWarMap`, `clickWarMap`, `initEMPanel`, `getMedalInfo`, `initDecoratePanel` was not read (lighter systems, deferred).
