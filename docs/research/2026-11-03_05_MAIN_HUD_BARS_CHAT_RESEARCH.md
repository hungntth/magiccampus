# Main HUD: skill bar, system/menu bar, chat (legacy Flash client research)

Legacy root: `E:\mcgame\docs\client` (paths below relative to it). All numbers come from the MXML-compiled
descriptors (`UIComponentDescriptor`) in the decompiled `.as`. Anything marked **inferred** was not read directly.

## 1. Summary

The in-game HUD is `MainLayer` (anchors components to a 900x570 stage). Bottom row = `SystemBarCanvas`
(full width, 50 high, bottom 0): it embeds the **chat** (`ChatCanvas`), the chat **input row** and the **menu
button row** (`sysBtnBar`). `UserBarCanvas` (460x52, right 0 / bottom 44) is only the **skill/item shortcut bar**
(3 pages x 10 slots, page switcher, show/hide button) plus an embedded `AutoBattleCanva` (Auto toggle + lock).
Menu buttons are icon skins with tooltips only (no text labels); shortcut keys appear only in tooltips.

## 2. Key files

- `view/view/MainLayer.as` - anchors for every HUD component (UIPropVO list, lines ~140-1360).
- `view/view/compMain/SystemBarCanvas.as` (1976 lines) - chat bar + input + menu buttons + emoji popup.
- `view/view/compMain/ChatCanvas.as` (2053) - output text areas, channel tabs, scroll/size buttons, `onSay`/`onWisper`.
- `view/view/compMain/UserBarCanvas.as` (3263) - 30 skill/item slots, page switcher, show/hide.
- `view/view/compMain/AutoBattleCanva.as` - "Auto" button + lock button, embedded in UserBarCanvas as `abc`.
- `view/view/comp/EmotionCanvas.as` - emoji popup 190x130, 23 buttons.
- `utils/TextUtil.as` (`encodeChatMsg` 199, `decodeChatMsg` 256) - chat line format.
- `predef/GamePredef.as` - `APP_WIDTH/HEIGHT` 132-133, `MSG_CHANNEL` 45, `MSG_CHANNEL_*` 744-750, colors 754/760, `CHAT_INTERVAL` 1232.
- `object/Creature.as` - `say` (404) / `wisper` (360) RPC calls. `config/RPCConfig.as:28` `RPC_DELAY["say"]=1100`.
- `system/CallBack.as` - decompile aborted ("trait count exceeds set limit", line 12); `system/CallBackGlobal.as` has only empty `on*` stubs.
  The real chat handlers are the public methods on `ChatCanvas` (**inferred** that the dispatcher routes `onSay`... to MAIN_CHAT;
  consistent with `docs/memory/h5-client.md:297`).
- Skin classes (`BtnBar*`, `CanvasSkillBar`, `BtnChat*`, ...) are CSS style names; **no .as defines them** (swf/css lib not in decompile).

## 3. Layout

### 3.1 Stage / MainLayer
- `GamePredef.APP_WIDTH = 900`, `APP_HEIGHT = 570` (also `*_OLD` same). No resize/scaleMode code found anywhere
  (`grep RESIZE|scaleMode` empty); components are anchored with Flex constraints (left/right/top/bottom).
- MainLayer anchors (name = Chinese comment in source, vid = ViewManager const): 系统栏 SystemBar right0 left0 bottom0;
  用户栏 UserBar right0 bottom44; 角色头像 Portrait left2 top5; 宠物头像 Pet left2 top67; 增益栏 LongBuff left2 top115;
  队伍栏 Group left2 top147; 系统信息 SysInfoPanel left2 top280; 迷你地图 MiniMap right0 top0; 日常活动 Activity right190 top0;
  世界BOSS排行榜 WbRank right0 top140; 角色行动 PlayerCmd right50 top100; 宠物行动 PetCmd right50 top218;
  自动战斗 AutoBattleCanva(MAIN_AUTOBATTLE_SET) right50 bottom100; 提示区 Warn right10 bottom95; 奖励提示区 AwardWarn right80 bottom170;
  行动力显示 right60 bottom140; 防沉迷 right70 bottom90; 个人混战积分 right50 bottom150; 自动参战 right400 top100;
  采集进度 left250 top100; 得到物品效果层 right295 bottom10. Stacking order = order of the array in `MainLayer._MainLayer_Array1_i`
  (not read in detail; **inferred** same as the bindings order: SystemBar first/lowest, UserBar second).
