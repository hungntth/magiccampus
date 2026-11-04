# M3 Multiplayer - legacy Flash client research (player menu, chat channels, party, social, trade, lines)

All `.as` paths are relative to `D:\mcgame\docs\client` (read-only). `file:line` = verified by read/grep in this session;
**inferred** = not provable from the decompile. Scope: what the client sends, what it consumes, and what it gates itself.

## 0. Decompile limits that matter here

- `system/CallBack.as` is an empty stub, so no push dispatcher is visible. BUT `logic/Group.as` (all group push bodies),
  `view/view/compMain/ChatCanvas.as` (`onSay`, `onWisper`, `onP2pWisper`, `onCreateChatPanel`), `IMPanel.as`
  (`onInitViewImC`, `onAddRelationship`, `onDelRelationship`, `onAddRelationByName`, `onInitGroupList`, `onSetClose`) and
  `TradePanel.as` (`onRequestTrade`, `onNewTrade`, `onTargetLock`, ...) are decompiled, so most payloads are explicit.
  The mapping "push name -> handler" is inferred from the method names (they are 1:1 with the Go push names, see
  `D:\mcgame\docs\memory\group-party.md`).
- `ChatPanelUtil` (`com.qeedoo.ui.utils`, used for private chat windows: `createChatPanel`, `getChatPanel`, `createCP`,
  `chatData`, `panelStatusObj`, `panelManagerObj`, `charactorName`) is NOT in the decompiled tree (no `ChatPanelUtil.as`).
  Its RPC behaviour is inferred (section 3.5).
- Client-visible names that the task brief lists but that DO NOT exist in the client (grep over all `.as`):
  `getFriendList`, `getBlackList`, `refuseToAddFriend`, `tradeAddItem`, `tradeRemoveItem`, `tradeSetMoney`. The real trade
  protocol is 4 RPCs (section 6); friends/black are one panel fed by one push (section 5).

## 1. Player interaction menu (click another player)

Flow: `CharactorView.mouseDownHandler` (`view/view/compGameStage/CharactorView.as:542-555`): if `!_gameObject.isSelf` ->
`_core.targetPlayer = Charactor(_gameObject)`; `MAIN_TARGET.update()`; then `super.mouseDownHandler`. Ctrl+click -> 
`MAIN_SYS.wisperChat(name)` (prefills the chat input with `"/w <name> "`, `SystemBarCanvas.as:1216-1221`).
`TargetCanvas.update()` (`view/view/compMain/TargetCanvas.as:446-459`) hides the menu if `targetPlayer == null`, 
`view.actionState == ACTION_PK`, or `targetPlayer.npcFlag`. On show, the 89x83 radial menu is centred on the mouse
(`visible` setter `:606-617`). Every click runs `menuClickHandler` (`:300-339`) then hides the menu (clears `targetPlayer`).

| Button | Tooltip (`Language.TARGETCANVAS_S` / `_U`) | Action (file:line) |
|---|---|---|
| btn1 | `S[0]` "Thông tin" | `PANEL_CHARACTORINFO.showChaInfo(cid)` (`:311`) -> RPC `showChaInfo(cid)` awaited (`CharactorInfoPanel.as:3151-3157`) |
| btn2 | `S[1]` "Mời lập nhóm" | `remote.groupInvite(cid)` fire-and-forget (`:314`) |
| btn3 | `S[4]` "Chat mật" | `MAIN_SYS.wisperChat(name)` = fills input `/w name ` (`:317`); `enableUI/disableUI` toggle btn3+btn6 `:471-475,718-722` (callers not found) |
| btn4 | `S[5]` "Chat riêng" | `ChatPanelUtil.createChatPanel(cid)` (`:320`) |
| btn5 | `S[3]` "Kết bạn" | `_core.addFriend(name)` -> `IMPanel.addFriend(name)` (`Core.as:732-735`) |
| btn6 | `S[6]` "Giao dịch" | `PANEL_TRADE.newTrade(cid, name)` (`:326`) |
| btn7 | `S[2]` "Xem chiến đấu" | `remote.startWatch(cid)` (`:329`) (spectate; out of M3 scope) |
| btn8 | `S[7]` "Nhấn nút này để mời vào nhóm" + label `U[0]` "Lập nhóm" | `remote.groupRequest(_core.cid, targetCid)` (`:332`). Visible only if `target.inGroup && !player.inGroup` and not in battle server (`:619-634`) |
| btn9 | label `U[1]` "Đánh bại" | `remote.assassinate(cid)` (cross-server battle only, hidden on map 75; `:635-647`) |

- There is NO "PK" entry in this menu and no "block/black" entry. PK is a separate mode: `ACTION_PK=40` click on a
  player (`CharactorView.actionOnCreature` `:191-209`) -> `remote.PVPStartClient(cid)` (or `assassinate` in battle server).
  Other targeting modes (`GamePredef.as:981-985`): `ACTION_INVITE=20` (after panel "Mời vào nhóm": click -> `groupInvite`),
  `ACTION_TRADE=60` (click -> `newTrade`), `ACTION_OBSERVE` (-> `showChaInfo`). 
- Same actions are reachable from `CharactorInfoPanel` buttons: `Btn1` addFriend, `Btn2` createChatPanel, `Btn3` groupInvite
  (`CharactorInfoPanel.as:1890-1896`); from IMPanel friend menu, `ActivePanel.as:3500-3520` (menu items `MENU_P2PWISPER`, `MENU_INFO`,
  `CHAR_MENU_INVITE_T`, `CHAR_MENU_TRADE`).
- Menu labels in lists (`GamePredef.as` -> `Language.GAMEPREDEF_S`): `[153]` "Chat mật", `[154]` "Chat riêng", `[155]` "Thông tin",
  `[160]` "Trục xuất", `[161]` "Mời lập nhóm", `[163]` "Giao dịch", `[165]` "Rời nhóm", `[122]` "Xóa".
- Late joiners: when a `CharactorView` graphic loads it calls `getCharStateClient(cid)` -> int state (battle/trade icon...)
  and `getCharLeaderClient(cid)` -> Boolean (show leader flag) (`CharactorView.as:252-255,557-560,581-596`;
  triggered from `CreatureView.as:9042-9046`).

## 2. Chat channels

### 2.1 Constants (`predef/GamePredef.as:744-750`)
`MSG_CHANNEL_LOCAL=0`, `GLOBAL=1`, `GUILD=2`, `GROUP=3`, `BATTLE=4`, `AREA=5`, `HEADLINE=6`; a 7th pseudo-channel **9 = "Tán gẫu"
(rumour)** exists (`SystemBarCanvas.setChannel` case 9 `:656-690`; `ChatCanvas.onSay` bucket `:1795`). `MSG_TYPE_NORMAL="/s"`,
`MSG_TYPE_WISPER="/w"` (`:824-826`). Colors `MSG_CHANNEL_COLOR` (`:754`). `MSG_CHAT_INPUT_MAX=500` (`:751`).
Selectable list `MSG_CHANNEL` (`:45-72`): index 0 "Hiện tại"(`GAMEPREDEF_S[4]`), 1 "Thế giới"(`[5]`), 2 "Bang hội"(`[6]`), 3 "Nhóm"(`[7]`),
6 "Đầu bảng"(`SYSTEMBARCANVAS_U[6]`). Button captions (`SYSTEMBARCANVAS_U[0..5,7]`): "Hiện tại↑", "Thế giới↑", "Bang hội↑", "Nhóm↑", "Gửi",
"Đầu bảng↑", "Tán gẫu↑". Log tabs (`CHATCANVAS_S[11-21]`): "Toàn Bộ", "Thế Giới", "Hiện tại", "Bang Hội", "Nhóm", "Mật Ngữ", "Chỉ Thị",
"Hệ thống", "Sự việc", "Tán gẫu". System prefixes `CHATCANVAS_S[0-3]`: "[Hệ thống] ", "[Thông báo] ", "[Sự kiện] ", "[Trợ giúp] ".

