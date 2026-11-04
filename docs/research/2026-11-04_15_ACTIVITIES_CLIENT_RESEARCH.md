# M8 Activities - legacy Flash client research

Scope: activity icon strip (ActivityCanvas), daily/diary/sign-in/online/offline/gift systems (A), VIP/PM (B), bosses/events/quiz/maze/lotto (C),
loop quests/marriage/farm/dress/life skills/pet PVE/mounts (D). Read-only research of `D:\mcgame\docs\client` (paths below are relative to it).
Method note: `system/CallBack.as` is a 17-line aborted stub (`wc -l` = 17), so every server push *name* below that is not found in a panel is
**unconfirmed** and must be taken from the Go server (`internal/presentation/rtmp/handlers/**`) or `docs/memory/*.md`. Panel methods that
are named like pushes (`setBtnsDailySignInAct`, `onInitCharMarriageList`, `flushProcesFlag`, ...) exist as public methods in the panels, so the
payload is **confirmed** from the consumer, but the exact dispatch name is **inferred** (the stub hides the router).
Nothing in this milestone is ported yet: grep of `server/src`, `packages/shared/src`, `client/src` for `initPmData|getSignInData|getCharDiaryData|
bossDailyGetData|getVipShopConfig|takeLoop|getTodayOnlineTime|saveGuideLog|getOfflineExp|startedActList` finds nothing (only `pmLevel` in
`packages/shared/src/social.ts:44` and a `loopInfo: {d, flag}` stub at `protocol.ts:225`).

Ratings (implementable from client + data): yes / partial / no.

| System | Rating | Why |
|---|---|---|
| A1 Activity strip | yes | whole behavior is client-side; server supplies a list of `{id,type,flag,sortType}` |
| A2 Daily sign-in (2 panels) | yes | full payload visible in panels + Go memory |
| A3 Diary / activity points | yes | TBL_DIARY + 4 RPCs; server must own counters (which events bump them is open) |
| A4 Online time / offline exp | yes | formulas are client-side (AutoExpPanel); `getTodayOnlineTime`, `getDailyOnlineAct` simple |
| A5 Festival / gift codes | partial | feast OK (TBL_FEAST); gift-code content/`gtg`/`searchGameGift` semantics are server-only |
| A6 Tutorial guide | partial | engine is fully client-side; only `saveGuideLog` + `initNewPlayerGuide` map; step content is Chinese in TBL_GUIDE |
| B VIP / PM | yes | panel + TBL_PM_RIGHT + shop; reward mapping of each right id is server-defined (Go memory) |
| C daily boss | yes | per-boss config embedded in client |
| C nine boss / consume events / lotto / maze | partial / no | big panels; only RPC names confirmed |
| C quiz (TBL_ANSWER) | partial | client flow complete, push names unconfirmed |
| D loop quests | yes | TBL_QUEST_LOOP + type-7 TBL_QUEST rows (seeds present) |
| D marriage / farm / dress / life skills / PVE / mounts | partial | RPC surface confirmed, payloads mostly not read |

---------------------------------------------------------------------------------------------------------------------------------

## A1. Activity icon strip (`ActivityCanvas`)

### Key files
- `view/view/compMain/ActivityCanvas.as` (1677 lines) - the strip; `ViewManager.MAIN_ACTIVITY = 20000` (`view/ViewManager.as:481`), mounted in
  `view/view/MainLayer.as:1180-1181`. Shown/hidden by `logic/Battle.as:673` (show on leaving battle) and `:993` (hide on entering battle); also
  `hideIcons(bool)` (`ActivityCanvas.as:1653`) called by `TripleTownTurnPanel.as:691`.
- `view/view/compMain/ActivityCanvas_element*.as` - the red "new" circle MovieClip (`element`, `:170`); `Caidanshang1/2`, `Caidanxia1/2` page-arrow skins.
- `predef/GamePredef.as:2695-2768` - activity ids 0..83 (`DAILY_ACTIVITY=0` ... `MCZD=83`).
- Seed `supabase/seeds/data_tbl_activity.sql` (Go-project invention, columns `id,name,style_name,panel_key,feature_key,sort_type,enable,type,flag,note`).
  The original server evidently kept a list; the Go seed is the best available ground truth for `type/flag`.

### Layout (explicit)
- Canvas width 450 (`:73-81,180`). Children: `barUp` (BtnActivityPageUp) x10 y48; `barNum` label x0 y35 w24.2 (initially hidden, text "1");
  `barDown` (BtnActivityPageDown) x10 y75; `iconCavas` x50 y0 right13; `btnChange` (BtnHideButtons, 12x25) right0 y12 (y=37 when icon count > 8);
  `jxhdBtn` (BtnJXHD, 48x48) x-12 y0 (`:82-166`). Icon buttons are 48x48 (`:1580-1581`).
- Icon slot index i on the current tab: `x = 350 - (i % 8) * 50` (`getX :1099`), `y = 0` for the first 8 indices of the window, `50` for the next 8
  (`getY :1476-1487`). Window = indices `[(tab-1)*8, (tab+1)*8-1]` (16 icons, two rows; `canIndexShow :203`). `tab` pages by 8 icons
  (`activateIconUp :1109`, `activateIconDown :1174`, wrap-around). `getTabNum(n) = 1 if n<=16 else int((n-17)/8)+2` (`:345`).
  Label under an icon (state text) at `(button.x+4, button.y+48)`, colour `#FF0000` (`:1549,1558`).
- `btnChange` toggles the whole strip (`change_canFun :1631`: iconCavas/arrows/jxhd hidden, style `BtnShowButtons` <-> `BtnHideButtons`).
- Sort: ascending `sortType`, ties by `id` (`sortByType :1455`, `positionActList :1399` uses `sort1=sortType, sort2=id`).
- New-icon red circle: when `isInited` is already true a newly added icon gets the circle (`showActivityInfo :1620-1623`, `addCircle :1290`);
  clicking removes it (`deleteCircle :1360`, called at the end of `activityClick :983`). First `initView` only sets `isInited` (`:1273-1276`).

### Data in -> visibility rules (explicit)
`initView(obj)` (`:1221`) receives an object keyed arbitrarily, each value `{id, type, flag, sortType}`; per entry:
| `type` | rule (`ActivityCanvas.as`) |
|---|---|
| 3 | `changeView(entry)` (`:1507`): `flag` 0 delete icon, 1 show + red label **"Đang báo danh"** (`Language.ACTIVITY_CANVAS[1]`), 2 show + label **"Đang thao tác"** (`ACTIVITY_CANVAS[0]`); `sortType` honoured |
| 2 | show iff `player.level >= entry.flag` else delete (`:1234-1245`) - `flag` is the level threshold |
| 4 | show iff `player.expRe` (rebirth exp) is truthy and > 0 (`:1246-1257`) |
| other (0/absent) | show iff `flag` truthy else delete (`:1258-1265`) |
Style class per id = `ACTIVITY_STYLE_ARR[id]` (`:172`, 84 entries; note ids 7 and 15 both `BtnWBAct`, 46 `summerGames` twice). Skins are CSS (`Btn*`) -
for H5 the swf-tools would have to extract them (`Not found as art` caveat from `docs/memory/main-hud.md`).
Incoming pushes (names from Go memory `docs/memory/activity-system.md`, **unconfirmed in client** because stub): login `onChooseCharactor.startedActList`
-> `initView`; `updateActivityList(list)` -> `initView`; `updateActivityState({id,sortType,flag})` -> `changeView` (flag is a 0/1/2 *state code*, not
the login-shape flag; any other value is a silent no-op, `:1513-1524`). `deleteActivity(id)` re-flows the strip (`:1307-1358`).

### Enabled icons in the Go seed (`enable=true`) with gating (type,flag) and click target
Click dispatch is `activityClick :400-984` (switch on button id; opens `ViewManager.*` panel). Seed notes are Vietnamese labels (exact):
- type 0 / flag 1 (always): id0 Daily Activity (`DAILY_ACTIVITY` -> `show(ViewManager.DAILY_ACTIVITY)`, `:408`); 12 Sao Lấp Lánh (SendCombine); 19 VIP Shop;
  30 BtnJiangLiZhaoHui "Hồi phục" (FindBack); 49 Boss Daily (Mowubiji); 65 dailySignInAct "Báo danh nhận quà"; 9 BtnNewServerAct.