- Keyboard: no global key handler exists in the decompiled client (only `DragableCanvas.kdHandler` ESC=hide at
  `view/view/comp/DragableCanvas.as:145-152`, chat input keys, login). Shortcuts are known only from tooltips:
  A=PK/attack target (`SYSTEMBARCANVAS_S[5]`, `[21]`), C=char (`[6]`), B=bag (`[7]`), W=pet (`[8]`), T=group (`[9]`),
  S=skill (`[10]`), K=Kết Giao/IM (`[11]`), Q=quest (`[12]`), E=guild (`[13]`), R=achievement (`[22]`); MiniMap: N shop,
  M world map, ~ local map, P settings, H help, Z events, CapsLock minimap toggle, F fly (`MINIMAPCANVAS_S[24-30]`, `_U[17]`).
  Digits 1..0 trigger `UserBarCanvas.useSlotByNum(n)` (UserBarCanvas.as:1489) but the **caller is not in the decompile** (**open**).
  Ctrl+Up/Down in chat input = input history (SystemBarCanvas.as:799-826).

### 3.2 SystemBarCanvas (SimpleCanvas, height 50, anchored by MainLayer left0/right0/bottom0)
All coords relative to the bar. `SystemBarCanvas.as` lines are descriptor lines.
| Element (id) | Size | Position | Skin / notes |
|---|---|---|---|
| mainChat (ChatCanvas) :121 | w439, h=240 default (ctor sets 440x240) | left1, bottom38 | grows upward; see 3.4 |
| chat bar background :133 | 440x38 | left0 bottom0 | styleName `ChatBar` |
| btnChannel (BasicShadowButton) :183 | w45 | x8 y8 | `BtnChatDQ`/`BtnChatSJ`/`BtnChatGH`/`BtnChatDW`/`BtnChatYY`/`BtnChatHeadline`; label "Hiện tại↑" |
| textInput (LinkTextInput) :161 | 296x21 | x55, bottom9 | `maxChars=50`; Enter sends; rollOver gives focus |
| Gửi (BasicGlowButton, styleName `ChatButton`) :199 | 45x22 | x359 y8 | click `send()` |
| emoji (Button `BtnChatUserEm`) :147 | 24x23 | x408 y8 | toggles `em` (EmotionCanvas) |
| em (EmotionCanvas) :509 | 190x130 | x244 y-105, hidden | 23 buttons, tooltip = `"/no "`, `"/yes "`, `"/pig "`, `"/heart "`, `"/icy "`, `"/shit "`, `"/laugh "`, `"/depress "`, `"/daze "`, `"/face "`, `"/shy "`, `"/distress "`, `"/devil "`, `"/excite "`, `"/anger "`, `"/tear "`, `"/sigh "`, `"/smile "`, `"/shock "`, `"/cry "`, `"/mess "`, `"/bnhh "`, `"/xfmm "`; click -> `GameEvent.PLAYER_SEND_EMOTION` -> `sendEm` -> `player.say(text, 0)` (SystemBarCanvas.as:727) |
| channelList (List, `ListChannel`) :216 | 51x105, hidden | left0 bottom20 | dataProvider = `GamePredef.MSG_CHANNEL` (binding :1241,1401); itemClick -> `channelClickHandler` (:1333) -> `setChannel` |
| sysBtnBar :236 | 462x56 | right0, bottom-8 | the menu button row |
| hidebtn (`BtnHideButtons`/`BtnShowButtons`) :493 | 12x36 | right5 bottom6 | `openandhide()` toggles sysBtnBar visibility, sets `_core.hidesysbar` (:566) |