**DELTA vs H5**: `packages/shared/src/protocol.ts:169-173` has `ChatChannel {LOCAL:1, GLOBAL:2, SYSTEM:9}`; legacy local=0, global=1.
The H5 ids are shifted by +1 relative to the legacy (and 9 means rumour in legacy, SYSTEM in H5). Decide before adding guild/group (3).

### 2.2 Sending (`SystemBarCanvas.sendMsg` `:1007-1056`)
1. Channel button style decides the cost check (below). 2. text = `_core.replaceBadWord(htmlText)` (client-side filter).
3. `TextUtil.encodeChatMsg(channelIndex, text)` (`utils/TextUtil.as:199-248`): regex `/(\/w )(.*?) (.*)$/`: match -> WHISPER
   `{channelId:-1, type:"/w", targetName, text}`; else NORMAL `{channelId, type:"/s", text}`. Links `<a href='event:L_TYPE|id|name'>` are
   encoded to `[@TYPE|id|name]` tokens (`encode` `:250-254`).
4. Normal -> `Creature.say(text, channelIndex)` (`object/Creature.as:404-413`) -> **`remote.say(selfId, selfType, channelId, text)`**
   (selfType = `TBL_CHARACTOR` = 2, `GamePredef.as:495`, set `Charactor.as:53`). Whisper -> `Creature.wisper(text, targetName)`
   (`:360-369`) -> **`remote.wisper(selfId, selfType, targetName, text)`**. Both fire-and-forget (no Responder).
5. Client rate limit: `checkChatTime()` (`Player.as:2302-2311`): min `CHAT_INTERVAL = 1.2` s (`GamePredef.as:1232`) shared by say, wisper
   and p2pWisper; fail -> `sysMidNote(GamePredef.CHAT_TOOFAST)` (the Language index `GAMEPREDEF_S[222]` resolves to "Đừng xóa!" in the
   decompiled table, so the constant is wrong; real text unknown). Also `RPC_DELAY["say"]=1100 ms` drops calls (`config/RPCConfig.as:28`).
   Max input 500 chars (`GamePredef.as:751`, `SystemBarCanvas.init` `:1199`).
6. Whisper echo: `decodeChatMsg` has a "sender" branch (`sourceId == self`, `TextUtil.as:294-296`) and a "target" branch, so the server pushes `onWisper` to BOTH sender and target (inferred from those branches).

### 2.3 Cost / level gates (all client-side prompts; server authority unknown - **inferred** that server must also enforce)
- World (channel 1): needs 1 "Loa" item (`ItemConfig.ITEM_SPEAKER = 719`, `config/ItemConfig.as:11`; `Core.hasSpeakerNum` `Core.as:1621-1624`) OR the
  free window: one free message per `WORLD_DELAY = 5*60000` ms (`SystemBarCanvas.as:76`), only if `player.level >= WORLD_SAY_LEVAL_FREE = 10`
  (`GamePredef.as:1551`). Text: `SYSTEMBARCANVAS_S[1]` "Mỗi lần phát ngôn trên kênh thế giới sẽ cần 1 Loa. (Mỗi 5 phút có thể phát ngôn miễn phí 1 lần)",
  `[15]` "Bạn vừa sử dụng lần phát ngôn miễn phí, mỗi lần phát ngôn trên kênh thế giới cần 1 Loa.", `[17]` level message, `[3]` buy prompt
  "Phát ngôn trên kênh thế giới cần mua Loa lớn tại shop (2 vàng)! Lập tức mua?". `_last_Time` is client memory only (resets on reload).
  `checkGlobal` `:943-1005`, `sendMsg` `:1007-1020`. The client sends `say(...,1,...)` without telling the server whether it was a free message.
- Rumour/"Tán gẫu" (9): same 5 min / level 10 (`RUMOUR_SAY_LEVAL_FREE`) rules, Loa 719 (`checkRumour` `:1723-1790`; texts `S[24-28]`). **Quirk**: after
  selecting it the code sets `btnChannel.data = MSG_CHANNEL[4]` (the HEADLINE entry, `index = 6`), so `say` is sent with channelId 6, not 9
  (`:1733,1757`; `sendMsg` reads `btnChannel.data.index`, `:1042`). Inferred: server/Go may remap; verify against Go before porting.
- Headline "Đầu bảng" (6): needs `ItemConfig.ITEM_HEADLINE_SPEAKER = 2297` (`ItemConfig.as:12`); text `S[18-20]`.
- Guild (2) and Group (3): NO client gate at all (`setChannel` cases 2/3, `:656-690`); the server must reject when not in guild/group.
- Auto team chatter: a non-leader, non-AFK member who tries to walk gets `walkable=false`, `sysMidNote(PLAYER_S[1])` and an automatic
  `say("Nhóm trưởng, đi nhanh nào.", GROUP=3)` (`Player.as:2480-2485`; `PLAYER_S[1]` "Đã ở trong nhóm thì cần nghe lời nhóm trưởng!", `[2]`).

### 2.4 Push `onSay` (`ChatCanvas.as:1718-1824`)
Keys read: `channelId`, `name`, `cname` (preferred for blacklist check), `id`, `type` (sourceIdType: 2 char, TBL_CREATURE, TBL_NPC, TBL_PET),
`msg`, `pmLevel` (index into `PM_CHAT_FLAG`, 0 = none; `PM_PANEL[21..24]` "[VIP1]".."[VIP4]"). Drops if `_core.isBlack(cname||name)`. Channel 0 additionally
calls `gameObject.view.onSay(msg)` (bubble) if `GLOBAL_SETTING.hc` is off. Buckets: 0 Scene, 1 World, 2 Guild, 3 Team, 9 Rumour (only `<4 || ==9`),
6 -> headline strip (cleared after 30 min). 4/5 are not shown here. Name `"系统"` (Chinese "system") renders as `[<channel label>][name]:msg`.
Display format of a char message (`TextUtil.decodeChatMsg` `:262-285`): `<font color=CHANNEL_COLOR[ch]><a event:L_C|ch>[label]</a>{pm flag}<a event:L_PID|id|name>[name]</a>: text`.