- type 2 (level gate = flag): 2 BtnStarAct lv80; 13 NineBoss "Kiếp nạn vô ưu" lv130; 14 CardGame "Thẻ bài ma thuật" lv80; 15 WB "Boss Thế giới" lv50;
  18 BtnSoulAct "Xủ quẻ" lv80; 20 AutoTask "Hoàn thành Phụ bản" lv50; 26 "Ấn chương" lv80; 27 "Mê trận" lv120; 28 "Năng lượng tự nhiên" lv50; 29 "Sách tiến hoá" lv50;
  35 "Thiên Phú Pet" lv80; 39 "Ấn Thạch" lv50; 43 "Vùng đất rèn luyện" lv120; 51 "lò luyện thần khí" lv50; 57 "Hắc diệu thạch" lv50; 58 "Chân hồn pet" lv80;
  59 "Thám hiểm bí cảnh" lv50; 61 "chiến hồn" lv80; 64 "Ma tâm" lv50; 66 "Pha lê ảo năng" lv50; 68 "Cầu hồn - kỳ linh" lv160; 71 "Linh thạch" lv100;
  72 "Thám hiểm" lv50; 75 "Không gian điêu khắc" lv80; 80 "Khoá học huấn luyện" lv50; 81 "Tu luyện ảo ma" lv50; 82 "Bảng khắc" lv50.
- type 3 (state label, server driven): 16 "Đố vui có thưởng"; 17 "Võ đài đông huyền"; 22 "Chiến trường dũng sĩ"; 25 "Lễ hội sôi động"; 32 "Tranh bá PK"; 34 "Viễn chinh";
  38 "Ảo cảnh tầm bảo"; 41 "Quảng trường kỳ thạch"; 44 "Chiến trường tula"; 55 "Tiêu trừ hoàn lạc"; 63 "đại tiệc sinh nhật"; 79 "Đại tiêu trừ".
- type 4: 24 "Ma pháp bí trận" (needs `expRe > 0`).
- Disabled in seed (`enable=false`): 3,4,6,7,8,10,11,21,23,31,33,36,37,40,42,45,46,... (event leftovers).
Special click branches worth porting early: 15 -> `canEnterWbMap(player.id)` (`:464-466`, no responder); 16 -> if state==1 `PANEL_QUESTIONING.viewClick()` else
`call("canQuest", Responder(onCanQuest), player.id)` -> false shows `Alert` text `ACTIVITY_CANVAS[3]` (`:467-476,1489-1499`);
17 -> state==1: Alert `AWARD_WARN_CANVAS_S[0]` Yes/No -> `call("dxdRegister", null, player.id, true|false)`, else `remote.dxdGetIn()` (`:477-497`);
22 -> `call("checkPVPLine", Responder(bool))` then level>=50 -> `PANEL_PVP_ROOM_LIST.initRoomListPanel()` else `sysMidNote(PVP_ROOM_P[20])` (`:532-554`);
77 -> level>=35 else `Alert(MINIMAPCANVAS_S[39])`; first open `call("getPetArenaActivityInfo")` + `call("getPetArenaDataActivity", null, true)` (`:910-939`);
2 -> `_core.battleMap.initBattleMap()` (`:423`); 60 -> `call("enterBloodyBattle")`; 38 -> `call("canEnterTreasureHunt")`.
`jxhdBtn` opens `PANEL_JXHD` (class `JXHD`, "Sự kiện Kinh Hỷ", `Language.JXHD_PANEL[0]`): `call("getJXHDList", Responder)` -> map key -> `{startTime,endTime,text?,text2?,notice?}`
filtered client-side by a static `JXHDCHECKLIST` (level `lv`), and `call("getJXHDAward", Responder, key)` -> `[key, awardGroups]` (`JXHD.as:946,1121,1281-1340,697`).

### Language strings
`ACTIVITY_CANVAS[0..6]` (`config/Language.as:5788-5794`): "Đang thao tác", "Đang báo danh", "Đã báo danh",
"Chỉ có người chơi đã báo danh mới tham gia sự kiện Đố Vui Có Thưởng tại kênh báo danh! 20:05 - 20:07 thứ ba, năm, bảy hàng tuần hãy tham gia nhé!",
"Sự kiện đã bắt đầu, hãy mau đến tham gia!", "Sự kiện đã bắt đầu, hãy mau đến tham gia", same. `ACTIVITY_CANVAS[6]` is shown by `sysMsg` when a hidden page gains a circle (`fix2 :1075`).

### Proposed H5
Server `modules/activity/` (`activity.service.ts`: strip list built from a ported `data_tbl_activity` or an `as const` table; push `updateActivityList`,
`updateActivityState`). Client `client/src/ui/hud/activityStrip.ts` (ActivityCanvas port, 8-per-column x 2 rows, paging, red dot, label) wired in `mainHud.ts`.
Panels not ported open "Tính năng đang phát triển" toasts.

---------------------------------------------------------------------------------------------------------------------------------

## A2. Daily sign-in (two panels)

### Panel 1: `SignInPanel` (`PANEL_SIGN_IN = 859`, `GamePredef.SIGN_IN_PANEL = 5`) - legacy 5-day streak
- `view/view/compDragable/SignInPanel.as`; 560x444, x135 y258 (`:456-459`). Opens with `init()` (creationComplete, `:469`).
- RPC `call("getSignInData", Responder(onGetSignInData), null)` (`:469`) and `call("signinNow", Responder(onGetSignInData), null)` (`:618`; each of 5 card buttons `signin1..5` -> `signin()`).
  Both awaited; the reply shape is the same (`onGetSignInData :1033`): `{continueSigninTime:int, signinedToday:bool, signedYesterday:bool}`.
- State machine (`:1040-1100`): all 5 cards disabled, ticks hidden, back = `QianDaoKaPai1`. If `!signedYesterday`: card1 enabled (back `QianDaoKaPai`) unless
  `signinedToday` (tick on card1); cards 2..5 stay greyed. Else if `!signinedToday`: enable card `(continueSigninTime+1)%5` (card5 when `continueSigninTime==4`), ticks 1..continueSigninTime
  (unless ==5: no ticks); else ticks 1..continueSigninTime.
- Strings (`Language.SIGN_IN_U[0..11]`, `config/Language.as:5569-5580`): rule text "1. Người chơi cấp 20 trở lên, mỗi ngày đều có thể đến Báo Danh ..." (long, [0]);
  rewards per card: [1] "Nhận Truy Hồn Phù*1", [2] "Nhận Loa*2, Sách Hồi Nhóm*2", [3] "Nhận Đông Huyền Lệnh Kỳ (Lam)*1, Sách Gặp Đầy Quái (15 phút)*1",
  [4] "Nhận Bang Hội Phù*4, Kết Tinh Thần Tu A*2", [5] "Nhận Thăng Tinh Thạch*5, Sách Tăng Thần Tu 2 Lần (1 Giờ)*1"; [6..10] "Ngày 1".."Ngày 5"; [11] "Báo danh".
  **Rewards are server-side**; the text is the only client knowledge. Level 20 gate is text-only (no client check) - server must enforce.

### Panel 2: `DailySignInPanel` (`PANEL_DAILYSIGNINACT = 967`, activity id 65) - monthly calendar with crit/lucky/surprise days
- `view/view/compDragable/DailySignInPanel.as` (6203 lines). `initView :6116-6123`: `call("initDailySignInActData", Responder(onInitDailySignInActData))` then `call("initDailySignInActConsumeLimit", null)` (no responder; reply is a push).
- `onInitDailySignInActData` (`:3696`) payload (keys read, `:3705-3760`): `{time:{year,month(1-based),date}, conf:{start(ms), luckyDay, surpriseDay, luckyPoint[1..6], luckyGold[1..6],
  retroactivePrice, critPrice, closeOnKey, iInfo:[{inc,iid,number}]}, data:{actYear,actMonth,actDays:{day:true}, crit, getAwardTime:{day,flag}}}`. `inc` 1 = daily item, 2 = surprise-day pool,
  4 = crit pool (text built into `playRule`, `:3718-3748`; item slots from `TBL_ITEM_TEMPLATE`). `closeOnKey == 0` hides the crit controls (`:3750,3815-3818`) - polarity trap noted in Go memory.