Menu buttons (parent sysBtnBar; all 40x45 unless noted; y=0 unless noted). Order left to right:
| id | x | skin (styleName) | tooltip (Language key) | click action |
|---|---|---|---|---|
| btnDaily | -46 | `BtnBarRichang` | `SYSTEMBARCANVAS_S[23]` "Hoạt động hằng ngày" (second assignment, Language.as:9409, overrides line 2205) | `_vm.show(ViewManager.DAILY_ACTIVITY=20001)` (:1838) |
| btnAch | -1 | `BtnBarAch` | `[22]` "Giao diện thành tựu (Phím tắt R)" | `changeVisible(PANEL_ACHIEVE=798)` (:1599) |
| btnPK | 45 | `BtnBarPK` | `[5]` "Chọn đối tượng giao đấu (Phím tắt A)" (`[21]` "Chọn đối tượng tấn công (Phím tắt A)" variant) | `selectTarget(ACTION_PK=40)`: ignored in battle; non-leader in group -> `NPCVIEW_S[0]`; else `view.showSelect()`, `view.actionState=40` (:1792) |
| btnChar | 87 | `BtnBarPlayer` | `[6]` "Thông tin nhân vật (Phím tắt C)" | `changeVisible(PANEL_CHARACTOR=230)` |
| btnBag | 132 | `BtnBarBag` | `[7]` "Giao diện túi đồ (Phím tắt B)" | `changeVisible(PANEL_BAG=240)` |
| btnPet | 176 (y1) | `BtnBarPet` | `[8]` "Giao diện pet (Phím tắt W)" | `changeVisible(PANEL_PETMANAGER=265)` |
| Can4 (blinking team icon) | 220 y0, 46x51.5 | `BtnBarTeamBig`, hidden | `[9]` "Lập nhóm (Phím tắt T)" | opens PANEL_GROUP(560) + `setTab(1)` |
| btnGroup | 223, 40x44.8 | `BtnBarTeam` | `[9]` | `changeVisible(PANEL_GROUP=560)` |
| btnSkill | 269 | `BtnBarSkill` | `[10]` "Giao diện kỹ năng (Phím tắt S)" | `changeVisible(PANEL_SKILLMANAGER=445)` |
| btnIM | 313 | `BtnBarIm` | `[11]` "Giao diện Kết Giao(Phím tắt K)" | `changeVisible(PANEL_IM=540)` |
| Can8 (blinking quest icon) | 380 y23, 51x59.6 | `BtnBarQuestBig`, hidden | `[12]` | `changeVisible(PANEL_QUESTMANAGER=295)` |
| btnQuest | 375 y23, 51x59.6 | `BtnBarQuest` | `[12]` "Giao diện nhiệm vụ (Phím tắt Q)" | `changeVisible(PANEL_QUESTMANAGER=295)` |
| btnGuild | 400 | `BtnBarGuild` | `[13]` "Giao diện bang hội (Phím tắt E)" | `changeVisible(PANEL_GUILD=340)` |
Row tooltip for whole bar: `SYSTEMBARCANVAS_S[4]` "Biểu tượng hệ thống". Blink: `brink(n)` / `stopBrink`, `setStyleNormal`, `setTeamButtonNormal` swap Can* <-> btn*.
Note: the requested short labels (T.tựu, N.vật, Túi, Chiêu, G.lưu, N.vụ, Bang...) are **not strings in the client**; they correspond to icon skins (Ach, Player, Bag, Skill, Im, Quest, Guild). Only `AUTOBATTLECANVA_S[0]` "T.lập" exists.