### 2.5 Whisper `/w` and private chat window
- `onWisper(o)` (`ChatCanvas.as:790-813`): reads `sourceName`, `sourceId`, `targetId`, `targetName`, `text`; forces `channelId=-1`,
  `type="/w"`. **`TextUtil.decodeChatMsg` only formats the message if `o.sourceIdType == TBL_CHARACTOR (2)`** (`TextUtil.as:265`) and then either
  `sourceId == self` ("[Thầm] Bạn nói với [name]: ...", `TEXTUTIL_S[15-16]`) or `targetId == self` ("[Thầm] [name]: ...", `TEXTUTIL_S[17]`).
  `onWisper` never sets `sourceIdType`, so the server push must carry `sourceIdType: 2` (the old client-side object is built by the sender
  only for its own encoding). If missing, `decodeChatMsg` returns `""` plus `"<br>"` (blank line). If `sourceId == self && targetId != -1` the target is
  added to IM "Liên hệ" (`addConnectionAC`). Blacklisted `sourceName` is dropped.
- Failure to find the whisper target: no client-side error path found (inferred: server sends a midNote).
- **p2pWisper ("Chat riêng")**: `ChatPanel.textSend` (`view/view/compDragable/ChatPanel.as:512-545`): text < `CHAT_STR_MAX = 55` chars (`GamePredef.as:1514`) and
  `!_core.haveSpecialStr_vn(text)` (else append `CHATPANEL_S[0]` "Chữ số quá nhiều hoặc từ không hợp lệ<br>"), `checkChatTime()` (else `CHAT_TOOFAST`).
  It builds the HTML line locally `"[@C|selfId|selfName|0|0|0]<font color='#00ff00'>[HH:MM]:</font><p><br>" + text + "<p><br>"`, appends it to the local
  `chatData[targetId]` and calls **`remote.p2pWisper(htmlLine, selfId, targetId)`** (`Creature.as:244-247`, fire-and-forget).
  The sender is NOT echoed by the server (sender appends locally).
- Push `onP2pWisper(html:String, senderId:Number, senderName:String, [autoReply:Boolean=true])` (`ChatCanvas.as:1405-1435`): positional args. Dropped if
  `isBlack(senderName)`. Appends `TextUtil.decode(html)` to `chatData[senderId]`; open window -> `showOutput()`, else status "unread" and
  `addWarn({warnType:10 (WARN_TYPE_P2PWISPER), speaker:senderId, speakerName})` (blinking mail-like icon; click -> `ChatPanelUtil.getChatPanel(speaker, speakerName)`,
  `WarnCanvas.as:391-393`). Offline target: no client logic (inferred: server returns a midNote).
- Window `ChatPanel` (`PANEL_CHATMANAGER` lists unread/open conversations; `ChatPanelManager.as`): fields from `userData`: `id`, `name`, `iconCode`,
  `exp` (level via `basic.expToLevel`), `classId` (`ChatPanel.as:480-505`). Titles `CHATPANEL_U`: [2] "Chat" (title; later overwritten with "Đóng"), [0] "Chat log", [3] "Tên", [4] "Nghề",
  [5] "Cấp", [1] "OK"; `CHATPANEL_S[1]` tooltip.
- `ChatPanelUtil.createChatPanel(cid)` / `getChatPanel(cid, name)`: class missing. `RPC_DELAY["getChatPanel"]=3000` (`RPCConfig.as:68`) and push `onCreateChatPanel(userData)`
  -> `ChatPanelUtil.createCP(userData)` (`ChatCanvas.as:640-643`) strongly imply: RPC **`getChatPanel(cid)`** (inferred args) -> push `onCreateChatPanel {id,name,iconCode,exp,classId}`.
- System messages go through `showSystemMsg`/`showRedMsg`/`showBlueMsg` (pushes `onSystemSay`, `onRedMsg`, ... per `chat-link-formatter.md`), not part of `say`.

## 3. Party / group

### 3.1 Files
`logic/Group.as` (ALL group push handlers, 587 lines), `view/view/compDragable/GroupPanel.as` (PANEL_GROUP=560 window: tabs "Nhóm hiện tại" / "Danh sách xin vào" / group platform),
`view/view/compMain/GroupInfoCanvas.as` (MAIN_GROUP=130 HUD list), `view/view/comp/GroupMemberCanvas.as` (one member tile), `GroupMemberMapInfoCanvas.as` (hover info),
`IMPanel.as` (tab "Tìm nhóm" = groups on map), `view/view/compMain/WarnCanvas.as` (invite icon), `object/Charactor.as`/`Player.as` (flags), `CreatureView.as` (follow),
`config/RPCConfig.as`. Related but out of M3: `GroupRecruitPanel/GroupRecruitDetailPanel` (room-based recruiting: `getRoomList`, `getMyRoom`, `leaveRoom`, `acceptRoomApply`,
`kickRoomMember`, `setRoomHost`, `roomChat`; opens only at level >= 30, `Language.GROUP_RECRUIT_PANEL_S[11]` "Người chơi cấp 30 trở lên mới được mời nhóm！").

### 3.2 Constants
`MAX_GROUP_MEM_NUM = 5` (`GamePredef.as:1741`); `VALID_DIS_ADD_GROUP = 30` (map-units = px/10, `:1740`, used in `IMPanel.reqAddGroup` `:1624-1635`);
`AFK_CAN_BACK_DIS = 300` px (`:2162`); follow gap `GROUP_FOLLOW_DISTANCE = 45` px, flying `120` (`:35-36`). `WARN_TYPE_GROUP_INVITE = 140`, `WARN_TYPE_GROUP_APPLY = 120`.

### 3.3 RPCs the client sends (exact arg order)
| RPC | Args | Reply | Caller |
|---|---|---|---|
| `groupInvite` | `(targetCid)` | none (pushes) | TargetCanvas `:314`, CharactorView `:186`, CharactorInfoPanel `:1890`, ActivePanel `:3514` |
| `groupJoin` | `(inviterCid)` ("Yes" on invite dialog) | none | Group `:58`, WarnCanvas `clickGroupInvited` |
| `groupReqDeny` | `(otherCid)` ("No" on invite dialog or reject a request) | none | Group `:62,432`; GroupPanel `:1361` |
| `groupRequest` | `(selfCid, targetCid)` (apply to join; `targetCid` = any member from the target menu, group LEADER `lid` from IM list) | none | TargetCanvas `:332`; IMPanel `:1629` |
| `groupAdd` | `(applicantCid)` (leader accepts request) | `call(...)` Boolean (GroupPanel: true -> remove row, false -> blue msg `GROUPPANEL_S[6]` "Thêm thành viên thất bại."); plain fire-and-forget in `Group.onGroupRequested` | GroupPanel `:908`, Group `:428` |
| `groupReqSuccNotice` | `(applicantCid)` (sent when a request row is added to the panel) | none | GroupPanel `:1049` |
| `groupLeave` | `()` | none | GroupPanel `:426` (also hides panel); GroupInfoCanvas `:349` |
| `groupKick` | `(memberCid)` (leader only UI) | none | GroupPanel `:853`; GroupInfoCanvas `:354` |
| `groupGiveLeader` | `(memberCid)` | Boolean (false -> midNote `GROUPPANEL_S[2]` "Đổi nhóm trưởng thất bại.") from the panel; fire-and-forget from HUD menu | GroupPanel `:1062`; GroupInfoCanvas `:360` (`call(...,null,cid)`) |
| `groupAFK` | `()` | `{cid:<truthy>}` (panel sets button "Về nhóm"), HUD passes null Responder | GroupPanel `:1260`; GroupInfoCanvas `:280` (null Responder) |
| `unGroupAFK` | `(near:Boolean)` `true` = within 300 px of leader on same map; no arg/`false` = used "Sách Hồi Nhóm" (confirm dialog `GROUPPANEL_U[13]`) | `{cid}` (panel sets "Tạm rời") | GroupPanel `:1311,1318`; GroupInfoCanvas `:331,338` (null Responder) |
| `groupListOfMap` | `(mapId)` | push `onInitGroupList` | IMPanel `:1347` |
| `getGroupMemberPosistion` | `(memberCid)` (typo kept) | `{map:mapId, x, y}` (x,y px; shown `floor(x/10),floor(y/10)`), throttled 1/s on hover | GroupMemberCanvas `:201` |
| `getCharLeaderClient` / `getCharStateClient` | `(cid)` | Boolean / int | CharactorView `:254,559` |