- Actions: sign `call("dailySignInActDoSignin", Responder(onDailySignInActDoSignin))` (`:6127`); reply `{data, date}` (`onDailySignInActDoSignin :3495`) - also marks icon of `date` and refreshes buttons.
  Claim lucky `call("dailySignInActGetAward", Responder(Number))` (`:3020`; truthy disables button `:3895`). Retroactive `call("dailySignInActRetroactive", null)` after
  Alert (`toRetroactive :3820`; if all previous days signed -> Alert `DAILY_SIGNIN[17]` and no RPC). Crit `call("dailySignInUpActCrit", null)` after Alert `DAILY_SIGNIN[14]` (blocked at crit>=100 with `[16]`, `upCirticalProbablity :3843`).
- Pushes (method names are panel methods; dispatch name inferred): `setBtnsDailySignInAct(data)` (`:3058-3062`, replaces `data`, recomputes button enables `setBtnsEnable :2709`),
  `oninitDailySignInActConsumeLimit(Number)` (`:3099`; <0 hides; text "Trong thời gian sự kiện số vàng và điểm thưởng tiêu phí tích lũy:{n}"), `updateDailySignInActCrit(Number)` (`:4759`).
- Button logic (client): claim-lucky enabled iff `getAwardTime.day>0 && today==getAwardTime.day && !getAwardTime.flag && every day up to today signed` (`:2712`); sign enabled iff `!actDays[today]` (`:2720`).
- Strings: `DAILY_SIGNIN[0..17]` (`Language.as:8648-8665`, overridden at 8746/9255-9256): title "Báo Danh Nhận Quà"; "Mỗi thứ {day} (ngày vui vẻ)"; "Mỗi thứ {day1} (ngày cảm ơn)... nạp 1 lần {point} Vcoin nhận {gold} Vàng"; "Tỉ lệ Bạo： {num}%";
  "Ký bù"; "Xác nhận dùng {num} điểm để ký bù?"; "Tăng Tỉ lệ Bạo kích"; "Số ngày ký tên tháng này đã hết"; "Tỉ lệ Bạo kích đạt 100%". Hard-coded: "Trong thời gian sự kiện số vàng và điểm thưởng tiêu phí tích lũy:".
- Server-only rules to keep (from Go memory, **not client-verifiable**): level >= 50 gate, +5% crit per sign/retroactive, retro 50 / crit 100 prices, weekday numbers surprise=6/lucky=4. Tables: `data_daily_signin_rewards`, `data_daily_signin_lucky_tiers` (seeds exist).

## A3. Daily activity panel + diary (activity points)
- `DailyActPanel` (`ViewManager.DAILY_ACTIVITY = 20001`; icon id 0). Also the same diary UI is duplicated in `GameIntroPanel` (`PANEL_GAMEINTRO = 824`, tab 9 diary, `:6986-7052`).
- Tabs (`DailyActPanel.as`): tab 0 event calendar; tab 1 diary (activity points) lazily calls `getCharDiaryData` once per panel reset (`initVBox :1522-1533`).
- Calendar data is **embedded in the client**: a ~16-`Activity` XML (`:1300-1426`) with attributes `Name, linkType, resCode, NID, NPC, MID, LINE, HID, Time, Level, Award(JSON)`; nodes `Activity, Boss, FB, LevelUp, EarnMoney, Treasure, Sports`.
  `Time="d1,d2|HH:mm-HH:mm"` (`-1` = every day). **Weekday decode** (`utils/TimeUtil.as:29`): token `d` matches JS `getDay() == (d+1)%7` (so `0`=Monday ... `6`=Sunday; `1,3,5` = thứ ba/năm/bảy, matching `ACTIVITY_CANVAS[3]`).
  Status text `DAILYACT_U[5]` "Chưa mở" / `[3]` "Đã mở" / `[4]` "Đã kết thúc" (`TimeUtil.decodeTimeObj :19-52`); a 10-minute pre-start flag turns the activity button red (`:1066-1078`). `initPenalConfig :1015` is re-run by a timer (`ActivityCanvas.timerHandler :1104`).
  linkType 1 NPC link `L_N|nid|name`, 2 panel `L_OPEN_PANEL|id`, 3 enter act `L_ENTER_ACT|...`, 4 map `L_MA|mid|name` (`:1105-1140`). Examples of rows: "Mê Trận" lv120 all day; "BOSS Thế Giới" `1,3,5|14:30-15:00` lv50 kênh 3; "Đố vui có thưởng" `1,3,5|20:00-20:20` lv10; "Chiến Trường Dũng Sĩ" `4|21:00-22:00` lv50; "Bang hội chiến" `4|20:00-21:00` lv30; "Võ Đài Đông Huyền" `0|19:00-20:00` lv50.
- `call("getDailyPanelAwardState", Responder(setButtonState), null)` on panel show (`:953`): reply flags `{gameintro, txkcBtn, txkcBtn2, fback, autot, vip}` (red circles on buttons, `:1578-1650`);
  client hides `findback` + `txkcBtn` below level 50 and `autoTask` below level 20 (`:1590,1623`).