### 3.3 UserBarCanvas (SimpleCanvas 460x52; MainLayer right0 bottom44; `cacheAsBitmap`)
| Element | Size | Position | Notes |
|---|---|---|---|
| btnContainer (Canvas `CanvasSkillBar`) :146 | 373x44 | x23 y5 | holds bar1/2/3 + numbers; visibility persisted as setting `au` (`changeBarVisible` :2026, init :3030) |
| bar1/bar2/bar3 (HBox, gap 1) | bar1 350x37 | x5 y5 each | slots s1..s10 / s11..s20 / s21..s30 (ItemSlot, `borderStyle none`), only one visible; `_quickSkillSize = 30` |
| slot-number labels (HBox gap 25) :585 | each 10x15 | x6 y23, mouse-transparent | "1".."9","0" (RoundedLabel color 1961723=0x1DEFFB) |
| numCanvas :752 | 22x48 | right -2.1, y1 | barUp (`UserBarSwitchUp`) x2 y3; barNum (RoundedLabel "1") x1 y14; barDown (`UserBarSwitchDown`) x2 y29 |
| abc (AutoBattleCanva) :809 | 86x52 | right0 y1 | see below |
| btn (`BtnSkillBar`) :824 | skin-sized | x396 y7 | toggle show/hide; tooltip `USERBARCANVAS_S[0]` "Mở/Ẩn thanh kỹ năng \rKhi chiến đấu nhấp đơn để dùng\r Khi không chiến đấu nhấp đôi để dùng" |
- Page: Up cycles 1->3->2->1; Down cycles 1->2->3->1 (UserBarCanvas.as:2199-2260). Page number shown in `barNum`.
- Empty slot tooltip `USERBARCANVAS_S[2]` "Khi chiến đấu nhấn chuột để sử dụng nhanh\r Trên bản đồ nhấn đôi chuột để sử dụng nhanh".
- Slot persistence: `GLOBAL_SETTING.st{n}` (type: TBL_SKILL or TBL_ITEM_TEMPLATE) and `sid{n}` (id) for n=1..30 (initView :3023-3070);
  skills remapped by awakening `exSid{level}`. Drop = `setSlot` (:2624). Item counts via `setNum` (2s after init): 0.5 alpha if num<=0.
- Click rules (`clickHandler` :2066): battle state (`ST_CORE_BATTLE=2`) -> single click uses slot; normal state (`ST_CORE_NORMAL=1`) and
  `player.isLockedUB` -> uses slot (Ctrl passes `_arg_2`); lock off = slots are movable instead. Items -> `_core.useItem(giid, slot, ctrl)`;
  skills only usable in battle with `BattleCreatureView.cmdMode`.
- `useSlotByNum(n)` (:1489): in battle with cmd panels visible uses slot `n + (page*10) - 10` (or `s{n}` if `GLOBAL_SETTING.battleStExpan`);
  in normal state only items are used.
- Battle state overrides (State "battle", :2000, "normal" :1376): y offsets 43 / 4 / 5 / 81 / 93 / -38 and heights 44/120 - exact target-to-property
  mapping not resolved (**open**, low priority).

AutoBattleCanva (86.1x52): `changBtn` (BasicMultiLineButton `BtnBattleFlag`) x43 y6 40x40, label "Auto\nbật" (`AUTOBATTLECANVA_U[0]`; `[1]` = "Auto\ntắt"),
tooltip `[3]` "Nút tự động chiến đấu"; `xx` image x48.5 y11.5 29x29 (off-indicator, hidden while auto runs); `btnLock` (`btnLock`) x22 y26 20x20,
tooltip `[2]` "Nút khóa phím tắt". Click changBtn -> start/stop `AutoBattleCanvas` (PANEL_BATTLEAUTO). Click lock -> toggles `player.isLockedUB`,
`updateSetting("ubl")` + RPC `us` with `{ubl: bool}` (AutoBattleCanva.as:220-226); lock on => slots not draggable (`setMovable`).
There is no "Đất" toggle in these files (**not found**).

### 3.4 ChatCanvas (SimpleCanvas, 440x240 ctor; x3 y128 default, overridden by SystemBar anchor)
- Height range: `HEIGHT_MIN=140`, `HEIGHT_MAX=500`, `HEIGHT_STEP=20` (ChatCanvas.as:64-66). `button2` (Up) mouseDown = expand, `button3` (Down) = reduce.
- `canvasOutputBack` fills (all 0), skin `CanvasChatOutput`. `headline` (LinkTextArea, transparent, bold) top0 left/right0 height50, no vscroll.
  `allTextOutput` (LinkTextArea, bg black alpha 0.3) top50 bottom20 left/right 0.