Also: `useTransportGroup(mapId)` (leader-only group teleport item, `Player.as:1626-1646`) and `useTransport(...)`.

### 3.4 Pushes consumed (`logic/Group.as`, payload keys from the bodies)
| Push (inferred from method name) | Payload | Client effect |
|---|---|---|
| `onGroupInviteSent` `:28` | `{pid, name}` | midNote `GROUP_S[0]` "Bạn đã gửi cho {nameLink} lời mời gia nhập nhóm." |
| `onGroupInvited` `:37` | `{pid, name, dis?}` | if `dis` falsy: ignored unless `core.state == ST_CORE_NORMAL`; midNote `GROUP_S[2]` + modal YES/NO `GROUP_S[3]` "{obj.name} gửi cho bạn lời mời gia nhập nhóm." (YES -> `groupJoin(pid)`, NO -> `groupReqDeny(pid)`); a newer invite replaces the open alert. **No countdown timer** in the client. If `dis == "far"`: no dialog, `addWarn({pid,name,warnType:140})` -> blinking invite icon; click re-opens the same dialog (`WarnCanvas.clickGroupInvited` `:310-340`) |
| `onGroupRequestSent` `:87` | `{pid, name}` | midNote `GROUP_S[6]` |
| `onGroupRequest` (`GroupPanel.onGroupRequest` `:1011-1055`) | `{id, name, exp, classId}` (Go `requests.go:260-267`) | adds to leader's "Danh sách xin vào" (dedupe by id), sysMsg `GROUPPANEL_S[11]` "{name} yêu cầu gia nhập nhóm", sends `groupReqSuccNotice(id)`, blinks team button (`MAIN_SYS.setTeamButtonBig`). |
| `onGroupRequested` `Group.as:414` | `{pid, name}` | alternative: YES/NO dialog -> `groupAdd(pid)` / `groupReqDeny(pid)`; skipped while guide visible or state != NORMAL. Which one the server uses is not visible (Go uses `onGroupRequest`) |
| `onGroupDeny` `:124` | `{cid, name}` | midNote `GROUP_S[4]` "{nameLink} từ chối lời mời gia nhập nhóm của bạn." |
| `onGroupRequestDeny` `:537` | `{cid, name}` | midNote `GROUP_S[7]` |
| `onGroupInviteFailed` `:329` / `onGroupRequestFailed` `:351` | `{type, pid?, name?}` | midNote by type: 0 `SYS_MSG_GROUP_INVITETOOFAR` "Khoảng cách quá xa không thể mời nhóm."; 1 name+" đã ở trong nhóm."; 2 name+" đã gia nhập nhóm khác."; 3 "Nhóm đã đầy."; 4 "Chỉ có thể lập nhóm với người chơi cùng đội." ; 5 "Người chơi này đã có đội, không thể lập nhóm" |
| `onGroupCantJoin(cid:Number, code:int)` `:375` (**positional args**) | -- | prefix "Tự kỷ" if `cid == self` else "Người chơi này" if `cid > 0`; code 10 "Đang ở trạng thái đặc biệt", 20 "Nhóm đầy", 30 "Đã ở trong nhóm" (`GAMEPREDEF_S[525-529]`). Go notes list only 10/20; client also knows 30 |
| `onGroupJoined` `:96` | `{groupCharactorList, groupAKFCidList, mList}` | see below |
| `onGroupLeave` `:466` | `{sid, name, mList}` | note `LinkEncode(name)+" đã rời nhóm."` shown to self if self is in `mList`; `setGroupState(mList)`; if `sid == self` -> reset own state (`groupList=[]`, `walkable=true`, ... and `moveToSafeArea()` when on ground); `clearGroupLeaderState` |
| `onGroupDismiss` `:109` | **top-level** `{head:{obj:cid,next:...}}` (NOT wrapped in mList) | note "Nhóm đã giải tán." to members, clears flags, stop follow, `groupMemberListArr[cid]=null`, own `moveToSafeArea()` |
| `onGroupGiveLeader` `:516` | `{sid(old leader), oName, tid(new), nName, mList, afkflag?}` | msg `LinkEncode(sid,oName)+" nhường chức nhóm trưởng cho "+LinkEncode(tid,nName)`; if `afkflag` swaps AFK flags (new leader not afk, old leader afk); `setGroupState(mList)` |
| `onGroupAfk` / `unGroupAfk` `:356,211` | `{cid, mList}` | wrapper methods; `unGroupAfk` waits 1.5 s via `setTimeout` if the leader's `Charactor` is not yet in the scene; `setGroupState(mList)`; if `cid == self` refresh HUD |

`groupCharactorList` (`groupCreateChars` `:133-166`): iterable of scene-char data objects (same shape as a map-player; keys read: `id`, `vipT`, `SpeT`, `t`, plus everything `Charactor.data` needs).
It builds `core.groupMemberListArr[id] = new Charactor` (so the HUD can show members that are NOT in the current scene, e.g. AFK on another map). `groupAKFCidList`: array of cids (typo `AKF` kept in the key) that are AFK.
`mList` = **linked list** `{head:{obj:cid, next:{obj:cid, next:...}}}` (leader first: `head.obj` is the leader, `setGroupState` `:224-327`). `setGroupState` dereferences `mList.head.next` unguarded
(`:228-229`): `mList.head` must be non-null in every push that carries `mList` (joined, leave, afk, giveLeader).

### 3.5 Client-side party behaviour
- Flags on `Charactor`: `inGroup`, `isLeader`, `groupAfk` (`Charactor.as:25-35,84-110`). `Player.groupList` setter (`Player.as:2340-2365`) rebuilds `groupAC` (ArrayCollection) in list order
  from `groupMemberListArr[cid]` else `getCharactor(cid)`; this feeds GroupPanel grid (columns "Tên", "Cấp", "Nghề"; `GROUPPANEL_S[3-5]`) and the HUD.