- `call("getTodayOnlineTime", Responder)` (`:1768`; `GameIntroPanel.as:4243`; `Core.as:344`): reply `{t:int minutes online today, f:int claimed count (optional)}` (`:2794-2797`); panel ticks +1 per minute locally and resets at date change (`onTimer :1538`); displayed as "{h}h{m}m" (`GAMEINTROPANEL_U[43..45]` "Đã online","h","m").
- Diary: `call("getCharDiaryData", Responder(onGetDiaryData))` reply keys = TBL_DIARY `id` -> count, plus `act` (int, total activity points) and `ad` (bool, today's chest already claimed) (`onGetDiaryData :1713`); push `updateDiaryData(id:String, val:int, act:int)` (`:2314`, also `GameIntroPanel.as:10381`; `act>=0` overwrites the total).
  Row text `"{val}/{max}"` or `"{val}/Không giới hạn"` (`GAMEINTROPANEL_U[41]`); `_st=1` when `val==max`. Table `TBL_DIARY` (44 rows, `docs/database/details/TBL_DIARY.md`: `name, info, act, max, nid, linkType, pos`).
- Chests: 5 buttons `actBtn0..4`, ids = last char of button id; enable thresholds on `totalAct`: **30, 60, 120, 210, 360** and only while `!_haveDiaryAwarded` (`:2174,2200,2226,2252,~2278`). Items `giid` 3255..3259 (`:503,542,581,620,659`).
  `call("getDailyActAward", Responder(func), id:0..4)` reply `{f:bool}` -> `_haveDiaryAwarded = f` (`:1280-1294`). Only one chest per day (`GAMEINTROPANEL_U[40]`: "1. Bảo Rương Năng Nổ mỗi ngày chỉ nhận 1 lần ... reset vào ngày hôm sau").
- Strings: `DAILYACT_U[0..17]` (`Language.as:5635-5652`): "Mở giao diện", "Nhấp chọn chuyển dịch", "Trạng thái", "Chưa mở", "Sự kiện hàng ngày", "Sự kiện hôm nay", "Tất cả kênh", "Giới thiệu sự kiện", "Phần thưởng";
  `GAMEINTROPANEL_U[31..40]` "Độ năng nổ", "Nội dung sự kiện", "Số lần", "Điểm hiện tại", "Cần {num} điểm", "Nhận", "Phần thưởng năng nổ".
- **Open (A3):** which gameplay events bump which diary row is server-side (Go `handlers/**`); client only renders.

## A4. Online time reward + offline exp + double exp
- Online timer (`system/Core.as`): `initTimer :344` -> `call("getTodayOnlineTime")`; `onGetTodayOnlineTime :2273`: remaining = `(f+1)*ONLINE_ACT_AWARD_DURATION(30, GamePredef.as:2119) - t` minutes; <=0 -> `onTimer`, else timer delay = remaining*60000.
  `onTimer :737`: `call("getDailyOnlineAct", Responder(int))`: `-1` -> `initTimer()` again, `>0` -> restart timer with that many minutes, `0`/other -> stop. The reward itself arrives as an award warning (below). `getDailyOnlineAct` args none.
- Award warning HUD (`view/view/compMain/AwardWarnCanvas.as`, `ViewManager.MAIN_AWARD_WARN`): `Core.addAwardWarn(obj)` (`Core.as:1010`) pushes `{warnType, restTime(ms), ...}`; `GamePredef.WARN_TYPE_*` (`:854-871`: P2PWISPER 10, ADDMAIL 20, FINDTEACHER 30, FINDSTUDENT 40, AWARD 50, QUESTIONING 90, FARM_RIPE 100, GROUP_CHAT 110, GROUP_APPLY 120, REGISTER_DXD 130, GROUP_INVITE 140, FEASTIVAL/WORLDBOSS 150, REDENVELOPE 160).
  Click on an AWARD/FEASTIVAL warn opens `AwardPanel.init(restTime, warn)` (`AwardPanel.as:236`, `AwardPanel` = `PANEL_AWARD 680`): countdown in minutes (`Timer(60001)`), then button -> **`remote.takeSPGift()`** if `awardItem.sp` else **`remote.takeNewGift()`** (`:297,301`; both fire-and-forget; `RPC_DELAY` 1000 ms, `config/RPCConfig.as:56-57`), only if bag/pet slot free else `sysMidNote(AWARDPANEL_S[2])` "Túi đồ đã đầy!".
  Strings: `AWARDPANEL_S[0..1]` "Đây là phần quà do hệ thống tặng, vui lòng đảm bảo có ít nhất 1 khoảng trống để có thể nhận" / "Sau {time} phút nữa, bạn sẽ nhận được 1 phần quà thần bí do hệ thống tặng ...", `AWARDPANEL_U[0..3]` "Nhận thưởng", "Hủy", "Thưởng hệ thống", "Quà bí ẩn". Result (item) arrives through standard `onAddCharactorSlot`/bag pushes (**inferred**).
- Offline delegation: `AutoExpPanel` (`ViewManager.MAIN_AUTO_EXP = 123`, `Language.AUTOEXPPANEL_U[0]` "Ủy thác offline"). Reads `player.offlineTime` (seconds) at show (`:1905`). Player tab: type 0 free (exp/h = `BASIC_GET_EXP[level]*0.3`), 1 silver (x1, cost `ceil(BASIC_GET_MONEY[level]*0.2*hours)`), 2 gold (x2, `10*hours` vàng), 3 gold (x3, `20*hours`) (`calcExpPerHour :2438`, `calcMoneyNeeded :~1940-1975`).
  Pet tab visible only if `battlePet.binded == 1`; pet exp/h = `BASIC_GET_EXP[petLevel] * {2,3,5}`.
  RPC `call("getOfflineExp", Responder(int), type:uint 0..3, hours:Number)` (`:1298`) and `call("getPetOfflineExp", Responder(int), type, hours)` (`:1797`); paid types first `call("unlockMoney", Responder, MD5(pw))` (`:1165,2094`).
  Result codes (`onGetOfflineExp :2224`): `1` ok (player: subtracts hours*3600 s if partial else zero; `2` ok pet), `-2` "Cấp độ không đủ, không thể ủy thác!", `-3` "Không đủ bạc!", `-4` "Không đủ vàng!", `-5` "Không tìm thấy pet chiến đấu!", `-6` "Pet đã vượt quá bạn 5 cấp, không thể tiếp tục nhận kinh nghiệm!", `-7` "Người chơi cấp dưới 60 cần trả vàng mới có thể nhận kinh nghiệm!", `-8` "Pet cần khóa!", `-9` "Kinh nghiệm pet đã đạt giới hạn!", `-1`/default "Nhận kinh nghiệm ủy thác thất bại!" (`AUTOEXPPANEL_S[0..9]`). Level >= 30 gate is text (`AUTOEXPPANEL_U[1]`).
  Client needs `BASIC_GET_EXP`/`BASIC_GET_MONEY` (`GamePredef`) - available in the client constants; the server must apply the identical formula. `player.offlineTime` is delivered in the login `cData` (stub; **unconfirmed key**).
- `checkDoubleExpTime`: **not referenced anywhere in the decompiled client** (grep over `docs/client` finds nothing) -> server-only/legacy; skip.

## A5. Festivals, login award bundles, gift codes (`GameIntroPanel`, `AwardPanelAll`)
- Feast: `call("getCurrentFeast", Responder(onGetFestToday))` (`GameIntroPanel.as:3943`). Reply `{id:int (0/neg = none), enable:0|1, data?:{aw,inf,na}}`; `TBL_FEAST[id]` supplies `na` (name), `inf` (description), `aw` (item template id), `at` (active window "h1-h2|m1-m2|d1-d2|dow1-dow2", server scheduling) (`:3886-3926`).
  `enable==1` fills `festSlot.giid = aw` and enables the claim button; claim = `call("takeFeastGift", Responder(onGetFestGift))` (`:6627`), any truthy reply clears slot + disables button (`:7242`). Strings `ACTIVEPANEL_S[4]` ("... {festv.na}") / `[5]` (no festival).
  Also a `WARN_TYPE_FEASTIVAL (150)` warning with `restTime`.
- Login bundle tab: `call("getTodayAward", Responder(onGetTodayAward))` (`:6349`) reply `{dailyAward:planId, dailyDisc:planId, contiLoginDay:[days, planId]}` (`:10899-10915`), planIds -> `TBL_PLAN {ti,ii,n}`.
  Claims: `call("getLoginAward", Responder(onGetDailyAward))` (`:4584`), `buySystemItemClient(slotId,1)`/`buyDiscountGift(slotId)`/`buyContiGift(slotId)` (`:4382,10794,4669`, guarded by `unlockMoney` pw). Continuous-login milestones `CONTI_GIFT_DAY = [8,18,28,48,68,88,108,128,158,188,218,258,308,358,408]`, then every 30 days after 408 (`:3309,7098-7120`).
- Gift codes: `AwardPanelAll` (`PANEL_AWARD_ALL = 810`, opened from `MiniMapCanvas.as:1825`): input -> `remote.uc(code)` (fire-and-forget; `:320`) only if bag has a slot (`AWARDCODEPANEL_S[0]`) and code starts with `N|G|D|A|O` or has length 9 (`PRE_1..PRE_O :58-62`, `:318`);
  `remote.gtg()` = "Nhận túi quà hệ thống" (`:519`, `AWARDALL_S[2]` "mỗi phút chỉ có thể nhận 1 lần"); `call("serchForGift", Responder(bool))` (`:412`) shows item 2059 icon if true; `remote.searchGameGift()` (`:433`) and `call("getGameGift", null, obj)` (`GameIntroPanel.as:7715`) for the homepage/VIP gift bag.
  Strings `AWARDALL_S[0..3]`: "Nhận mã kích hoạt (Điền mã nhận thưởng của sự kiện hoặc thẻ người chơi mới sẽ nhận được phần thưởng tương ứng)", "Nhận túi quà trang chủ (Vui lòng nhấn vào đây để nhận túi quà trang chủ và túi quà VIP)", "Nhận túi quà hệ thống (...)", "Nhận".
  **Unconfirmed:** code content and the server push names (stub). A real implementation needs a gift-code table of our own (no legacy seed found: `ls supabase/seeds | grep -i gift` = none).
- `RPC_DELAY`: `takeSPGift`/`takeNewGift` 1000 ms; others unlisted.

## A6. Tutorial guide (TBL_GUIDE, `Core.as`)
- Table `TBL_GUIDE` (79, 46 rows, indexed by `type`): `id,type,level,finishType,promptText,promptType,reference,scPid,scQname,scNpcid,scOtherId,findNpcId,mouseX,mouseY`. `type 0` = 34-step main chain, `2` = 10 steps, `9`, `11` one each; `promptType` 0 bubble (`GuidePanel.showGuide`), 1 alert (`POP_NEW_PLAER_ALERT`); texts largely Chinese in the export.
- Startup: `Core.initNewPlayerGuide(doneMap)` (`:266-296`; **no caller in the decompile** - sits behind the CallBack stub, inferred from `onChooseCharactor`). `doneMap[stepId]` truthy = completed. For every guide row where `row.level >= player.level` (note: the comparison is *row level >= player level*, i.e. only low-level players see the guide) and not done, the first row per `type` becomes `lastIdxs[type]`. Gate flag `Core.newPlayerGuideOpen = true` (`:116`).
- Advance: `nextGuide(scPid, scQname, scNpcid, _, scOtherId)` (`:2134-2161`): `checkGuideCondition` matches `lastIdxs` rows on `scPid==ViewManager id`, `scQname==quest name`, `scNpcid`, `scOtherId` (`:758-775`), then **`remote.call("saveGuideLog", null, stepId)`** (`:2148`, fire-and-forget, arg = TBL_GUIDE id int), `lastIdxs[type]++` (**assumes consecutive ids per type**), deleted if `finishType > 0`; show bubble/alert.
  Finish: `checkFinishGuides(scPid, scQname, scNpcid, _, finishType)` (`:686-756`) saves the log for the matching step, hides `POP_NEW_PLAER_GUIDE`, deletes the type, then `call("getDailyOnlineAct")` (side effect unrelated).
  Callers (examples): `QuestPanel.as:589,793,945`, `NpcFuncPanel.as:834`, `AIConfPanel.as:1292,1363,2194,2448`, `Slot.as:1554`, `MiniMapCanvas.as:744`, `FazendaPanel.as:670`, `PetFightConf.as:1235` (`GUIDE_TYPE_PET_FIGHT_AI`). `GamePredef.GUIDE_TYPE_*` `:1995-2007` (0 FINISH_QUEST ... 10 MAGIC_ADD_BAG).
- Server: persist `guideLog` per character and echo into login payload; `saveGuideLog(stepId)`. Everything else is client engine -> **port only if panels referenced exist** (most `reference` ids are panels not in H5) - recommend a minimal subset or defer.

### Proposed shared types (A)
```ts
export interface ActivityStripEntry { id: number; type?: 0 | 2 | 3 | 4; flag: boolean | number; sortType: number; }
export type ActivityStripList = Record<string, ActivityStripEntry>;           // startedActList / updateActivityList
export interface UpdateActivityStatePush { id: number; sortType: number; flag: 0 | 1 | 2; }
export interface SignInData { continueSigninTime: number; signinedToday: boolean; signedYesterday: boolean; }  // getSignInData/signinNow
export interface DailySignInData { actYear: number; actMonth: number; actDays: Record<string, boolean>; crit: number;
  getAwardTime: { day: number; flag: boolean | number }; }
export interface DailySignInInit { time: { year: number; month: number; date: number };
  conf: { start: number; luckyDay: number; surpriseDay: number; luckyPoint: number[]; luckyGold: number[]; retroactivePrice: number;
    critPrice: number; closeOnKey: number; iInfo: { inc: 1 | 2 | 4; iid: number; number: number }[] }; data: DailySignInData; }
export interface DailySignInDoReply { data: DailySignInData; date: number; }
export type DiaryData = Record<string, number> & { act?: number; ad?: boolean };      // getCharDiaryData
export interface UpdateDiaryDataArgs { id: string; val: number; act: number; }         // push args
export interface TodayOnlineTime { t: number; f?: number; }                            // minutes, claimed count
export interface AwardWarn { warnType: number; restTime?: number; sp?: boolean; [k: string]: unknown; }
export interface CurrentFeast { id: number; enable: 0 | 1; data?: { aw: number; inf: string; na: string }; }
export interface TodayAward { dailyAward?: number; dailyDisc?: number; contiLoginDay?: [number, number]; }
```
Server: `modules/activity/` (strip, diary counters, feast, online-time), `modules/signin/` (two panels, one ledger), gifts in `modules/activity/gift.*`. Client: `ui/hud/activityStrip.ts`, `ui/panels/signIn.ts`, `dailyAct.ts`.

---------------------------------------------------------------------------------------------------------------------------------

## B. VIP / PM

### Files
`view/view/compDragable/PmPanel.as` (`PANEL_PM = 852`), `PmInfoPanel.as` (`PANEL_PM_INFO = 853`, rights comparison from `desc2`, hides right id 15, `:410-420`), `VipShopPanel.as` (`PANEL_VIP_SHOP = 855`, activity id 19), `PMAuctionPanel` (`PANEL_PM_AUCTION 856`, gate pmLevel>=3 `AuctionPanel.as:1374,1557`), `view/view/compMain/PortraitCanvas.as` (VIP button `showPmPanel :986` -> `PANEL_PM.initPanelData(arg)`; head badge `ResManager["PM_ZUAN"+pmLevel]` `:579,741`), `object/Charactor.as:18` (`pmLevel:Number`).
Table `TBL_PM_RIGHT` (95; 35 rows; `docs/database/details/TBL_PM_RIGHT.md`): `id, desc (HTML with {num}), desc2, type (1 open-once / 2 repeatable claim / 3 passive / 4 special), sortIndex, countConfig "v1|v2|max", value1..9, vip1..9`. Seed `data_tbl_pm_right.sql`.

### Panel flow (explicit)
- `initPanelData` ends with `call("initPmData", Responder(onInitPmData))` (`PmPanel.as:1567`). Reply (`:1846-1899`): `{flag:int pmLevel 0..9 (0/absent = not VIP), date:ms server now, findback:bool, processFlag:{rightId:{day,type,time}}, data:{pmExp:int, activeType:1..3, keepDay:int, activeTime:ms}}`. `_core.player.pmLevel` is set from `flag`. Expiry text = `activeTime + keepDay*86400000` shifted by `getTimezoneOffset` and `serverTimeOffSet`: "Dừng đến {time}" (`PM_PANEL[32]`) formatted `yyyy/M/d H:m:s` (non-padded).
- Buy: three cards (`monthCard`, `tMonthCard`, `hYearCard`) -> `buyPm(level 1..3)` (`:868`): Alert `PM_PANEL[34]` "Tiêu {gold} để mua {name} ({day} ngày)?" with `_levelGold = {1:688, 2:1688, 3:2888}` (`:585`), days 30/90/180. If already VIP: higher card -> Alert `PM_PANEL[35]` "Đổi thẻ thấp thì không thể kéo dài thời gian VIP, xác nhận đổi?" (that string is used when `level > _pmType`, per code), equal -> `[30]` "Xác nhận mua kéo dài thời gian VIP?", lower -> `sysMidNote([31])` "Không thể đổi thẻ cao cấp hơn" and no RPC. RPC `call("buyPm", Responder(onBuyPm), level)` (`:879`).
  Reply `onBuyPm` (`:1406`): `{level:int, data:{pmExp, activeType, keepDay, activeTime}}` -> updates `player.pmLevel`, exp bar, badge, rights list.
- PM level from exp: `_levelUpExp = [0,15000,45000,105000,205000,355000,555000,805000,1105000]` (`:581`; progress bar frames `level*7.5 + n*0.83`, max 60 frames; greyscale filter when not VIP).
- Rights list (`showInfoByLevel :1614`): rows sorted by `sortIndex`, row shown iff `row["vip"+level]` truthy; text `"{n}: " + desc` with `{num}` -> `row["value"+level]`; for `type != 3` a clickable label (only active when `player.pmLevel == viewed level`): type 1 "Mở" (`PM_PANEL[6]`), type 2 "Nhận ({done}/{max})" (`[7]`) using `countConfig.split("|")[2]` and `processFlag[id]`, completed -> "Đã nhận" (`[8]`, red). Header: VIP -> `PM_PANEL[10]` "Thành viên {pm}:{name}" (tier names `[11..19]`, e.g. "[VIP1]".."[VIP8]" at `[21..28]`, `[29]` diamond), else `PM_PANEL[9]` "Thành viên VIP:{name}".
- Claim: `doPmOperation(event)` (`:1295-1330`): no RPC for id **18** (opens `PANEL_JEWEL_EXCHANGE`) and **25** (opens `PANEL_STAR_EXCHANGE.open()`); id **24** (findback) greys button first; else **`remote.call("doPmOperation", null, rightId)`** (fire-and-forget; arg is the *button name*, i.e. the id **as a string label**, `:1329`).
  Result push `flushProcesFlag({index, day, type, time})` (`:725-800`, updates `processFlag[index]` and the label; `type 1` per-day counter, `4` findback skips counter). Server errors arrive as `onSystemSay` strings (Go: "Hôm qua đã nhận hoặc quá hạn nhận", "Bạn đã nhận thưởng, vui lòng quay lại sau!").
- Client-side gates that depend on pmLevel (explicit, the server must stay consistent): Auction PM panel pmLevel>=3 (`AuctionPanel.as:1374,1557`); Pet soul pmLevel>=5 / >0 (`PetSoulPanel.as:1543,2496,2511`); Lottery/PetHandbook/PetEvolution require pmLevel>0 (`LotteryPanel.as:913,1685`, `PetHandbook.as:2410,3742`, `PetEvolutionPanel.as:2475`); CardGame bonus plays `+= pmLevel*5` (`CardGamePanel.as:90,2831`);
  right **8** value%/tier added to material-mix success display when `materialMixBasicRate==6` (`EquiptFuncPanel.as:12595-12610`); right **6** added to pet joining rate (`PetFuncPanel.as:4490-4526`); right **9** (wing) `WingFuncPanel.as:6956`. Display-only: server must apply the same bonuses.
  `Charactor.pmLevel` also travels in scene player payloads/chat (`CharactorInfoPanel.as:1468`, `CharactorPanel.as:5799`); `packages/shared/src/social.ts:44` already has `pmLevel`.
- Right ids with reward mapping are server-defined (Go memory `docs/memory/pm-vip-system.md`): 2 = bound-silver coupon (`value1..9`), 3 = daily buff `BUFF114044` family 2504..2510,3308,3309 via `upLongBuff` (H5 has `modules/buff`), 7 = item 3630 x level-based, 10 = monthly VIP bag 3231+min(lv,7), 1/13 unresolved, 24 findback (`type 4`).

### VIP shop (`VipShopPanel`)
- Open (`initPanel :1008-1019`): `call("getVipShopConfig", Responder(onGetVipShopConfig))` (`:1018`). Reply `{flag:bool, vipShop:{idx:slot}, reflashTime:ms, shopDynamic:[{cid,cName,type,itemId,num,time}]}`; `flag==false` -> Alert `VIPSHOPPANEL_U[11]` "Sự kiện đã bắt đầu!" and abort (`:558-572`).
- Personal refresh button: requires `pmLevel > 0` else Alert `VIPSHOPPANEL_U[14]` "Chỉ có VIP mới có thể sử dụng Shop VIP!"; Alert `[13]` "Xác nhận tốn {gold} vàng để làm mới shop?" with `GamePredef.VIP_SHOP_REFLASH_GOLD = 20` (`predef/GamePredef.as:1558`) then `call("getVipShopCharConfig", Responder(onGetVipShopConfig))` (`:796`). Timer refresh -> `getVipShopConfig` again (`:1070`).
- Buy: `call("buyVipShopItem", Responder(onBuyVipSlotSelected), slotData.id, num)` (`:544`), reply `{flag, shopDynamic}`; password guard `call("unlockMoney", Responder, MD5(pw))` (`:1225`). Catalog `TBL_SHOP_SLOT` where `sid = GamePredef.VIP_SHOP_ID = 99` (`:1557`). Strings `VIPSHOPPANEL_U[0..15]` ("Shop VIP", "Làm mới", "Tất cả vật phẩm", "Bảng may mắn", "Mua", "Lập tức là mới", "Thời gian làm mới lần sau:{time}", "{name} mua {item}", ...).
- Rules from Go (not client): 4 h shared rotation of 6 slots, discount 2..50% by tier, personal refresh 1 free then 20 gold up to 5 per day (`docs/memory/vip-shop.md`).

### Shared types (B)
```ts
export interface PmProcessFlag { day: string; type: number; time: number; }
export interface PmData { pmExp: number; activeType: 1 | 2 | 3; keepDay: number; activeTime: number; }
export interface InitPmDataReply { flag: number; date: number; findback: boolean; processFlag: Record<string, PmProcessFlag>; data: PmData; }
export interface BuyPmReply { level: number; data: PmData; }
export interface FlushProcessFlagPush { index: number; day: string; type: number; time: number; }
export interface VipShopSlot { id: number; sid: number; itemId: number; gold: number; priceAll?: number; flag?: boolean; [k: string]: unknown; }
export interface VipShopConfigReply { flag: boolean; vipShop: Record<string, VipShopSlot>; reflashTime: number;
  shopDynamic: { cid: number; cName: string; type: number; itemId: number; num: number; time: number }[]; }
export interface BuyVipShopItemReply { flag: boolean; shopDynamic: VipShopConfigReply['shopDynamic']; }
```
Server `modules/vip/` (pm.service, pm.rpc: `initPmData`, `buyPm`, `doPmOperation`; vipshop.rpc). Client `ui/panels/pmPanel.ts`, `vipShop.ts`; HUD VIP button + head badge in `portrait.ts`.

---------------------------------------------------------------------------------------------------------------------------------

## C. Bosses / events / quiz / maze / lotto

- **Boss daily** (icon 49, `PANEL_BOSS_DAILY = 931`, `BossDailyPanel.as`, rows `comp/BossDailyRect.as`): `call("bossDailyGetData", Responder(onGetData))` (`:1906`) reply `{total:int, t:ms server now, data:{n:int used today, data:{bossNpcId:{n,t}}, dfd:{bid:bid}}}` (`:1463-1484`, `BossDailyRect.as:380-440`).
  Per-boss static config embedded in the client (`BOSS_DAILY_CONFIG :413`, keyed by NPC id: `type (1 = count-limited with num, else cooldown with step ms), isSuper, num, s, x, y, award text`; wild list `:1126`). Level filter tabs `BOSS_DAILY_PANEL[7..12,19]` (Lv0~49, 50~79, 80~99, 100~119, 120~139, 140~150, 151~170). Row state: `"Khả chiến (n)"`, cooldown "(Hs/m)", "Thưởng suy giảm" when boss level > player+10 (wild boss, `BossDailyRect.as:392-396`).
  Fight: `call("bossDailyBattle", null, bid)` after Alert `BOSS_DAILY_PANEL[18]` "Xác nhận khiêu chiến?" (`BossDailyRect.as:230`); quick finish `call("bossDailyFinishByCard", null, bid)` after Alert `[23]` (needs a win first, `dfd[bid]==bid`; `[21]` "Chưa khiêu chiến", `[22]`, `[24]`, `[25]`) (`:294`). Both fire-and-forget; result is a battle start / refreshed data (`onOpenBossDailyPanel` push per Go memory, inferred). Title `BOSS_DAILY_PANEL[0]` "Sổ Tay Ma Thú", "Khiêu chiến hôm nay", "Số lần còn lại：{num}". Server default total 16 (Go memory). Rating **yes** (depends on combat vs boss npc; H5 combat exists).
- **World boss**: icon 15 -> `canEnterWbMap(player.id)` (also `MiniMapCanvas.as:2146`); WB rank canvas `WbRankCanvas` (`MainLayer.as:1185`). `TBL_SCHEDULE_BOSS` seed exists (`data_tbl_schedule_boss.sql`, memory `schedule-boss.md`). **Partial**: spawn schedule server-side.
- **Nine boss** (icon 13, `NINE_BOSS_PANEL = 845`, lv130): `NineBossPanel.initNineBossPanel()`; `call("getNineBossAward", Responder(onInitPanel), floorId, 1|2)` (`NineBossPanel.as:1273,1291`; `, null, floorId, 2` at `:1313`); rank via `getNineBossRankByClient` in `ActivePanel.as:2829` (covered by the ranking milestone). Payload keys not studied (**unconfirmed**).
- **Consume/recharge events** (`GameIntroPanel`): `getConsume` (`:8363`), `getConsumeAwardList` / `takeConsumeAward` (`:8419,9503`), `getStageConsumeAwardList` / `takeStageConsumeAward(n)` (`:7066,8648`; claim allowed only after the stage `end` timestamp, stage 5 after `start`), `getShopAward` (`:7962`), `getPointAward` (`:8084`), `getConsumeNoticeData` (`ConsumeNoticePanel.as:212`, icon 78). Panels are event-window driven and shop-coupled: **no** (needs event config we do not have).
- **Quiz "Đố vui có thưởng"** (icon 16 type 3, `QuestioningPanel`, `PANEL_QUESTIONING = 825`, table `TBL_ANSWER` 3627 rows `{id,t,a,b,c,d,r}` seed `data_tbl_answer.sql`; `r` has 3 lowercase `"c"` rows): window "1,3,5|20:00-20:20" (calendar) / text "20:05 - 20:07 thứ ba, năm, bảy" (`ACTIVITY_CANVAS[3]`).
  RPCs: `call("subQuestionApply", Responder(onSubApp), null)` (`:1813`) reply `{apply?, f:bool, rtime, wtime, qnum, sec?}` (`:927-1004`); `call("subAnswer", Responder(onSubAnswer), choice)` (`:1194`) reply int 1 right / -1 wrong / 4,3,2 notices; `call("dropQuestion", null, null)` (`:1219`); items `useXLY`/`useFDJ`/`useXYX` (`:1327,1574,1577`; replies `{a}`/`{d}`/...). Pushes (panel methods, **dispatch names unconfirmed**): `showQuestion({qnum,qid})` (`:680`; `qid` -> `TBL_ANSWER`), `onQuestionRank({rank:[{cl,...}], self:{order,pnt}})` (`:1128`), `onQuestionFinish()` (`:1827`). Strings `QUESTIONING_PANEL_U[0..33]`. **Partial.**
- **Maze (Mê trận, icon 27 lv120)**: `MazePanel` (`PANEL_MAZE = 881`), RPCs `getMazePreDate`, `enterMaze`, `refreshMaze`, `getMazeData`, `mazeLeave`, `mazeBuyRecoverNum`, `mazeBuySkipNum`, `mazeConfirm`, `mazeSkip`, `mazeRecover`(battle), `getMazeLottery`, `mazeDrop`, `getMazeShopItem`, `buyMazeShopItem`, `answerMazeQuestion({answerNum,rightNum})` (`MazePanel.as:462,634,1130`; `MazeInfoPanel.as:2051-3163`; `MazeQuestionPanel.as:469`). Table `data_tbl_maze` seed exists. **No** for M8 baseline (large standalone game).
- **Lotto**: icon 21 `LotteryPanel` (`getLotteryData` `:1102`, requires pmLevel>0 `:913`), `LotteryBagPanel` (`getLotteryBag`, `getAllLotteryItem`, `getSingleLotteryItem`, `throwAllLotteryItem`), `LuckDrawPanel` (icon 23), `DoubleElevenPanel.fLotteryByClient`. Both icons are `enable=false` in the Go seed -> **skip**.

---------------------------------------------------------------------------------------------------------------------------------

## D. Loop quests (depth), marriage, farm, dress/runes, life skills, PVE, mounts

### D1. Loop quests (`TBL_QUEST_LOOP` + type-7 `TBL_QUEST`) - rating yes
Files: `view/view/compDragable/NpcFuncPanel.as` (NPC dialog "[Vòng]" entries), `QuestManager.as` (loop tab), `object/Player.as:146 (loopTakeTime), :2097 isTakeLoop`, `system/Core.as:135 (loopQuestStartTime)`. Data `docs/database/details/TBL_QUEST_LOOP.md`, seed `data_tbl_quest_loop.sql` (11 rows), type-7 rows in `data_tbl_quest.sql` (`sub_type "7-<lid>"`, 1395 matches for `'7-`). Go memory `docs/memory/quest-loop-system.md` (all gates server-side).
- Table fields: `id, name, info (HTML rules), nid (offering NPC), num (rounds), min_level, max_level, refresh (cooldown s), team, script_get, script_give_up` (+ `isRebirth` read by client at `QuestManager.as:1050`, absent from the seed columns -> treat 0). Seed rows (id: nid / num / refresh / level / team): 1: 48/60/43200/min200 (disabled), 2 (guild, needs guild): 1069/15/600/30-160, 3: 246/10/600/min200 team2, 4 "Nhiệm Vụ Trị An": 277/10/600/30, 5 "Rèn Luyện Pet": 280/20/600/50, 6 "Nhiệm Vụ Tu Luyện": 434/20/600/70 team1, 7 "Nhiệm Vụ Thần Tu": 929/10/600/50 team1, 8 "Nhiệm Vụ Vong Hồn": 250/10/600/min200, 9 (200 vòng): 48/200/259200/70, 10: 1519/10/600/min200 team2, 16 "Nhiệm Vụ Trừ Ma": 3/10/600/50 team1; 1 = "Nhiệm Vụ 60 Vòng" (min 200, effectively disabled). Seeds with min_level 200 never match the client level filter (`QuestManager.as:1058`).
- Entry: NPC click -> `npcFuncInit` payload `loopInfo:{flag:bool, d:{lid:{canTake:bool}}}` (`NpcFuncPanel.as:770-777`; `protocol.ts:225` already types it as unknown). For each `lid` with `canTake` the dialog lists `"<TBL_QUEST_LOOP.name>[Vòng]"` (`NPCFUNCPANEL_S[2] = "[Vòng]"`, `:336-354`, `type:2`, state icon `ST_QUEST_CANTAKE`).
- Take: click -> `remote.takeLoop(lid, npc.id)` (npc.id = -1 when no npc, `:573-583`, fire-and-forget) - **no client validation**. Expected pushes (from `QuestManager`/Go): the new round arrives as the regular quest add push (`onAddChaQuest` per Go memory) and the loop state `player.loopList[lid] = {id, qid, takeDate, ft, finished}` (the `"l"` field of `initQuestManager`).
- Loop tab (`QuestManager.initLoopeQuest :1018-1092`): list = active loops (`player.loopList` with `finished<=0 && ft<num`, icon `ST_QUEST_ISTAKE`, type 1) + every `TBL_QUEST_LOOP` row whose level range matches (`isRebirth>0` -> `levelRe` else `level`, `min<=lvl<=max`) and not taken (type 2). Sort by type then lid. Detail pane (`:877-960`): `info` HTML, "Số vòng: <red>ft+1/num</red>", "Nhiệm vụ hiện tại: <quest link>" (`QUESTCANVAS_S[16..17]`), cooldown "(Thời gian chờ để nhận lần tiếp theo: {minute} phút)" (`QUESTMANAGER_S[7]`) computed as `((now + timeLag - takeDate)/1000) - refresh` < 0 (`ceil(abs/60)`), for not-taken loops uses `player.loopTakeTime[lid]` (and `loopQuestStartTime[51]` for lid 6, `:941`), offering NPC name + map link ("Nhiệm vụ" `QUESTMANAGER_S[3]`).
  Buttons: `loopRepaireButton` ("repair") visible when the loop is active but **no quest in `questList` has `data.subType == "7-<lid>"`** (`:895-920`) -> `remote.loopRepaire(lid)` (`:795-803`, hides the button); `cancelLoopButton` -> Alert `QUESTPANEL_S[20]` "Xác nhận xóa nhiệm vụ vòng này?" -> `remote.cancelLoop(lid)` (`:805-818`, both fire-and-forget).
- Pushes (payload confirmed from handlers in `QuestManager.as`; names `onCancelLoopQuest`/`onFinishLoopQuest` are the method names, dispatch inferred as the same):
  - `onCancelLoopQuest({flag:bool, id:int(loop id)})` (`:1135-1165`): flag true -> `sysBlueMsg("Từ bỏ nhiệm vụ vòng: [name]")` (`QUESTPANEL_S[17]`), `loopTakeTime[id] = loopList[id].takeDate`, delete loop entry, refresh list, `setNpcState(nid)`; flag false -> `sysMsg("Không thể xóa vòng vừa nhận!")` (`QUESTPANEL_S[19]`).
  - `onFinishLoopQuest({id, ft})` (`:1178-1210`): sets `loopList[id].ft`; `ft == num` -> `loopTakeTime[qid]=takeDate` + `sysBlueMsg("Hoàn thành nhiệm vụ vòng: [name]")` (`QUESTPANEL_S[18]`), else "Số vòng hoàn thành {ft} [name] {ft}/{num}" (`QUESTPANEL_S[15..16]`).
  - Go-only extras: `onTakeLoop`, `onGetLoopQuestStartTime` (`{"51": todayMidnightMs}`) - not found in client (stub). Ordering (Go): `onFinishLoopQuest` before the next round's add-quest push.
- Server design: store per-character loop states; `takeLoop(lid, npcId)`: gates level range, guild membership for lid 2, no active state, cooldown elapsed from `takeDate` by `refresh`; creates state `{id=qid=lid, takeDate=now, ft=0, finished=0}` and grants a random type-7 child of pool `lid` (lid 1 uses pool 10 in Go). Completing a type-7 round: no `quest_history`, always delete progress, `ft++`, push `onFinishLoopQuest`; at `ft==num` deactivate (cooldown anchor kept). `cancelLoop` anchors cooldown at `takeDate`. Rounds that need kill-bosses without map spawns exist (Go memory) - filter or provide bosses.
```ts
export interface LoopStateDTO { id: number; qid: number; takeDate: number; ft: number; finished: number; }
export interface NpcLoopInfo { flag: boolean; d: Record<string, { canTake: boolean }> | null; }
export interface CancelLoopQuestPush { flag: boolean; id: number; qn?: string; }
export interface FinishLoopQuestPush { id: number; ft: number; }
```
H5 owner: `server/src/modules/quest/loop.service.ts` + `loop.rpc.ts` (`takeLoop`, `cancelLoop`, `loopRepaire`); client quest manager tab + NPC dialog `[Vòng]` list.

### D2. Marriage (partial)
`MarriageManagerPanel` (`PANEL_MARRIAGE`), `MarriageSeekingPanel`, `MarriageFeedHBox`, `WeddingBookPanel`; Go memory `docs/memory/marriage-system.md`. RPCs (all fire-and-forget): `initMarriage(firstFlag:Boolean)` (`MarriageManagerPanel.as:1331`), `marriageSeeking(content, flag)` (`MarriageSeekingPanel.as:309`), `marriageRequest(targetCid, targetName, content)` (`:313`), `marriageReqFeedback(requestId, 1 accept|2 refuse)` (`MarriageFeedHBox.as:214`), `cancelMarriageSekInfo()` (`:757-760`), `call("getCoupleRank", Responder, page)` (`ActivePanel.as:2199,2604`), `bookWeddingHall({line,hour,minute,flag})` (`WeddingBookPanel.as:318`), `cancelWeddingHall()` (`:768`). Pushes (panel methods): `onInitCharMarriageList([{type SEEKING|REQUEST, cid, targetId, content, id, name}])` (`:790-830`), `onInitMarriageSekList([{cid,name,content,classId,gender,exp,online,flag}])` (`:1150-1185`), `onInitBookList` (`WeddingBookPanel.as:717`, `{cid,pid,cname,pname,date,line...}`). No divorce RPC in client. Rating partial (needs social/friend tables, rings, weddings).

### D3. Farm ("Nông trường pháp thuật", `Fazenda*`)
`FazendaPanel` (`PANEL_FAZENDA`), `FazendaBag`, `FazendaShop`, `FazendaLogPanel`, `comp/FazendaFarm.as`; RPCs: `getFarmByCid(cid)` (`Core.as:2167 getFazendaDataByCid`, throttled by `farmReqArr`), `getFriendFarm()`, `harvestMine(idx)`, `addMineral(idx, mid)`, `addFarmNum(idx)`, `delMinearl(idx)`, `steelMine(cid, idx)`, `getFarmBag`, `getFarmBagAll`, `getFromFarmBag(bid, -1)`, `getFarmLog`; ripe warning `WARN_TYPE_FARM_RIPE 100`. Table `TBL_FARM` (`docs/database/details/TBL_FARM.md`). Queries in the task (`queryPlant`) not found as call sites. Partial/large; defer.

### D4. Fashion / dress / runes (`DressPanel`, `DressDisplay`, `RuneBag*`)
`activeDress(dressId, autoBuy)` (`DressPanel.as:2191`, Responder `DressLogic.updateDressInfo`); `setFakeDress/unsetFakeDress(dressId, resCode)` and `setFakeFlyerDress/unsetFakeFlyerDress(dressId, resCode, wavCode)` (`DressDisplay.as:577-597`); `setDressHide(bool)` (`CharactorPanel.as:3914`); recipe extraction: `freeExtractRecipe`, `tenExtractRecipe`, `goldExtractRecipe`, `ssdExtractRecipe`, `largessdExtractRecipe`, `transformRecipe(recipeArr)`, `transformAllRecipe(recipeArr)`, `exchangeRecipe(recipeId)` (`DressPanel.as:1246-2159`, `RecipeItem.as:251`); runes: `getRuneBagData(cid)`, `arrangeRuneBag(cid, type)` (`RuneBag.as:732,786`), `exchangeRune()` (`RuneChipBag.as:788`). Tables seeds: `data_tbl_dress`, `data_tbl_mount_dress`, `data_tbl_deco_rune`, `data_tbl_rune_chip`. Partial.

### D5. Life skills, mounts, pet arena/PVE
- Life skills: `newCook(items, currentSkillId, SKILL_TYPE_COOK)` / `newMedicine(items, skillId, 18)` (`LifeSkillPanel.as:1170,1128`, Responders `onNewCook`/`onNewMedicine`); gathering cancel `remote.quitGatheringClinet()` (`GatherProgressCanvas.as:286`); `queryGather/queryHerb/queryFishPool` have **no call sites** in the decompile.
- Mounts: `beginMounting(mountId)` (`object/Creature.as:432`), `stopMounting()` (`:240`), `beginFlying()` (`:343`), `stopFlying()` (`CreatureView.as:8374,10202`); `MountPanel`: `getMountList`, `addMountExp(arg)`, `addMountUpExp`, `renewMount(id)` (`MountPanel.as:3923,3053,3001,3414`), `checkHaveMount` (`CharactorPanel.as:9031`). `mountInfo` has no call site. Partial.
- Pet PVE "Không gian điêu khắc" (icon 75, lv80, `PetPVESystem`, `PANEL_PET_PVE`): `initPPVEPanel`, `challengeNextFloor`, `exchangeKP`, `exchangeKPByGold`, `increaseChallengeTimeByGold`, `getPPVERank` (+`unlockMoney`). Go memory `docs/memory/pet_ppve.md` (max 150 floors, KP -> Khắc Văn, state keys `ppvefloor, todayFloor, kp, freeTime, goldTime, goldClgTime, awardTime, mlv, p, ppveConfig`, login blobs `petPVEData {p, mlv, ppveConfig}`). Needs combat with per-pet AI; partial/no.
- Pet arena activity (icon 77, lv35): `getPetArenaActivityInfo`, `getPetArenaDataActivity(true)`; partial.

---------------------------------------------------------------------------------------------------------------------------------

## Proposed M8 cut (recommendation)
1. Strip + `startedActList`/`updateActivityState` + toasts for unported panels (A1) - cheap, unblocks HUD.
2. Daily sign-in (both panels) + diary/DailyActPanel (static calendar XML ported to a TS table) + online-time award + AwardWarn + AwardPanel (A2-A4).
3. VIP: `initPmData`/`buyPm`/`doPmOperation`/`flushProcesFlag`, VIP shop, pmLevel badge (B).
4. Loop quests (D1) with `takeLoop`/`cancelLoop`/`loopRepaire` (+ `npcFuncInit.loopInfo`, `onCancelLoopQuest`, `onFinishLoopQuest`).
5. Daily boss (C) if combat vs npc bosses is cheap; everything else deferred.

## Open questions (static analysis cannot settle)
1. All push names routed through `CallBack.as` (stub). Needed from the Go server before coding: `startedActList` login key, `updateActivityList`, `updateActivityState`, `onOpenBossDailyPanel`, quiz pushes (`showQuestion`, `onQuestionRank`, `onQuestionFinish`), `onTakeLoop`/`onGetLoopQuestStartTime`, award-warn push name, `initNewPlayerGuide` caller, login key for `offlineTime`.
2. Which gameplay events bump which TBL_DIARY rows (server logic); how `getDailyOnlineAct` return `0` is handled (only `-1` and `>0` branches exist, `Core.as:741-752`).
3. Reward contents for sign-in cards/crit pool/online award/feast/system gifts (server data; `data_daily_signin_*` seeds cover sign-in only).
4. `TBL_QUEST_LOOP.isRebirth` is read by the client but absent from the seed; `PmPanel` `activeType`/`keepDay`/`activeTime` exact semantics (expiry = `activeTime + keepDay days`; is `activeTime` start of the active period?) are inferred from the arithmetic at `PmPanel.as:1889` only.
5. ActivityCanvas on-screen anchor inside `MainLayer` (no constraint found in the decompiled MXML; width 450 only) - place it left of/below the minimap per `docs/memory/main-hud.md`; confirm with a screenshot.
6. `Language.as` arrays are reassigned in several later blocks (e.g. `DAILY_SIGNIN[3/5]`, `PM_PANEL[28]`, `BOSS_DAILY_PANEL[19]`); the last assignment wins (version differs by block) - use the final value when porting strings.
7. `LoopStateDTO.takeDate`/`finished` meaning is taken from Go memory (`finished:0` always); client only tests `finished<=0` (`Player.as:2106`).