- Channel tabs (BasicShadowButton, `BtnChatChannel`, h21, bottom0): left = 0,35,70,105,140,175,210,245,280 and btnRumour at left175 (hidden by default).
  Label (key -> text): btnAll `CHATCANVAS_S[11]` "Toàn Bộ" (tooltip `[20]` "Nhấp vào Chọn để chọn lựa kênh hiển thị của bạn"; clicking it while selected opens the channel-filter popup),
  btnWorld `[12]` "Thế Giới", btnScene `[13]` "Hiện tại", btnGuild `[14]` "Bang Hội", btnTeam `[15]` "Nhóm", btnWisper `[16]` "Mật Ngữ",
  btnPersonal `[17]` "Chỉ Thị", btnSystem `[18]` "Hệ thống", btnEvent `[19]` "Sự việc", btnRumour `[21]` "Tán gẫu". (label-to-button mapping inferred from binding order.)
  Selected tab color `#cc7171`, others `#39c0ff` (switchChannel :1482).
- Right-side buttons (18x18, bottom0): button1 right66 `BtnChatClear` tooltip `[5]` "Xóa ghi chép chat" (mouseDown -> `clearChannel`);
  button2 right44 `BtnChatUp` `[6]` "Mở rộng khung chat"; button3 right22 `BtnChatDown` `[7]` "Thu nhỏ khung chat"; button4 right0 `BtnChatLock`
  `[10]` "Nút khóa khung chat" (toggles `_scrollFlag`, autoscroll to bottom when within 80px). `[8]` "Hủy cuộn" / `[9]` "Khôi phục cuộn" defined; use not confirmed.
- Filter popup `channelListSettingCanvas` (StandardContent, 120x130, left0 bottom20, hidden; title `AUTOBATTLECANVA_S[0]` "T.lập" **inferred**):
  checkboxes c1 (10,32) c5 (62,32) c2 (10,49) c3 (62,49) c6 (10,66) c4 (62,66) c7 (10,83) c8 (62,83) c9 (10,100, hidden).
  Handlers: c2 Scene, c3 Guild, c5 Wisper, c7 System, c8 Event (confirmed); c1 World, c4 Team, c6 Personal, c9 Rumour (**inferred** from binding exprs, getInterfaceData order).
  Unchecked => that channel's lines are not copied into the "All" buffer.
- Buffers (`ArrayQueue(n)` = max lines kept): All/World/Scene/Guild/Team/Wisper/System/Event/Rumour = 20, Personal = 40 (ChatCanvas.as:555-564).
- Auto tips: `systemTip` timer 5 min (level<=30) or 30 min (>30) -> `showHelpMsg(SYSTEM_TIP[1|2|3])`.

## 4. Chat behaviour

### 4.1 Channel selector (btnChannel, List `MSG_CHANNEL`, GamePredef.as:45)
| index | list label (Language) | skin | btnChannel label (`SYSTEMBARCANVAS_U`) |
|---|---|---|---|
| 0 | `GAMEPREDEF_S[4]` "Hiện tại" | BtnChatDQ | `[0]` "Hiện tại↑" |
| 1 | `[5]` "Thế giới" | BtnChatSJ | `[1]` "Thế giới↑" |
| 2 | `[6]` "Bang hội" | BtnChatGH | `[2]` "Bang hội↑" |
| 3 | `[7]` "Nhóm" | BtnChatDW | `[3]` "Nhóm↑" |
| 6 (HEADLINE) | `SYSTEMBARCANVAS_U[6]` "Đầu bảng" | BtnChatHeadline | `[5]` "Đầu bảng↑" |
| 9 (rumour/"Tán gẫu") | not in MSG_CHANNEL, set via `checkRumour` | BtnChatYY | `[7]` "Tán gẫu↑" |
Other constants: `MSG_CHANNEL_LOCAL 0, GLOBAL 1, GUILD 2, GROUP 3, BATTLE 4, AREA 5, HEADLINE 6`.
Default channel 0. Send button label: `SYSTEMBARCANVAS_U[4]` "Gửi".

### 4.2 Send flow
1. Enter or "Gửi" -> `send()` (SystemBarCanvas.as:1637): empty -> clear; headline and len>=50, or any len>=100 -> `sysMidNote(SYSTEMBARCANVAS_S[0])` "Chữ điền vào quá dài.".
   Headline additionally needs item `ITEM_HEADLINE_SPEAKER` (else `CALLBACK_S[188]`) and a YES/NO Alert `SYSTEMBARCANVAS_S[18]`.