- **Leader flag**: `CharactorView.showLeaderFlag()` adds `ResManager.UI_LEADER_FLAG` (symbol, at x 0, y -90 above the head) (`CharactorView.as:50,634-649`; `CreatureView.as:9042-9046`).
  Removed on dismiss/leave. (The H5 can use any crown/flag icon; the asset is a Flash symbol.)
- **Team marker on entities**: only the leader flag. `setLeagueFlag(1|2|0|-1)` (red/blue league icon, `CharactorView.as:269-298`) is a separate cross-battle "team" badge fed by a push (`onSetTeamLeague` per Go notes).
- **Follow**: purely client-side. For each member after the leader in `mList` order, non-AFK member `startFollow(previous non-AFK member's view)` (`Group.as:304-325`; `CreatureView.as:8001-8010,7583-7640`): while distance
  > 45 px (120 flying) the follower steps toward the previous member at its own speed; own player gets `walkable=false` (`PlayerView.as:245-251`). AFK member / leader: `stopFollow()` -> `walkable=true`. Members that are
  not in the scene (`getCharactor == null`) are skipped in the chain.
  The leader's movement is the only one sent (`udcp`, `Player.as:256`); the server updates followers (Go notes). Leader-only RPC use: `sceneChange`/portal (followers cannot walk), `useTransportGroup`.
- **Walk gating**: member that is `inGroup && !isLeader && !groupAfk` cannot walk (`Player.as:2480-2485`; battle end restore only for non-group/leader/AFK, `Battle.as:335,783`).
- **Leaving / dismiss**: for the own player also `moveToSafeArea()` when `flyingState == ON_GROUND` (`Group.as:483-492,570-579`).
- **Max members 5** is used only for the IM "find group" list (`btnReqAdd` disabled if `gnum >= 5`, `IMPanel.selectGroupTeam` `:4184-4200`); inviting beyond 5 is rejected by the server (`onGroupInviteFailed type 3`).
- **HUD (`GroupInfoCanvas`, MAIN_GROUP)** shows a vertical list (`Repeater` of `GroupMemberCanvas`) bound to `player.groupAC`: portrait (`iconCode` -> `ResManager.getIconUrl`), AFK members are desaturated + "AFK" tip image,
  hover shows `GroupMemberMapInfoCanvas` (name, class, "Cấp: N" `GROUPMEMBERCANVAS_S[0]`, map name, "x,y" polled by `getGroupMemberPosistion` at most once per second). **There are NO hp/mp bars on the HUD tiles.**
  Click tile: self non-leader -> menu {"Về nhóm"/"Tạm rời", "Rời nhóm"}; leader on other member -> {"Thăng làm nhóm trưởng", "Trục xuất"} (AFK member: only "Trục xuất"); leader on self -> {"Rời nhóm"}
  (`GroupInfoCanvas.onClickHandler` `:187-262`). HUD hidden during battle (`Battle.as:978`), restored after (`:660`).
- **GroupPanel buttons (`GROUPPANEL_U`)**: [0] "Thăng làm nhóm trưởng", [1] "Trục xuất khỏi nhóm", [2] "Rời nhóm", [3] "Mời vào nhóm" (-> `invite()`: `showSelect()` + `actionState=ACTION_INVITE`, `GroupPanel.as:429-437`, blocked in battle), [4] "Nhóm",
  [5] "Nhận lời mời", [6] "Từ chối lời mời", [7] "Xóa danh sách", [8] "Nhóm hiện tại", [9] "Danh sách xin vào", [10] "Mời nhóm", [11] "Về nhóm", [12] "Tạm rời", [13] "Cách nhóm trưởng quá xa, xác nhận sử dụng Sách Hồi Nhóm để lập tức về nhóm?",
  [14] "Bạn không có Sách Hồi Nhóm, hãy mua ở Shop để dùng!", [15] "Bạn không ở trạng thái tạm rời nhóm", [17] "Bạn đang chiến đấu hoặc quan sát chiến đấu, không thể về nhóm". Panel size 310x290 (`GroupPanel.as:399-405`).
  Own-kick guard: `GROUPPANEL_S[0]` "Nếu muốn rời nhóm có thể chủ động rời"; own give-leader guard `[1]` "Đừng tỏ ra mình là nhóm trưởng".
  Giving leadership clears own `groupRequestAC` (`:1063`).
- **AFK return rule** (client): `unGroupAFK(true)` only when leader found, same map, distance < 300 px; otherwise needs confirm dialog and (server-side) the return book; refused in battle/watch (`GroupPanel.afk` `:1255-1325`).
- **Keyboard**: team panel hotkey T (`SYSTEMBARCANVAS_S[9]` "Lập nhóm (Phím tắt T)").
- **Group through portals**: nothing on the client; the leader sends `sceneChange`; follower scene changes arrive as normal server scene pushes (Go `FollowLeaderToMap`, see `group-party.md`). `Player.as:1646` `useTransportGroup`.
- **Invite flow gating on client**: `groupInvite` can be sent anytime (menu/CharactorInfo). Only gate: `GroupPanel.invite()` returns in battle. Size/level/distance checks are all server-side (`onGroupInviteFailed` types).

## 4. Group battle - what the client expects

Source: `logic/Battle.as`, `view/view/compBattle/BattleStage.as`, `BattleCreatureView.as`. The client has no group-specific battle protocol; a group battle is a normal `onBattleStart` whose `cList` contains several `type == TBL_CHARACTOR` entries.

- `BattleStage.setBattleGroups` (`:1061-1085`): first loop creates a view for every `cList` item with `type == 2` via `setBattleChar` (`:1086-1092`): `_core.getCharactor(item.id)` -> **the teammate's `Charactor` must already exist in the client scene** (`createChars`/`onScenePlayerEntered`);
  otherwise the null reaches `initBattleView` (unguarded, **inferred crash/blank**). Then creatures (type 1) and pets. Per-entry keys used (`BattleCreatureView.initBattleView` `:1131-1148`): `battleId`, `id`, `type`, `hp`, `hpMax`, `mp`, `mpMax`, `sp`, `spMax` (pets also `cid`).
  `core.player.battleId` identifies "self" (`Battle.as:110`); other player-side slots are teammates (`battleGetGroupPlayerList` `Battle.as:805-818`: right side, `type == 2`, alive).
- Player slots: rows `[18,16,15,17,19]` front / `[13,11,10,12,14]` back; teammates and their pets take the other slots (positions 10-14 back row, 15-19 front row; see `2026-11-04_03_COMBAT_CLIENT_RESEARCH.md` s4.2 for pixel positions).
- Each client sends only ITS OWN commands: `Battle.battleCmd(tid, action, id, level)` pushes `{tid, action, id, level}` into `_cmdAry`; after 1 cmd (no pet) or 2 cmds (player + pet) -> `battleSendCmd` -> `remote.battleUpdateCmd(_cmdAry)` (array of 1-2 entries, `Battle.as:845-850,1105-1150`), with a **4 s minimum round time** (`BATTLE_SEND_DELAY=4000`, `:56,883-905`, sends later via `setTimeout`).
  After sending: cmd panels hidden, banner `BATTLE_S[0]` "Đang chờ...", `core.cmdState = ST_BATTLE_WAIT (440)` (`:891-895`).
- **Wait icons**: each new round `startNewRound` -> `setWaitIcon()` (`BattleStage.as:1011-1023,1188-1191`) shows a wait icon over EVERY character view (`BattleCreatureView.showWaitIcon` `:1266`).
  `BattleStage.setReady(battleId:Number)` hides it for that creature if it is a character (`:1245-1252`); `clearWaitIcon` hides all (`:1853-1865`, used when the playback starts - inferred). The push that calls `setReady` is in the stub;
  Go sends `onCmdReady(position)` (`internal/presentation/rtmp/handlers/combat/group_battle.go:161-172`) - **name inferred** as the caller of `setReady`; semantics in client terms = "the player at battleId has submitted a command".
  Go currently sends each participant only their own position (see Open Questions).
- If the own character is dead at round start the client auto-queues DEFENCE when its pet is alive, otherwise shows no cmd UI (`startNewRound` `:1188-1221`, `checkSelf`).
- Turn timer: client shows `TimeCountCanvas` (25 s per `2026-11-04_03`); at 0 the timeout action is `BATTLE_ACTION_TIMEOUT=-40`. The authoritative deadline is the server's (Go uses 30 s PvE/25 s PvP, `pvp-apvp.md`).
- Playback is one shared `onBattlePlayList` (all actions of all participants in the group arrays) played to every participant; actions are keyed by `battleId` so no per-player differences are needed (`BattleStage.startSequence`, see M2 doc).
- Walkability after battle: members that are not leader and not AFK keep `walkable=false` (they follow the leader) (`Battle.as:335,783`). The group HUD is re-shown (`:660`).
- Watching: `startWatch(cid)` / `watchOnEnd` exist for spectators (`Battle.as:327-346`); out of M3 minimum.
- Leader-started battles bring teammates in via the server (`onBattleStart` sent to each), no client RPC from the followers; random-encounter `cbom` is sent only by the walker (leader).

## 5. Friends / social (IM panel, `PANEL_IM = 540`, `IMPanel.as`, 4240 lines)

### 5.1 Data and caps
- Relationship objects (map keyed by relationship id): `{id, type, name, otherId, selfId, num (intimacy), data?{exp, classId, ...}}`. `data` present = ONLINE ("Online"/"Offline" = `IMPANEL_S[69]`/`[70]`), level = `basic.expToLevel(data.exp)`, class from `TBL_CLASS[data.classId]` (`IMPanel.updateView` `:3403-3500`).
- Wire `type` ints: `GamePredef.RELATIONSHIP_TYPE = [1,2,3,4,5,6]` (`GamePredef.as:889`): 1 friend, 2 black, 3 enemy, 4 couple, 5 tutor, 6 brother (`updateView` uses `[0]`..`[5]`); matches `social-relationships.md` (domain type + 1).
- Caps `RELATIONSHIP_SIZE = [120, 30, 20, 100]` (`:890`): friends 120 (`IMPANEL_S[1]`), blacklist 30 (`IMPANEL_S[5]`), recent contacts 20 ("Liên hệ", `addConnectionAC` `:2612-2632`), enemies 100 (`IMPANEL_S[80]`). Checked client-side before sending; server should also enforce.
- Tabs (`IMPANEL_U`): [7] "Bạn bè", [8] "Xấu" (black), [9] "Liên hệ", [10] "Sư đồ", [30] "Tìm nhóm" / [31] "Lập nhóm", [11] "H.nhân", [12] "Kẻ thù", [33] "Kết bái". Friend table columns: name, level, class, state, intimacy `num`, "pos".

### 5.2 RPCs
| RPC | Args | Reply | Notes |
|---|---|---|---|
| `initViewImC` | `()` | none; push `onInitViewImC(map)` | called by `IMPanel.initView()` (panel open and before friend-menu actions) `:4129-4138`; `RPC_DELAY 10000` (`RPCConfig.as:46`) |
| `addRelationByName` | `(name:String, type:int 1/2/3)` | none | `IMPanel.addRelationship` `:1852`; add by NAME only; no request/confirm/accept step exists |
| `delRelationship` | `(relationshipId)` | none; push `onDelRelationship(id)` | after YES dialog (`IMPANEL_S[71]`: "Bạn xác nhận muốn xóa bạn {name} có điểm thân mật là {num} ra khỏi danh sách bạn bè của bạn?", `[83]`, `[82]`) |
| `groupListOfMap` | `(mapId)` | push `onInitGroupList` | "Tìm nhóm" tab |
Not present: `getFriendList`, `getBlackList`, `refuseToAddFriend`.

### 5.3 Pushes (IMPanel)
- `onInitViewImC(Object)` `:1140`: full map id -> relationship object; rebuilds friend/black/enemy/tutor/brother lists (`updateView`).
- `onAddRelationship(rel)` `:1893`: `relationShipList[rel.id]=rel`, `updateView`, midNote `SYS_MSG_ADDFRIEND`="Kết bạn: " / `ADDBLACK`="Danh sách đen: " / `ADDENEMY`="Thêm kẻ thù: " + `[@C|otherId|name|0|0|0]` link.
- `onAddRelationByName(code:Number, type:int)` `:3725`: **positional**; `code == -1` -> Alert `IMPANEL_S[9]` "Người chơi này không tồn tại!". (Other codes ignored.)
- `onDelRelationship(id:Number)` `:2181`: notes `SYS_MSG_DELFRIEND`("Xóa bạn: ") / `DELBLACK`("Xóa danh sách đen: ") / `DELENEMY` + link; deletes from list.
- `onSetClose(name:String, delta:Number)` `:1962`: intimacy update (`delta<0` relative subtract, else absolute set).
- `onInitGroupList({lineid, grplist:{head:{obj:{lineId,lId,lName,lLevel,num,posX,posY},next}}})` `:1495`: rows for the "Tìm nhóm" tab (line = lineId+1, "Kênh").
- No live online/offline presence push is visible in the client; `data` presence only refreshes via `initViewImC`. (Whether a login/online push exists is in the stub: **unconfirmed**.)

### 5.4 Add-friend flow
`TargetCanvas`/CharactorInfo "Kết bạn" -> `IMPanel.addFriend(name)` (`:2551-2578`): if `isBlack(name)` Alert `IMPANEL_S[0]` "Người này đã trong danh sách đen, không thể kết thành bạn!"; if already friend `[3]` "Bạn bè đã tồn tại!";
if `friendCount >= 120` `[1]`; else `remote.addRelationByName(name, 1)`. One-sided and immediate (the server pushes `onAddRelationship` to the adder; the other side is not asked and no client handler exists for
a request). Black: `addBlack(name)` (`:4151-4178`): if friend `[4]` "Người này đã trong danh sách bạn bè, không thể đưa vào danh sách đen!"; dup `[7]` "Danh sách đen đã tồn tại!"; cap `[5]`; `addRelationByName(name, 2)`.
Friend list click menu (`:1885`): "Chat mật", "Chat riêng", "Thông tin", "Xóa". Black menu: "Thông tin", "Xóa".