2. `sendMsg()` (:1007): world channel (`BtnChatSJ`) free-use window 5 min (`WORLD_DELAY=300000`) else needs Loa (`hasSpeakerNum()>=1`, item 719); otherwise note `S[2]` with `{delay}` and reset to channel 0.
   Rumour (`BtnChatYY`) same with `RUMOUR_DELAY=300000`. World free needs level >= `WORLD_SAY_LEVAL_FREE=10` (GamePredef.as:1551) else `S[17]`.
3. `core.replaceBadWord(htmlText)`; `TextUtil.encodeChatMsg(channelIndex, text)` strips font tags, lowercases `@PET/@IT/@EQ/@HB`, detects `/w <name> <text>` regex `(\/w )(.*?) (.*)$`.
4. Whisper: `player.wisper(text, targetName)`; normal: `player.say(text, channelIndex)`. Input history keeps last 10 distinct entries (Ctrl+Up/Down).
5. Client throttle: `Player.checkChatTime()` interval `GamePredef.CHAT_INTERVAL = 1.2` s (Player.as:2302), else `sysMidNote(CHAT_TOOFAST)`. Also `RPC_DELAY["say"]=1100` ms.
6. RPC (via dynamic proxy `_core.remote`, `RemoteObj.callProperty` => method name = property name):
   - `say(id:Number /*player id*/, type:int /*sourceIdType, TBL_CHARACTOR*/, channelId:int, msg:String)` (Creature.as:404-413)
   - `wisper(id, type, targetName:String, msg:String)` (Creature.as:360-369)
   Argument order read from `_core.remote.say(id, type, _arg_2, _arg_1)` / `_core.remote.wisper(id, type, _arg_2, _arg_1)`; the proxy's exact wire layout not inspected (**inferred** positional).

### 4.3 Receive (pushes; handler body in ChatCanvas)
- `onSay(o)` (ChatCanvas.as:1718): reads `o.channelId, o.msg, o.name | o.cname, o.type (sourceIdType), o.id, o.pmLevel`. Drops if `isBlack(cname||name)`.
  Channel 0 also pops a speech bubble via `getGameObject(type,id).view.onSay(msg)` unless setting `hc`. `name=="系统"` gets special system format.
  Buckets: 0 Scene, 1 World, 2 Guild, 3 Team, 9 Rumour (+All if filter allows; calls `updateChannel`); channel 6 -> `headline.htmlText` (only if `MSG_CHANNEL[4].selected`; cleared after 30 min = 1800000 ms); 4/5 not displayed here.
- `onWisper(o)` (:790): `o.sourceName, o.sourceId, o.targetId, o.targetName, o.text`; forced `channelId=-1`, type "/w"; bucket Wisper; if sender is self and `targetId != -1` adds contact to IM panel.
- `onP2pWisper(msg, senderId, senderName, bool=true)` (:1405): feeds the private chat window / warn icon, not the chat box.
- Display-only helpers (called by other code): `showSystemMsg(text)` -> System tab, color `MSG_CHANNEL_COLOR[6]`, prefix `CHATCANVAS_S[0]` "[Hệ thống] ";
  `showBlueMsg` -> Personal tab, color `[7]`, prefix `[1]` "[Thông báo] "; `showRedMsg` (len>1) -> Event tab, color `[8]`, prefix `[2]` "[Sự kiện] ";
  `showHelpMsg` -> System tab, color `[9]`, prefix `[3]` "[Trợ giúp] " (link `event:help`); `showGMChatMsg`, `onClearSay` (clears headline).
  Server push names `onSystemSay/onBlueMsg/onRedMsg/onSystemMidMsg` exist as stubs in `CallBackGlobal.as:165-233` (mapping to these helpers **inferred** via `docs/memory/chat-link-formatter.md`).

### 4.4 Line format (TextUtil.decodeChatMsg :256)
- Normal: `<font color=COLOR>` + `<a href='event:L_C|chId'>[ChannelLabel]</a>` + PM flag (`PM_CHAT_FLAG[pmLevel]`, from `Language.PM_PANEL[21..29]`) +
  `<font color=#FF9900><a href='event:L_PID|id|name'>[Name]</a></font>:` + text + `</font>`. => visible text `[Kênh][VIP]  [Name]:text`; channel label comes from `MSG_CHANNEL[].label`
  ("Hiện tại", "Thế giới", "Bang hội", "Nhóm"; headline "Đầu bảng"). Each line terminated with `<br/>`.