### 5.5 Blacklist effects (client-only)
`Core.isBlack(name)` -> `IMPanel.isBlack(name)` = `blackAR[name]` (`Core.as:1244-1247`, `IMPanel.as:1461`). Applied in `onSay` (by `cname||name`), `onWisper` (`sourceName`), `onP2pWisper` (arg 3 `senderName`): message silently dropped. Not applied to invites, trades or
`onGroup*`. IMPORTANT: `blackAR` is only populated by `onInitViewImC`/`onAddRelationship`; the `black` array that Go puts in `onChooseCharactor` has no visible client consumer (stub) -> the filter may be empty until the IM panel has been opened once (**unconfirmed**).

## 6. Trade (`TradePanel.as`, `PANEL_TRADE = 370`, 471x449, `styleName StandardContent`)

### 6.1 Flow (real protocol: 4 RPCs)
1. Initiator: `newTrade(cid, name)` (`TradePanel.as:1591-1603`): ignored if `cid == self`; requires `_core.player.actionState == GamePredef.ST_NORMAL (1)`. Stores `targetId/targetName`, calls
   **`remote.call("newTrade", Responder(onNewTrade), cid)`**. Reply `{flag:Boolean, info:String}`: `flag == true` -> `startTrade()` (opens panel: titles, `myMoney.maxValue = player.money`, `myGold.maxValue = player.gold`);
   else clear target and `sysMidNote(info)`.
2. Target: push **`onRequestTrade(cid:Number, name:String)`** (`:1496-1501`) - positional - sets target and calls `startTrade()` directly. **There is NO accept/decline dialog**: the panel simply opens on the other client.
3. Both: drag bag items into 5 slots `item1..5` (double-click bag item; `Slot.as:1109-1113` `SLOT_TRADE_ITEM` only from `SLOT_BAG`; `TradePanel.addItem` `:1298-1331` dedupes, takes first free slot; double-click in the trade slot removes `:1688-1698`) and
   up to 5 pets (`pet0..4`, `addPet` `:1716-1761`: only pets with `binded == 0`, marks `inTrade`) plus money (`myMoney`) and gold (`myGold`) `Currency` inputs. No RPC is sent for these edits; they are local until LOCK.
   Client item checks: none for bound items (`addItem` has no `binded` test; the **pet path does**, `:1728`). Server must reject bound/untradeable items.
4. Lock: button "Khóa" (`TRADEPANEL_U[1]`) -> `tradeLock()` (`:1639-1680`): **`remote.call("tradeLock", Responder(onSelfLock), {money, gold, petIds:[5 x (petId|-1)], petId:(pet0 id|-1), items:{1..5: itemInstanceId}})`** (item value = `slotData.id` instance id). Reply `{flag, info}`:
   true -> lock button disabled, money/gold inputs disabled, state "lock", label `TRADEPANEL_S[2]` "Đã khóa"; false -> midNote(info).
   Counterparty receives push **`onTargetLock({money, gold, itemList:{1..5:{type,itemId,stackNum}}, petIds:[..]})`** (`:1539-1572`): label `S[3]` "Đã khóa", fills the target slots (`itemList` keyed 1..5; pets keyed 0..4, -1 = empty).
5. Confirm: allowed only in state "lock" else midNote `S[5]` "Vui lòng khóa giao dịch!". Client pre-checks bag/pet space for the incoming items (`enoughBag`, `enoughPetSlot`; messages `S[4]` "Không có đủ không gian túi đồ!", `S[15]` "Không đủ Ô Pet!", `S[16]` "Không đủ chỗ trống trong túi đồ và túi pet!").
   **`remote.call("tradeConfirm", Responder(onSelfConfirm), passMd5)`** where `passMd5` = cached `_core.delPass` (if set and bag not gold-locked) else the user types the protection code (prompt `DELETE_BY_PASS[0]` "Mã bảo vệ (Mặc định: 123456)", title `TRADEPANEL_S[14]` "Giao dịch vật phẩm") and the client sends `MD5.hash(input)`.
   Reply `{flag, info}`: true -> state "confirm", label `S[6]` "Đã xác nhận", confirm button disabled; else midNote(info). Counterparty push **`onTargetConfirm()`** -> label `S[7]` "Đã xác nhận".
6. Completion: server pushes **`onTradeSuccess()`** to both (`hide()` + midNote `S[9]` "Giao dịch thành công!") or **`onTradeFail(msg:String)`** (`hide()`, midNote `S[8]` "Giao dịch thất bại!"; msg only traced) - names from handler methods; who sends when is inferred.
7. Cancel: closing the panel (`hide()`, `:1132-1141`) sends **`remote.call("stopTrade", null)`** and clears local state; the peer gets push **`onStopTrade()`** (`:1353-1360`: hides + clears if visible). `hide()` is also invoked on `onTradeFail`/`onTradeSuccess`, which therefore
   also sends `stopTrade` (harmless echo, server must tolerate `stopTrade` without an active trade).
- State machine on the client: `normal` -> (own lock) `lock` -> (own confirm) `confirm`. Item/pet editing only allowed in `normal`. Lock button label "Khóa"; confirm "Giao dịch" (`TRADEPANEL_U[0]`); [2] "Hủy" (close), [3] "Vật Phẩm", [4] "Pet".
- Panel text: `S[0]` "Nhấp đôi vào vật phẩm trong túi đồ để thêm vào", `S[1]` "Nhấp đôi vào vật phẩm trong khung giao dịch để xóa", `S[10]` "Sau khi khóa thì đối phương mới có thể giao dịch vật phẩm", `S[11]` "Khung giao dịch đối phương", `S[13]` "Khung giao dịch bản thân".
- Opening the panel also shows the bag panel and follows the trade window (`show()` `:1979-1986`, `bag.startFollow(this)`).
- **Gating on the client**: ST_NORMAL for the initiator only; no level, distance or battle check (the target menu is only reachable for visible same-map players). Everything else (level, distance, bound items, money/gold availability, other party busy)
  is server-side and conveyed through `{flag:false, info}`.
- The TargetCanvas `disableUI/enableUI` pair toggles "Chat mật" and "Giao dịch" buttons (`TargetCanvas.as:471-475,718-722`); callers not found (inferred: used while the target is in a state that forbids them).

## 7. Lines (`LineSelectCanvas`, `MAIN_LINE`)

"Line" = **game server channel/instance** ("Kênh", `IMPANEL_U[27]`). Not a map-instance split: the client opens a *separate global connection* (`_core.global`, app `tcn`), calls **`getLineInfo()`** on it (awaited, returns `Array<{id, name, url, status, clients, max, ...}>`,
`LineSelectCanvas.as:411-448,719`; `RPC_DELAY 10000`) and, on choosing a line, closes the current game connection and reconnects to `lineInfo.url` (`connect2` `:240-330`, with `["L", user, pass, time, session, lineId]`), then `changeLine(lineId)` (`:337-345`).
Open from the minimap line button (`MiniMapCanvas.changeLine` `:2149-2157`: first `inInstanceMap(mapId)` Boolean; true -> confirm `MINIMAPCANVAS_U[6]`, else open `MAIN_LINE`). Texts `LINESELECTCANVAS_S[0-11]` ("Server chưa mở, vui lòng chờ...", "Đang vào game ở kênh này.", "Kênh này đã đầy, vui lòng chọn kênh khác để vào game.",
"Đang chuyển kênh, vui lòng chờ...", "(Thường)/(Tốt)/(Đông)/(Đầy)", "Kênh đấu giá", "Kênh bang hội"). Party members must be on the same line (`IMPanel.isSameLine`, `IMPANEL_U[28]` "Vui lòng chuyển sang kênh {line}"). Recommended for M3: single line, hide the line button (inferred).

## 8. Proposed shared types (for `packages/shared/src/protocol.ts`; keep legacy names, typos included)

```ts
// --- Player target menu: no new RPCs except those below ---
export const ChatChannelLegacy = { LOCAL: 0, GLOBAL: 1, GUILD: 2, GROUP: 3, BATTLE: 4, AREA: 5, HEADLINE: 6, RUMOUR: 9 } as const; // DECIDE vs current ChatChannel
export interface WhisperPush { sourceId: number; sourceName: string; targetId: number; targetName: string; text: string; sourceIdType: 2; } // onWisper
// onP2pWisper(html: string, senderId: number, senderName: string, autoReply?: boolean)  positional
// RPC: say(id, type, channelId, text) ; wisper(id, type, targetName, text) ; p2pWisper(html, senderId, targetId)
export interface ChatPanelUser { id: number; name: string; iconCode: string; exp: number; classId: number; } // onCreateChatPanel (inferred)

// --- Group ---
export interface GroupNode { obj: number; next: GroupNode | null; }       // linked list, leader first
export interface GroupList { head: GroupNode; }                           // "mList"
export interface GroupMemberData extends PlayerData { vipT?: number; SpeT?: number; t?: number; }  // as map-player
export interface OnGroupJoined { groupCharactorList: GroupMemberData[]; groupAKFCidList: number[]; mList: GroupList; }
export interface OnGroupLeave { sid: number; name: string; mList: GroupList; }
export type OnGroupDismiss = GroupList;                                    // top-level { head }
export interface OnGroupGiveLeader { sid: number; oName: string; tid: number; nName: string; mList: GroupList; afkflag?: boolean; }
export interface OnGroupAfk { cid: number; mList: GroupList; }
export interface GroupInvitePush { pid: number; name: string; dis?: 'far'; } // onGroupInvited ; onGroupInviteSent {pid,name}; onGroupRequestSent {pid,name}
export interface GroupDenyPush { cid: number; name: string; }               // onGroupDeny / onGroupRequestDeny
export interface GroupRequestPush { id: number; name: string; exp: number; classId: number; } // onGroupRequest
export interface GroupFailPush { type: 0 | 1 | 2 | 3 | 4 | 5; pid?: number; name?: string; } // onGroupInviteFailed / onGroupRequestFailed
// onGroupCantJoin(cid: number, code: 10 | 20 | 30)  positional
export interface GroupMemberPosition { map: number; x: number; y: number; } // getGroupMemberPosistion reply

// --- Social ---
export interface Relationship { id: number; type: 1 | 2 | 3 | 4 | 5 | 6; name: string; otherId: number; selfId: number; num: number; data?: { exp: number; classId: number }; }
// onInitViewImC(Record<number, Relationship>) ; onAddRelationship(Relationship) ; onDelRelationship(id) ; onAddRelationByName(code, type) ; onSetClose(name, delta)
// RPC: initViewImC() ; addRelationByName(name, type) ; delRelationship(id)

// --- Trade ---
export interface TradeResult { flag: boolean; info?: string; }               // newTrade / tradeLock / tradeConfirm replies
export interface TradeLockArgs { money: number; gold: number; petIds: number[]; petId: number; items: Record<number, number>; }
export interface TradeTargetLock { money: number; gold: number; itemList: Record<number, { type: number; itemId: number; stackNum: number }>; petIds: number[]; }
// pushes: onRequestTrade(cid, name) ; onTargetLock(TradeTargetLock) ; onTargetConfirm() ; onStopTrade() ; onTradeSuccess() ; onTradeFail(msg)
// RPC: newTrade(cid) -> TradeResult ; tradeLock(TradeLockArgs) -> TradeResult ; tradeConfirm(passMd5: string) -> TradeResult ; stopTrade()
```

Ownership: `server/src/modules/group/` (service holds authoritative groups, follower position sync, battle roster), `.../social/` (relationships, whisper/p2p lookup), `.../trade/`, extend `chat/` for channels/whisper;
client: `client/src/ui/hud/` (group tile list, target menu), `client/src/ui/` (party panel, IM panel, trade panel, private chat window), `client/src/game/` (leader flag, follow chain via `Entity`).

## 9. Open questions (static analysis cannot settle)

1. Push names are inferred from handler methods; the dispatcher (`CallBack.as`) is a stub. Specifically unproven: `onCmdReady` -> `BattleStage.setReady`, `onSetTeamLeague` -> `setLeagueFlag`, whether `onGroupRequest` (Go) maps to `GroupPanel.onGroupRequest` or `Group.onGroupRequested`.
2. Push ORDER on group changes is not provable from the client (Go notes: joined -> giveLeader -> onCR). The client is order-tolerant except that `setGroupState` needs `mList.head` non-null, `groupCreateChars` must run before `setGroupState` (it is, inside `onGroupJoined`), and `unGroupAfk` waits up to 1.5 s for the leader view.
3. Is the whisper `sourceIdType` really sent by the server (must be 2)? `onWisper` does not set it; verify against Go. Also: server behaviour for offline whisper / p2p targets (no client error handler seen).
4. Rumour channel sends channelId 6 (client quirk) or 9? Cost: who consumes the Loa item, and is the free-window enforced server-side (client only tracks `_last_Time` in memory)?
5. `ChatPanelUtil` is missing: RPC name/args for opening a private chat window (`getChatPanel(cid)`?) and `createCP` payload are inferred.
6. Blacklist initial load: no client consumer for the login `black` array was found; the filter may only work after IM panel open (or via the stubbed CallBack).
7. Teammate `Charactor` not in scene at `onBattleStart`: `setBattleChar` has no null guard. Server/H5 must ensure all battle participants are in each participant's scene cache (or H5 client must tolerate it).
8. Trade: exact trigger of `onTradeSuccess` / `onTradeFail`, whether the target gets `onRequestTrade` only after `newTrade` replied `flag:true`, and `stopTrade` echo behaviour are inferred. Item/pet validation, tax, bound items and distance are server-only.
9. Go `sendCmdReadyToParticipants` sends each participant only their own position to themselves; the client semantic of `setReady(battleId)` is per creature. Check if H5 should send every teammate's position to all participants.
10. Pixel layout of TargetCanvas buttons is known (`TargetCanvas.as:69-195`: btn1 (19,57), btn2 (2.9,35), btn7 (8.85,10), btn5 (33.05,2), btn3 (57.05,10), btn4 (64.1,35), btn6 (45.9,57); btn8/btn9 above center y -30 40x19) but the skin classes `BtnTarget1..7` are Flex styles (asset not read).