- Area channel 5: text only, `<font>` tags stripped. Headline: wrapped `<div>` with color `MSG_CHANNEL_COLOR[10]`.
- Whisper sent: `TEXTUTIL_S[15]` "'>[Thầm] Bạn nói với " + `[target]` + `TEXTUTIL_S[16]` "]</a></font>: " + text (color `MSG_CHANNEL_COLOR[5]`).
  Whisper received: `TEXTUTIL_S[17]` "'>[Thầm] " + `[source]` + ":" + text.
- Colors `MSG_CHANNEL_COLOR` (index = channelId; GamePredef.as:754): 0 `#EEEEEE` (Hiện tại), 1 `#EEBB22` (Thế giới), 2 `#22BB22` (Bang hội), 3 `#2288EE` (Nhóm),
  4 `#EEEEEE`, 5 `#9933EE` (whisper), 6 `#EEEE00` (system), 7 `#00EEEE` (blue/personal), 8 `#EE1100` (event/red), 9 `#EEBB22` (rumour / help), 10 `#EF343E` (headline).
  `MSG_EVENTTEXT_COLOR` (:760): `#FFCC00 #FF9900 #FF66CC #FF0000 #3399CC #33FF66 #33CCAA #00FF00` (name color = [1] `#FF9900`).
- Link events: `L_C|chId` (click channel label), `L_PID|id|name` (click name -> whisper `/w name ` via `wisperChat` :1216), `event:help`. Item/pet links `@it @pet @eq @hb` tokens.

## 5. Proposed H5 mapping
- Client DOM (`client/src/ui/hud/`): `SystemBar` (anchored left0/right0/bottom0, 900-wide stage coordinates above), `UserBar` (right0 bottom44),
  `ChatBox`; keep layout numbers as CSS vars; stage 900x570 is the design resolution.
- Shared types (`packages/shared/src/protocol.ts`):
```ts
export type ChatChannelId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9;
export type SayArgs = [id: number, type: number, channelId: ChatChannelId, msg: string];       // RPC 'say'
export type WisperArgs = [id: number, type: number, targetName: string, msg: string];           // RPC 'wisper'
export interface OnSayPush { id: number; name: string; cname?: string; type: number; channelId: ChatChannelId; pmLevel?: number; msg: string }
export interface OnWisperPush { sourceId: number; sourceName: string; targetId: number; targetName: string; text: string; pmLevel?: number }
export type UserBarSetting = Record<`st${number}` | `sid${number}`, number> & { au: 0 | 1; ubl: boolean };
```
- Server: `server/src/modules/chat/` (`say`, `wisper`, pushes `onSay`, `onWisper`, `onSystemSay`, `onBlueMsg`, `onRedMsg`, `onSystemMidMsg`); settings `us` in the settings module.

## 6. Open questions
1. Digit keys 1..0, A/C/B/W/T/S/K/Q/E/R and ESC: dispatcher not in the decompile (only tooltips). Implement from tooltips.
2. Exact layering/z-order of MainLayer children and any stage resize behavior (no code found; Flex anchors only).
3. Skin art (`BtnBar*`, `ChatBar`, `CanvasSkillBar`, `BtnChat*`, `UserBarSwitch*`, `BtnSkillBar`, `BtnBattleFlag`, `ListChannel`) lives in a style swf/css not in `.as`; needs swf-tools lookup.
4. `CallBack.as` could not be decompiled; push-name -> ChatCanvas-method routing and wire shape of `say`/`wisper` are inferred.
5. "Đất" toggle and the abbreviated labels (T.tựu, N.vật, Túi, ...) are absent from the code; likely image skin text.
6. Battle-state override values of UserBarCanvas (y 43/4/5/81/93/-38, heights 44/120) not mapped to targets.
7. `GAMEPREDEF_S[222]` (`CHAT_TOOFAST`) reads "Đừng xóa!" in Language.as:2522 (looks like a placeholder; check intended text).
