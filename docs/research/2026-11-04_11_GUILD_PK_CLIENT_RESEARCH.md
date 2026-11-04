# M6 Guild, PK and Rankings - Flash client research

Scope: guild core, guild buildings/skills/bank, map PK + PvP battle, rankings. All `.as` paths are relative to
`D:\mcgame\docs\client` unless stated. "Go-observed" = read from `D:\mcgame\internal\...` only to fill the hole left by the
empty `system/CallBack.as` stub (17 lines); those items are **inferred** from the client's point of view.
Existing H5 state (verified by grep): no guild/PK/rank RPCs in `server/src/modules/*`; `uif`, `PVPStartClient`, `rankGet`
absent; `ChatChannel.GUILD = 2` exists in `packages/shared/src/social.ts:11` (refused by the server).

## 1. Summary

Guild = one big panel (`GuildPanel.as`, 5628 lines, tabs 0..4: info / members / list+search / rank-permissions / applicant
list) plus small panels for donation, bank, building construction and guild-skill development. Almost all guild pushes
are handled by `public function on*` methods **inside `GuildPanel.as`** (the `CallBackGlobal.as` guild methods are empty
no-ops). PK is not a duel-invite system: it is "click a player in ACTION_PK mode -> `PVPStartClient(cid)`", gated
client-side only by the target's safe-area rectangle; the opt-in flag is the `apvp` interface setting sent with `uif`.
The `pkInvite/pkInviteResp/pkReady/pkAction/pkSurrender/pkLeave` RPCs asked about **do not exist** in the client.
Rankings are a single awaited RPC `rankGet(category)` in `ActivePanel.as`; `getRankList` is not an RPC.

## 2. Key files

| File | Role |
|---|---|
| `view/view/compDragable/GuildPanel.as` | Guild hub: info, members, list/search, ranks, applicants; all guild pushes `onXxx` |
| `view/view/compDragable/AddGuildPanel.as` | Create-guild dialog (`addGuild`), random name generator (TBL_NAME_LIB=80) |
| `view/view/compDragable/GuildContribPanel.as` | Donate silver/gold (`contribMoney`) and materials (`contribMaterial`) |
| `view/view/compDragable/GuildWarehousePanel.as` | Guild bank grid (4 pages x 30), `getInitGuildSlot` |
| `view/view/comp/Slot.as:1077-1082`, `view/view/compGameStage/StageMain.as:123-125,241-247` | `moveGuildItem`, `dropGuildItem` |
| `view/view/compGameStage/BuildingView.as`, `logic/GameScene.as:134-150`, `system/Core.as:915-940` | Guild building scene objects, click menu |
| `view/view/compDragable/ConstructionManager.as`, `view/view/comp/BuildSlot.as` | Pick a building to build/upgrade -> `constructBuild` |
| `view/view/compDragable/GuildBuildProcess.as` | In-progress building: requirements, `finishCreate/finishUpgrade/resetConstruction` |
| `view/view/compDragable/BuildInfoPanel.as`, `view/view/comp/TipBuilding.as` | Building info/tooltip (TBL_BUILDING props) |
| `view/view/compDragable/GuildSkillDevPanel.as`, `view/view/comp/GuildSkillDevSlot.as`, `TipDevSkill.as` | Leader-side guild skill development (`developSkill`) |
| `view/view/comp/SkillUseSlot.as:425-450,586-658`, `TipReqSkill.as:894-912` | Member-side guild skill learning (`addGuildSkill`, `improveGuildSkill`, `getGuildPrivateSkillData`) |
| `view/view/compDragable/CharactorInfoPanel.as:1860-1880,1436-1452` | `inviteToMyGuild`, PK value (`honor`), "[Wanted]" |
| `view/view/compGameStage/CharactorView.as:86-95,176-215,659-663` | ACTION_PK click -> `PVPStartClient`; red name colour |
| `view/view/compMain/MiniMapCanvas.as:762-764,1017-1021,1861-1869,2069-2072` | `apvp` toggle button (`uif`) |
| `view/view/compMain/SystemBarCanvas.as:919-922,1792-1809` | Second `btnPK`: enter ACTION_PK click mode |
| `view/view/compBattle/BattleStage.as:803-825,2863-2870` | `guest` flag -> mirrored slots |
| `view/view/compDragable/ActivePanel.as:2193-2212,3129-3156` | Rankings panel (`rankGet`, `getCoupleRank`, `getGuildWarRank`...) |
| `data/DataManager.as:309-315,495-544,780-791` | `gsList` guild-bank cache (`initGuildSlotData`, `addGuildSlot`, `updateGuildSlot`, `delGuildSlot`) |
| `system/CallBackGlobal.as:56-90,161-171` | Guild `on*` are empty stubs here (not the real handlers) |

## 3. Language strings (Vietnamese exact)

Language arrays are index-shifted in places (see agent memory); the values below were read at the cited lines.

| Constant | Value | Used by |
|---|---|---|
| `GAMEPREDEF_S[122..133]` (`GUILD_DEL..GUILD_UNVERIFIED`) `config/Language.as:2422-2433` | Xóa / Xin gia nhập / Cho gia nhập / Từ chối / Trục xuất / Rời bang / Thăng làm / Bang chủ / Xem thông tin / Online / Offline / Chưa xác nhận | member and applicant menus |
| `GAMEPREDEF_S[134..148]` `:2434-2448` | Tên bang: / Bang chủ hiện tại: / Chức vụ: / Chú thích: / Chú thích bang, tối đa 5 từ. / Bạn chưa vào bang! / Bạn đã gửi lời xin gia nhập bang, vui lòng chờ! / Bạn đã vào bang hoặc đã gửi lời xin vào bang, mỗi người chỉ có thể vào 1 bang! / Thông tin / (leader warning) / Bạn không phải bang chủ, không thể thay đổi thiết lập quyền hạn / Bạn không có quyền hạn thay đổi thông báo bang hội! / Quy tắc bang... / Bạn đã gửi lời xin gia nhập bang hoặc đã gia nhập bang, không thể tao bang nữa! / Tên bang bạn điền đã tồn tại, vui lòng điền lại! | GuildPanel, AddGuildPanel |
| `ADDGUILDPANEL_S[0..4]` `:851-855` | Chứa ký tự không hợp lệ, vui lòng điền lại! / Tên quá ngắn, vui lòng điền lại! / Tên quá dài, vui lòng điền lại! / Bạc không đủ, không thể tạo! / Xác nhận tạo Bang Hội:{addGuildText.text}? Bạn sẽ phải tốn 1000000 bạc! | `AddGuildPanel.as:331-351` ([4] is not referenced by code I read) |
| `GAMEPREDEF_S[146]` `:2446` / `GUILDPANEL_S[106]` `:1472` | "Điều kiện lập: Nhân vật cấp độ 50 trở lên và tốn 1000000 bạc." (text only, **no client check of level**) | create dialog help |
| `GUILDPANEL_S[2],[4],[6]` | Xác nhận cho phép {name} gia nhập? / Xác nhận cấp {item} cho {name}? / Xác nhận {item} {name}? | approve / demise / rank change |
| `GUILDPANEL_S[7..11]` | Bạn không có quyền hạn này! / Vui lòng không gửi lại! / Xác nhận gia nhập {name}? / Thành viên bang này đã đầy! / Bang chủ không thể rời khỏi bang! | gating messages |
| `GUILDPANEL_S[12],[13],[18]` | Điền thông báo bang hội:  / Đổi thông báo / Nhập tên Bang mới (giới hạn 5 ký tự) (code allows 2..10) | notice + rename |
| `GUILDPANEL_S[14]`, `[1]` | ☆Liên server☆ | free-rename marker in guild name |
| `GUILDPANEL_S[53..60],[109],[110]` | {name} nhận {num} điểm cống hiến / ...quyên góp / Bang hội nhận {num} kinh nghiệm bang / Bang hội nhận {num} tiền bang / mất... | system messages (consumers are in the stub callback, **inferred**) |
| `GUILDPANEL_S[65],[66],[67]`, `GUILDPANEL_U[24],[25]` | Bạn đã giải tán bang hội / Thao tác này chỉ có thể thực hiện ở kênh bang hội | `onDelGuild`; donate/bank menu on a non-guild line |
| `GUILDPANEL_S[102],[103],[104],[105]` | Bang đã đổi tên thành: {name}. / disband warning (skills kept, contribution -> 0) / Xác nhận trục xuất thành viên này? / leave warning | rename, disband, kick, quit |
| `GUILDPANEL_U[0..4]` | Thông báo / Làm mới / Tạo / Thoát / Giải tán | menu (`guildMenuHandler :4353`) |
| `GUILDPANEL_U[14]` | Chỉ có bang chủ mới có thể tiến hành thao tác này | leader-only gate (level-up, slots, member limit) |
| `GUILDPANEL_U[16..20]` | Quyên góp (Vui lòng chuyển kênh bang hội) / Kho bang / Thăng cấp số người / Thăng cấp kho bang / Thăng cấp bang | menu entries |
| `GUILDPANEL_U[21..23]`, `[39]`, `[42]` | Trung tâm xây dựng / Kỹ năng bang / Sổ tay bang / Rời khỏi / Hủy Bỏ (quit button label for applicants) | |
| `TIPBUILDING_U[0..4]` `:565-569` | Kinh nghiệm bang hội cần: / Tiền bang hội cần: / Vật liệu thường cần: / Vật liệu hiếm cần: / Phí duy tu hàng ngày: | `TipBuilding.as:615-619` |
| `GUILDBUILDPROCESS_U[0..11]` `:4321-4332` | Bạn không thuộc bang hội nào / Tiền vàng bang hội / Kinh nghiệm bang hội / Nguyên liệu thường bang hội / Vật liệu bang hội hiếm / Vật liệu bang hội đặc biệt / Xác nhận hủy xây? / ... / Xong / Bỏ / Đóng | `GuildBuildProcess.as` |
| `BUILD_S[0..7]` `:4271-4278` | Xây / Thăng cấp / Không có danh sách công trình có thể thăng cấp / Vui lòng chọn công trình / Xác nhận xây dựng? / Không có danh sách công trình có thể xây dựng / Yêu cầu thăng cấp: / Tiến độ công trình | `ConstructionManager.as` |
| `GUILDCONTRIBPANEL_U[0..8],[17..19]` `:4333-4352` | Số bạc quyên góp phải là bội số của 1000 / Vàng của bạn không đủ / Bạc của bạn không đủ / Xác nhận quyên góp? / Vui lòng kiểm tra vật liệu và số lượng / Không thể quyên góp nguyên liệu cấp 6 / Không thể quyên góp nguyên liệu cấp 3 trở xuống / Chỉ có thể quyên góp nguyên liệu và vật liệu bang hội đặc biệt / Bạn sẽ nhận được {num} điểm quyên góp / Bang hội sẽ nhận được {num} điểm tiền bang hội / Bang hội sẽ nhận được {item} số lượng {num} | donate panel |
| `GUILDWAREHOUSRPANEL_U[1]` `:4355` | Bang chủ có thể xóa nguyên liệu trong kho | bank help text (**no client gate**) |
| `GUILDSKILLDEVSLOT_U[0]` | Không thể mở kỹ năng mới | `GuildSkillDevSlot.as:1047` |
| `INVITEGUILD_S[0..2]` `:1382-1384` | Bạn không thuộc bang hội nào, không thể mời người khác. / Lỗi / Bạn đã gửi lời mời gia nhập bang hội đến cho {targetPlayer}. | `CharactorInfoPanel.as:1864-1876` |
| `CHARACTORINFOPANEL_U[11]` `:3404`, `_S[39..41]` `:1030-1032` | Cấp 30 trở lên mới có thể được mời vào bang / Không bang hội / PK: {honor} / Danh tiếng: {chival} | invite gate; info panel |
| `LINESELECTCANVAS_S[11]` `:2020` | Kênh bang hội | a *server line* flagged `guild` |
| `CHARACTORVIEW_S[0],[1]` `:2040-2041` | Mục tiêu trong khu vực an toàn, không thể PK / (Bảo hộ tấn công) | PK safe-area note; "protected" name suffix |
| `MINIMAPCANVAS_S[34],[35]` `:2155-2156` | Thiết lập hiện tại: Cho phép PK / Thiết lập hiện tại: Đóng PK | apvp toggle tooltip |
| `MINIMAPCANVAS_S[36]` `:2157` | Xác nhận mở dạng PVP? 1. Sau khi mở và ra khỏi thành, những người chơi khác có thể tùy ý tấn công bạn... 2. Nếu PVP thất bại sẽ bị tử vong, mất 20% độ bền trang bị. 3. PVP thất bại có thể dùng Hình Nhân để tránh hình phạt tử vong. | **defined but no code references it** (grep) |
| `GAMESCENE_S[0]` `:2254` | Đây là khu vực bắt buộc PVP, việc tắt mở PK không thể ngăn việc bị khiêu chiến. | on entering a map with `pk > 0` (`GameScene.as:282-285`) |
| `BATTLESTAGE_S[5..8]` `:739-742` | Nhận/Mất {expBattle} chiến tích; Nhận/Mất {rep} danh vọng | post-battle blue messages (PvP) |
| `BATTLESTAGE_S[1],[11],[12],[15],[16]` | death dialogs, Hình Nhân (item 721 `ItemConfig.as:78`, 18 vàng) | relive flow, shared with PvE |
| `MINIMAPCANVAS_S[37]` `:2158` | Xếp hạng chiến tích, cấp độ, tài sản, nhân khí, đấu trường và mục lục người yêu | ranking button tooltip |
| `ACTIVEPANEL_U[5..8],[42],[44..47],[54]` | Ch.tích / Cấp / Tài sản / Nhân khí / Đấu trường giác đấu / Người yêu / Thành tựu / Bang hội chiến / Kiếp nạn Vô Ưu / Ảo Cảnh Tầm Bảo | ranking tab labels (`bangBtn0..9`, `ActivePanel.as:1548-2163`) |
| `ACTIVEPANEL_S[18..26]` | Tên / Bang / Chiến tích / Cấp độ / Bạc / Tổng / Tháng / Tuần / Nhân khí | ranking column headers |

## 4. Flow

### 4.1 Guild core
1. Open `PANEL_GUILD` (340, `ViewManager.as:116`) -> `visible` setter (`GuildPanel.as:2237-2255`): first show -> `initView()`
   (`:5492`) = `remote.initViewGuildP()` (no args, no responder) ; later shows re-fetch the member list via
   `remote.call("getGuildMemberList", Responder(onGetGuildMember))` if > `UPDATE_GUILD_MEMBER_INTERVAL = 30000` ms since last (`:131`, `:2243-2248`).
2. Push `onInitViewGuildP` (`:4021-4065`) is the snapshot. Self membership is found by `memberList[*].cid == player.id`; if absent the panel
   shows "no guild" (`updateGuildInfoView :4733`). Sets `_core.player.guild = myGuild`, `_core.player.gData = selfGuildMemberData`.
3. List tab (2) -> `showGuildList()` (`:1998`) = `remote.initGuildList()` once (cached in `guildList`) -> push `onInitGuildList` (`:1861`).
   Pagination 11/page (`PAGE_MAX_ITEM_NUM :81`); search is purely client-side over the cached list (`searchGuild :4600`: by name substring or by id equality).
4. Create: tab/menu -> `AddGuildPanel` -> `addGuild` (`AddGuildPanel.as:325-382`) after the Alert; then `visible=false`. Result arrives as
   `onAddGuildMember` for self (`cid == player.id`) -> `joinGuildFlag = 0; initView()` (`GuildPanel.as:2188-2194`) and as broadcast `onAddGuild` for everyone
   (`:4103-4110`, `guildList[id] = obj`). (Creator becomes member; **inferred** that server sends both, from Go `membership.go:91-140`.)
5. Apply: list double-click menu "Xin gia nhập" -> `joinGuild(gid)` (`:2210`): blocked if `joinGuildFlag==1` ("Vui lòng không gửi lại!") or already has `selfGuildMemberData`
   (`GUILD_ONLYONE`); Alert -> `remote.addGuildMember({gid})` (`:2286-2296`). Applicant row has `rank == -1`.
6. Approver (rank with `canAdd==1`; tab 4 only visible then, `organizeTabVisibility :5262`): applicant menu -> "Cho gia nhập" -> Alert -> `remote.confirmGuildApply({tableId, newData:6, updateType:"rank"})`
   (`:4681-4690`, `:3080-3086`); "Từ chối" -> `remote.refuseGuildMember(tableId)` (`:4693-4696`, `:5351`).
7. Kick (member menu, needs `myRank.canDel==1`, target not leader / not applicant): Alert -> `remote.kickGuildMember(tableId)` (`:3829-3839`, `:5193-5196`).
8. Appoint: member menu "Thăng làm <rankName>" (needs `myRank.canDuty==1`, target rank not -1/1) -> Alert -> `remote.updateGuildMember({tableId, newData:rank, updateType:"rank"})` (`:5206-5217`, `:5533`).
   Push `onUpdateGuildMember` (`:5430`).
9. Demise: leader-only menu "Bang chủ" (requires `selfGuildMemberData.rank==1 && player.id == myGuild.cid`) -> Alert -> `remote.demiseTo(newLeaderId)` where `newLeaderId = memberGrid.selectedItem.id` = target **cid** (`:5199-5202`, `:3851-3857`). Push `onDemise` (`:5356`).
10. Quit: `quitGuild()` (`:4179`): leader refused client-side (`GUILDPANEL_S[11]`); applicant (rank -1) sends immediately (no Alert); else Alert -> `remote.quitGuild(selfGuildMemberData.id)` (member **table id**, not cid).
11. Disband: leader button / menu -> Alert (`GUILDPANEL_S[103]`) -> `remote.delGuild()` (`:3954-3973`). Broadcast `onDelGuild(gid)` (`:2690`).
12. Notice: `InputPanel` -> `remote.updateGuildNotice(selfGuildMemberData.gid, text)` (`:2771-2777`); edit button enabled only when `myRank.canInfo==1` (`:1672`). Shown as `Language.GUILDPANEL_S[0] + myGuild.guildInfo` (html "Thông báo: <br>").
13. Rename: button visible only to leader when name contains `☆Liên server☆` or `☆` (`:4497-4503`); client checks `haveSpecialStr || haveBadWord`, length 2..10, not in cached `guildList` -> `remote.changeGuildName(name)` (`:4991-5047`). Push `onChangeGuildName(newName:string)` (`:4918`) broadcast.
14. Ranks/permissions (tab 3): leader edits checkboxes `canAdd/canQuest/canSlot/canInfo/canDel/canDuty` for ranks 2..5 + custom names for ranks 1..6; confirm -> `remote.updateGuildRank(obj)` (`:5569-5613`). Push `onUpdateGuildRank(gid, obj)` (`:1747`).
15. Leader-only upgrades (client gate `checkIfLeader()` = `selfGuildMemberData.rank == 1`, else `GUILDPANEL_U[14]`): `call("guildLevelUp", null, myGuild.id)` (`:2727`), `call("addMaxGuildMemberNum", null, myGuild.id)` (`:4873`), `call("addGuildBankSlotNum", null, myGuild.id)` (`:2020`). Results arrive as `onUpdateGuildProperty({key:value...})` (`:1798`, merges into `myGuild`) and `onUpdateNumProp` (exp/money deltas).
16. Donation/bank menu entries are refused unless `_core.lineInfo.guild == 1` ("Kênh bang hội" line, `:4385-4408`). Guild NPCs (`NPC_TYPE_GUILD=17`) are not even created when `lineInfo.guild` is falsy (`Core.as:474-477`).
17. Invite someone: `CharactorInfoPanel` button `BtnInviteGuild` -> needs own guild, target level >= 30 (read from the info panel label) -> `remote.inviteToMyGuild(targetCid)` (`:1860-1880`). The client has **no** receiving side for invites (no handler found; it lives in the stub CallBack) -> open question.
18. Guild chat: channel button index 2 (`BtnChatGH`, `SystemBarCanvas.as:667-670`) -> `player.say(text, 2)` -> `remote.say(id, type, 2, text)` (`object/Creature.as:404-409`). No client check of guild membership; the server must refuse/route.
19. Guild name/title above players: **not implemented in this client**. `CharactorView._textGuild` is declared (`CharactorView.as:34`) but never assigned or read (grep). Scene payloads therefore carry no guild key the client uses. Names are coloured by PK (4.4) and titled by `t` (TBL_TITLE).

### 4.2 Bank (kho bang), buildings, skills
- Bank: `GuildWarehousePanel.initView` (`:4679-4690`) `call("getInitGuildSlot", Responder(setSlot))` -> `DataManager.initGuildSlotData(map)` (`DataManager.as:309-315`) sets `gsList`, `gsInited`. Visible slots = `sid` in `(500, SLOT_SID_GUILD_BANK[bagSlotNum]]` with `SLOT_SID_GUILD_BANK = [500,530,560,590,620]` (`GamePredef.as:1166`); `bagSlotNum` 1..4 pages of 30, tabs enabled by `player.guild.bagSlotNum` (`GuildWarehousePanel.as:4331-4380`).
  Deposit path is only `contribMaterial`; `Slot.as:1077-1082` accepts a guild-slot-to-guild-slot drop only (`moveGuildItem(fromSid, toSid)`), and `SLOT_GUILD` appears nowhere else in `Slot.as` (grep), so the client has **no withdraw path**. Drop onto the stage -> Alert `STAGEMAIN_S[0]` "Xác nhận hủy vật phẩm này?" -> `dropGuildItem(slotData.id)`.
  Bank updates ride `DataManager.addGuildSlot/updateGuildSlot/delGuildSlot` called from the stubbed CallBack (names **unknown**; Go sends `onAddCharactorSlot/onDelCharactorSlot/onUpdatePerNumProp` in `contrib_material.go:106-111`, Go-observed).
- Donate silver/gold (`GuildContribPanel.contributeMoney :696-749`): requires `_core.delPass` (else prompts safe-lock password -> `call("unlockMoney", null, MD5.hash(pass))`), silver must be a multiple of 1000, gold/silver sufficiency checked locally, Alert -> `contribMoney({g: gold, s: silver})`. Preview formulas: contribution = silver/8 + gold*2000/8; guild money += silver + gold*2000 (`:965-1076`, `:1114-1130`).
- Donate material: drag a material onto the slot; item `color < 2` refused (`GUILDCONTRIBPANEL_U[7]`), non-material/non-2039 refused (`[8]`); `call("contribMaterial", Responder(fn), {num, slotId})`, reply `Number != 0` -> refresh slot (`:490-497`, `:1035-1061`). Preview: type by `tid` group COMMON {16,7,18,22,25,27} / RARE {24,21,23,26,28} / SPE 2039 (`:845-866`); common: guild material `floor(n*color^5/8)`, contrib `floor(n*color^5*50/8)`; rare: x100/8; special (2039): contrib `n*100`, guild gets `n` (`:1116-1150`). Guild material item ids `GUILD_GENERAL_M=2026, RARE_M=2027, SPE_M=2039` (`GamePredef.as:1768-1770`).
- Buildings: on scene load `remote.createGuildBuildings()` (`GameScene.as:278`, `Player.as:479`, no args) -> `GameScene.sceneCreateGuildBuildings(list)` (`:134-150`) -> `Core.createBuild(obj)` (`:915-940`) merges TBL_BUILDING template `tid` with `{posX,posY,posDir,tid,id,layer,buildState,buildType?}`. `type 1/2` go to layer B, others (3 = empty plot "Đất trống") to layer E.
  Click -> `BuildingView.clickBuilding()` = `remote.clickBuild(buildingId, buildingType)` (`:133-136`) -> the reply is a list of `{name, func, bid}` (numeric keys) shown by `BuildingView.onClick(list)` -> `showMenu` (`:39-74`); a menu click -> `remote.execBuildFunc(func, bid, buildingType)` (`:138-144`). TBL_BUILDING `funcScript`s define `extInfo` (empty plot), `showGuildSkillPanel` (Học viện), `showGuildWarehouse` + `showDonatePanel` (Kho) (`TBL_BUILDING.json` ids 1,4,5). The client-side receivers of the resulting pushes (`onShowExtInfo`, `onShowGuildSkillPanel`, `onShowGuildWarehouse`, `onShowDonatePanel`, `onList`) are in the stubbed CallBack: names are **Go-observed** (`build_rpc.go:36,88-113`), payloads **inferred**.
  `ConstructionManager.showNewBuild(plot)` lists `TBL_BUILDING` rows of `buildType` with `level==1`; `showUpgradeBuild(b)` lists `postBuilding` ids or the next `level` of the same `codeName` (`:333-411`). Confirm -> `BuildSlot.handler` -> `remote.constructBuild(plotOrBuildingId, selectedTemplateId, mode, player.posMapId)` with mode `CREATE_BUILD=2` when the current object's template `type == TYPE_EXTEND_BUILD(3)`, `UPGRADE_BUILD=1` when `type == TYPE_GUILD_BUILD(1)` (`BuildSlot.as:74-104`, `GamePredef.as:1744-1747`).
  Construction in progress: building `tid == IN_BUILDING (10)` or `buildState` = target template id; `GuildBuildProcess.showBuild` (`:566-584`) shows requirement lines and enables "Xong" only if guild `money >= moneyCost`, `exp >= expCost`, bank item 2026 >= `genMCost`, 2027 >= `rareMCost`, 2039 >= `spMCost` (`:480-495`; counts via `Core.getGuildItemNum :614` over `gsList`). "Xong" -> `finishCreate(id)` if `tid == 10` else `finishUpgrade(id)`; "Bỏ" -> Alert -> `call("resetConstruction", null, id)` (`:355-366`, `:471-478`). Pushes after these (Go-observed): `onCreateBuild`, `onCancelUpgrade`, `onCreateGuildBuildings`.
- Skills, leader side: `GuildSkillDevPanel.showGuildSkillView({gid, skillDevData})` (`:261-316`, called by the stub push `onShowGuildSkillPanel`, **inferred**) lists `TBL_SKILL` rows with `useEnv == 4` and `level == 1` (`gameDataIndex3[TBL_SKILL][4]`, `:318-331`). Button "Mở" -> `call("developSkill", null, {gid, sid: nextLevelSkillTemplateId})` (`GuildSkillDevSlot.as:1042-1055`), max level 10 (`:561-567`). Costs displayed from TBL_SKILL `guildDevExp`, `guildDevMoney` and guild level >= level+1 (`TipDevSkill.as:161-181`).
- Skills, member side: `SkillUseSlot` (`useEnv==4`): requires `_core.player.guild != null`; if `GuildPanel.skillDevData == null` -> `getGuildPrivateSkillData(fn)` = `call("getGuildPrivateSkillData", Responder(fn))`, reply = map `{skillTemplateId: level}` stored as `skillDevData` (`SkillUseSlot.as:595-658`, `GuildPanel.as:5326`). Learn: `call("addGuildSkill", null, skillId)` (first level) or `call("improveGuildSkill", Responder(onSkillLearnByClient), nextSkillId)` (`SkillUseSlot.as:437-447`). Requirements shown in `TipReqSkill.as:894-912`: `gData.normalContrib + gData.donateContrib >= costGuildContrib`; `guild.level >= skillLevel+1`; plus the usual player level / skill exp / price / class gates.

### 4.3 PK / PvP
1. Map toggle: `MiniMapCanvas.btnPK` (apvp) -> `changePKState()` flips `btnPK.selected` then `core.updateSettingNow("apvp", !btnPK.selected)` (`:2069-2072`, also `:762-765`). `updateSettingNow` (`Core.as:347-358`) updates `GLOBAL_SETTING` locally and sends `remote.call("uif", null, "apvp", bool, false)` (fire-and-forget, 3 args: key, value, petFlag). Button state on init: `selected = !GLOBAL_SETTING.apvp` (`:1017-1021, :1223`), i.e. **selected == PK closed**. Tooltips: selected -> "Đóng PK", else "Cho phép PK" (`:1861-1869`). `enablePK()/disablePK()` exist (`:1017,:1095`) but have no callers in the decompile (called from the stub CallBack, **inferred**: e.g. forced-PvP maps).
2. Attack mode: second `btnPK` in `SystemBarCanvas` -> `selectTarget(e, ACTION_PK=40)` (`:919-922, :1792-1809`): refused in battle (`state == ST_BATTLE`) and for a non-leader party member (`NPCVIEW_S[0]` "Đã ở trong nhóm thì cần nghe lời nhóm trưởng!"); else `view.showSelect(); view.actionState = 40`.
3. Click a character view (`CreatureView.as:7539-7541` -> `CharactorView.actionOnCreature :176-215`): safe-area test `AreaUtil.getRectArea(TBL_MAP[target.posMapId].sArea, posX, posY)` on the clicked view; inside -> midnote `CHARACTORVIEW_S[0]`, no RPC. Otherwise `remote.PVPStartClient(targetCid)` (single arg, **never a `force` arg**; one call site) or, when `core.battleServer.inBattleServer` (cross-server battle), `remote.assassinate(cid)`. No client check of target `apvp`, level, party, own `apvp` (the Go note about a `force=true` retry is not in this client).
4. `TargetCanvas.update` hides the radial target menu while `actionState == ACTION_PK` (`TargetCanvas.as:448`).
5. Entering a map with `TBL_MAP.pk > 0`: sysMidNote + sysMsg `GAMESCENE_S[0]` (`GameScene.as:282-285`; TBL_MAP.md cites `Player.as:282`, wrong file). `pk` = -1 none / 1 light / 2 full is not distinguished by the client. `safeFlag > 0` -> `Player.mapSafe` (`Player.as:1665`), used for encounter checks only (`PlayerView.as:101,135`), not for PK.
6. Battle: **no battle-type field is consumed** by the client. Visuals come from `onBattleStart.guest` (`BattleStage.as:2863-2870`): `guest == true` -> `setGuestGroupPos()` swaps slots 0-9 <-> 10-19 (`:803-825`) and flips direction (`:3030`); `guest == false` -> `setHostGroupPos()`. Command UI is the PvE one: each client sends `battleUpdateCmd([...])` for its own characters/pets; `Battle.battleGetGroupPlayerList` (`logic/Battle.as:805-818`) collects own-side characters (`!leftSide`) not dead. Turn timer `TIME_MAX = 25` s is a client constant for all battles (`TimeCountCanvas.as:51`), so "30 s for PvE" is purely server-side.
   Slots: host layout is 0-9 / 10-19; the previous combat research (`docs/research/2026-11-04_03_COMBAT_CLIENT_RESEARCH.md` s4) documents payload and animation; PvP only adds `guest` and putting a *player* on the opposite side (`gameObject.type == TBL_CHARACTOR`).
7. Result/penalty (client view): post-battle `showResult()` prints blue messages `Nhận/Mất {expBattle} chiến tích` and `Nhận/Mất {rep} danh vọng` (`BattleStage.as:2441-2474`; `expBattle` / `rep` are set by stubbed pushes, **unknown** source). Death flow (relive dialogs, Hình Nhân item 721, `reliveSwitch`, `freeRelive(1|2)`, `toSafe`, `bbGoldRelive`) is shared with PvE (`BattleStage.as:1594, 1985-2080`). Penalty text (lose = death, 20% equipment durability, Hình Nhân avoids it) exists only in the unused `MINIMAPCANVAS_S[36]` and in the Go notes.
8. PK value = `honor`: `CharactorView.setName` (`:82-95`): `honor <= 0` -> yellow `0xFFFF00`, `honor > 0` -> `setRedName(honor)` = `0xFF8800 - nameColor*honor`, `nameColor = (0xFF8800-0xFF0000)/200` (as `uint` = 174, `:45`), i.e. orange darkening towards red over honor 0..200 (**inferred** cap; no clamp in code). `CharactorInfoPanel` shows "PK: {honor}" (`max(honor,0)`) and a red "[Wanted]" label when `honor < 0` (`:1436-1452`, label `:943-956`). `setNameProtected(bool)` appends `(Bảo hộ tấn công)` and colours the name green `0xFF00` (`CharactorView.as:222-239`) but has no caller in the decompile (push from stub).
9. Different features, not part of M6 duel PK: `PVPRoomListPanel/PVPGroupPanel/PVPResultPanel/PVPShadePanel` (room-based group PvP: `initPVPRoom, createPVPRoom, addPVPGroup, quickEnterRoom, readyOrStartPVP, leavePVPRoom, leftPVPGroup, PVPKickByLeader, updatePVPGroupLimit, updatePVPGroupPass, sureInvite, getLastPVPRank`), `CrossBattleRank` (`getCrossBattleRank`, `assassinate`), `PKGamePanel` (no RPCs found). Also `GAMEPREDEF CURRENCY_GROUPPVP_MEDAL=7`.

### 4.4 Rankings
- Entry: `MiniMapCanvas.btnRank` (tooltip `MINIMAPCANVAS_S[37]`, `:1432-1436`) -> `__btnRank_click` -> `_vm.changeVisible(PANEL_ACTIVE)` (`:1753-1756`). `ActivePanel.init()` -> `getInfo("expBattle")` (`:2168-2171`); each tab canvas `show` event calls `getInfo(category)` once (`flag[category]` cache, `:2193-2212`).
- RPC: `remote.call("rankGet", Responder(onInfo), category:string)`; special tabs use `getCoupleRank(page)` (`:2199, :2604`), `getGuildWarRank(null)` (`:2205`), `getNineBossRankByClient(...)` (`:2829`), and `lastWeekBp`/`totalBp` share `rankGet`.
- `onInfo(reply)` (`:3129-3156`): reply `{name:string, data:[ {id, name, guild, value} ]}`; sets `flag[name]=true`, special-cases `name == "level"` (value `exp` -> `expToLevel`) and `name == "treasureHunt"` (`time` ms -> `h:m:s`), then binds `this[name + "Grid"].dataProvider = data`. Grids that exist: `expBattleGrid, expGrid, moneyGrid, popGrid, popMonthGrid, popWeekGrid, marriageGrid, totalBpGrid, lastWeekBpGrid, achPointGrid, guildWarGrid, bossLocalGrid, bossAllGrid, treasureHuntGrid` (`ActivePanel.as` descriptors). There is **no `levelGrid`**, so `getInfo("exp")` must return `name:"exp"` and the `level` branch is dead code -> the Cấp tab shows `value` raw unless the server already converts (**open question**).
- Categories requested via `rankGet` (from `getInfo` call sites): `expBattle` (Ch.tích), `exp` (Cấp), `money` (Tài sản), `pop` (Nhân khí total), `popMonth`, `popWeek`, `totalBp`, `lastWeekBp` (Đấu trường giác đấu), `achPoint` (Thành tựu), `treasureHunt` (Ảo Cảnh Tầm Bảo). Tab-index -> canvas mapping is **inferred** from `bangBtn0..9` label order.
- Row interaction: double-click -> menu (whisper, p2p whisper, info, invite team, trade...) built from `row.id`/`row.name` (`:2523-2560`), so rows need the character id.
- `getRankList` is a local method of `CrossBattleRank.as:552` (it calls `getCrossBattleRank`), not an RPC. Go registers `getRankList`/`rankGet` (`handlers/ranking/handler.go:22-24`); only `rankGet` is real.

## 5. Contract

Style: "FF" = fire-and-forget (`remote.foo(...)`), "Resp" = `remote.call("foo", Responder, ...)`, "call-null" = `remote.call("foo", null, ...)` (reply ignored). Args are positional.

### 5.1 RPCs (client -> server)

| Name | Args (order, type) | Style | Result / push | Source |
|---|---|---|---|---|
| `initViewGuildP` | none | FF | push `onInitViewGuildP` | `GuildPanel.as:5499` |
| `initGuildList` | none | FF | push `onInitGuildList` | `:2002` |
| `getGuildMemberList` | none | Resp | reply = member map (`onGetGuildMember`) | `:2246` |
| `addGuild` | `{name:string}` | FF | `onAddGuildMember` (self) + broadcast `onAddGuild` (inferred) | `AddGuildPanel.as:375` |
| `addGuildMember` | `{gid:int}` | FF | `onAddGuildMember` (applicant, rank -1) | `GuildPanel.as:2294` |
| `confirmGuildApply` | `{tableId:int, newData:6, updateType:"rank"}` | FF | `onConfirmGuildApply` | `:3084` |
| `refuseGuildMember` | `tableId:int` | FF | `onDelGuildMember {type:3}` | `:5353` |
| `kickGuildMember` | `tableId:int` | FF | `onDelGuildMember` | `:3835` |
| `quitGuild` | `tableId:int` (own member row id) | FF | `onDelGuildMember` (`type 4` = applicant gave up, inferred) | `:4197` |
| `updateGuildMember` | `{tableId:int, newData:int(2..6), updateType:"rank"}` | FF | `onUpdateGuildMember` | `:5537,5541` |
| `demiseTo` | `newLeaderCid:int` | FF | `onDemise` | `:3855` |
| `delGuild` | none | FF | broadcast `onDelGuild(gid)` | `:3961` |
| `updateGuildNotice` | `gid:int, text:string` | FF | `onUpdateGuildProperty {guildInfo}` (inferred key) | `:2775` |
| `changeGuildName` | `name:string` | FF | broadcast `onChangeGuildName(name)` | `:5041` |
| `updateGuildRank` | `{canAdd{2..5}, canQuest{2..5}, canSlot{2..5}, canInfo{2..5}, canDel{2..5}, canDuty{2..5}: 0/1, rankId{1..6}:int, name{1..6}:string}` | FF | `onUpdateGuildRank(gid,obj)` | `:5569-5602` |
| `guildLevelUp` / `addMaxGuildMemberNum` / `addGuildBankSlotNum` | `gid:int` | call-null | `onUpdateGuildProperty`, `onUpdateNumProp` | `:2727, :4873, :2020` |
| `inviteToMyGuild` | `targetCid:int` | FF | invite prompt to target (stub, unknown) | `CharactorInfoPanel.as:1878` |
| `getInitGuildSlot` | none | Resp | reply = `gsList` map | `GuildWarehousePanel.as:4689` |
| `moveGuildItem` | `fromSid:int, toSid:int` | FF | bank slot pushes (unknown names) | `Slot.as:1080` |
| `dropGuildItem` | `itemInstanceId:int` | FF | `delGuildSlot` | `StageMain.as:245` |
| `contribMoney` | `{g:int gold, s:int silver}` (s % 1000 == 0) | FF | `onUpdateNumProp` x2 | `GuildContribPanel.as:727` |
| `contribMaterial` | `{num:int, slotId:int}` | Resp | reply Number; non-zero -> slot refresh | `:1052` |
| `unlockMoney` | `md5(password):string` | call-null | sets `core.delPass` (stub push) | `:705` |
| `createGuildBuildings` | none | FF | list of building objects (`sceneCreateGuildBuildings`) | `GameScene.as:278` |
| `clickBuild` | `buildId:int, buildType:int` | FF | menu list `[{name,func,bid}]` to `BuildingView.onClick` (inferred) | `BuildingView.as:135` |
| `execBuildFunc` | `func:string, bid:int, buildType:int` | FF | `onShow*` pushes (Go-observed names) | `:142` |
| `constructBuild` | `buildId:int, templateId:int, mode:int(1 upgrade/2 create), mapId:int` | FF | build update pushes (Go: `onCreateBuild`) | `BuildSlot.as:93,99` |
| `finishCreate` / `finishUpgrade` | `buildId:int` | FF | build update | `GuildBuildProcess.as:359,363` |
| `resetConstruction` | `buildId:int` | call-null | Go: `onCancelUpgrade` | `:475` |
| `developSkill` | `{gid:int, sid:int}` | call-null | updated `skillDevData` / panel refresh (unknown) | `GuildSkillDevSlot.as:1050` |
| `getGuildPrivateSkillData` | none | Resp | reply = `{skillTemplateId: level}` | `GuildPanel.as:5328` |
| `addGuildSkill` | `skillId:int` | call-null | `onSkillLearnByClient`-style update (unknown) | `SkillUseSlot.as:441` |
| `improveGuildSkill` | `nextSkillId:int` | Resp (`onSkillLearnByClient`) | reply as skillLearnByClient | `:446` |
| `uif` | `key:string, value:any, petFlag:bool` | call-null | none | `Core.as:357` |
| `PVPStartClient` | `targetCid:int` | FF | `onSetCharState{5}` + `onBattleStart` to both (Go-observed, per `pvp-apvp.md`) | `CharactorView.as:207` |
| `assassinate` | `targetCid:int` | FF | cross-server only | `:203`, `CrossBattleRank.as:302` |
| `rankGet` | `category:string` | Resp | `{name, data:[{id,name,guild,value}]}` | `ActivePanel.as:2209` |
| `getCoupleRank` / `getGuildWarRank` | `page:int` / `null` | Resp | other panels | `:2199,2205` |
| `say` (channel 2) | `id, type, 2, text` | FF | `onSay` | `Creature.as:408` |

### 5.2 Pushes consumed (server -> client), payloads read from consumers

| Push | Payload (positional) | Effect | Source |
|---|---|---|---|
| `onInitViewGuildP` | `{myGuild, memberList, guildRank, applyList, skillDevData}` | full reset of panel state; `quitG.label` = "Hủy Bỏ" if own rank -1 else "Rời khỏi" | `GuildPanel.as:4021` |
| `onInitGuildList` | map `gid -> {id,name,ln,cid,memberNumber}` | list tab | `:1861`, rows `:4715-4731` |
| `onGetGuildMember` (reply) | map `memberTableId -> member` | member tab | `:4283` |
| `onAddGuild` | guild list entry | `guildList[id]=obj` | `:4103` |
| `onUpdateGuild` | `gid:int, key:string, value:string` | patch list entry; `key=="name"` also renames own guild | `:2402` |
| `onUpdateGuildInfo` | full guild object `{..., updateType}`; `updateType==2` -> refresh bank view | replaces `myGuild`, `player.guild` | `:1976` |
| `onUpdateGuildProperty` | `{key:value...}` | merge into `myGuild` (level, memLimit, bagSlotNum, guildInfo...) | `:1798` |
| `onUpdateNumProp` | `{type:1 donate|2 normal|3 guild money|4 guild exp, num:delta, cid}` | `GamePredef.as:1763-1766`; contribution deltas only applied if `cid == self` | `:4876` |
| `onAddGuildMember` | member `{id, cid, gid, rank, note, status, ...}` | self: `initView()`; same guild: `memberList[id]=m; applyList.push(m)` | `:2188` |
| `onConfirmGuildApply` | `{gid, tableId}` | `memberNumber+1`, `rank=6`, drop from applyList; self -> `initView()` | `:2930` |
| `onDelGuildMember` | `{gid, id(tableId), type}` (3 refuse, 4 give up -> no count change) | self -> `player.guild=null`, bank reset, `initView()`; else delete from lists | `:4541` |
| `onUpdateGuildMember` | `{tableId, updateType, newData}` | patch row; own rank change -> `myRank` | `:5430` |
| `onUpdateGuildRank` | `gid:int, {name1..6, can*2..6}` | refresh permission rows | `:1747` |
| `onAddGuildRank` | rank row `{id, rank, name, canAdd, canQuest, canSlot, canInfo, canDel, canDuty}` | `addNewData(TBL_GUILD_RANK)` | `:3949` |
| `onDemise` | `{gid, newCid, oldCid, ln}` | old leader -> rank 6, new -> rank 1, `myGuild.cid/ln` | `:5356` |
| `onChangeGuildName` | `name:string` | rename + sysMsg `GUILDPANEL_S[102]` | `:4918` |
| `onDelGuild` | `gid:int` | remove from list; own guild -> Alert `GUILDPANEL_U[24]`, clear state | `:2690` |

Member object keys read: `id` (table id), `cid`, `gid`, `rank` (-1 applicant, 1 leader, 2..5 officers, 6 member), `status` (truthy = online),
`note` = `"name|classId|exp"` (pipe string; level = `expToLevel(exp)`, class from TBL_CLASS), `normalContrib`, `donateContrib` (`GuildPanel.as:2027-2100`).
Guild object keys read: `id, name, cid (leader char id), ln (leader name), level, exp, money, guildInfo (notice), bagSlotNum, memLimit, memberNumber` (`:1680-1713`, `:4635-4641`, `GuildWarehousePanel.as:4331`).
Rank row: leader row (rank 1) is never edited via the checkboxes (`guildSetting :4146` handles 2..5), but `myRank.canInfo/canAdd/canDel/canDuty == 1` is evaluated for the leader too, so the rank-1 row must carry all flags = 1 (**inferred**).
Bank row `gsList[id]`: `{id, sid, type, itemId, stackNum}` (`GuildWarehousePanel.as:4331-4345`, `Core.as:629-640`).

## 6. Proposed shared types (`packages/shared/src/guild.ts`, re-export from `index.ts`)

```ts
export const GuildRank = { APPLICANT: -1, LEADER: 1, MEMBER: 6 } as const; // 2..5 = configurable officer ranks
export interface GuildRankRow {
  id: number; rank: number; name: string;
  canAdd: 0 | 1; canQuest: 0 | 1; canSlot: 0 | 1; canInfo: 0 | 1; canDel: 0 | 1; canDuty: 0 | 1;
}
export interface GuildMember {
  id: number;            // member table id (quitGuild/kick/refuse/updateGuildMember use this)
  cid: number; gid: number; rank: number;
  status: boolean;       // online
  note: string;          // "name|classId|exp"
  normalContrib: number; donateContrib: number;
}
export interface GuildInfo {
  id: number; name: string; cid: number; ln: string; level: number; exp: number; money: number;
  guildInfo: string; bagSlotNum: number; memLimit: number; memberNumber?: number;
}
export interface GuildListEntry { id: number; name: string; ln: string; cid: number; memberNumber: number }
export interface InitViewGuildP {
  myGuild: GuildInfo; memberList: Record<string, GuildMember>; guildRank: GuildRankRow[];
  applyList: GuildMember[]; skillDevData: Record<string, number>;
}
export interface UpdateNumProp { type: 1 | 2 | 3 | 4; num: number; cid: number }
export interface DemisePush { gid: number; newCid: number; oldCid: number; ln: string }
export interface DelGuildMemberPush { gid: number; id: number; type?: number }
export interface UpdateGuildMemberPush { tableId: number; updateType: 'rank'; newData: number }
export interface GuildSlot { id: number; sid: number; type: number; itemId: number; stackNum: number }
export interface BuildingObj { id: number; tid: number; posX: number; posY: number; posDir: number; layer: number; buildState: number; buildType?: number }
export interface BuildMenuItem { name: string; func: string; bid: number }
export interface RankRow { id: number; name: string; guild: string; value: number }
export interface RankGetReply { name: string; data: RankRow[] }
```
Ownership: server `server/src/modules/guild/` (`guild.rpc.ts`, `guild-bank.service.ts`, `guild-build.service.ts`, `guild.schema.ts`), `server/src/modules/pk/` (`pk.rpc.ts`: `PVPStartClient`; `uif` belongs to character/settings), `server/src/modules/ranking/` (`rankGet`). Client: `client/src/ui/guild/*` (panel, create, contrib, bank), `client/src/ui/ranking.ts`, `client/src/game/` (building sprites, click mode ACTION_PK, red name). PK reuses the existing `BattleManager` with `guest` flag and a second human side.

## 7. Open questions

1. **Receivers of guild-adjacent pushes** that live in the stubbed `CallBack.as`: building menu (`onList`?), `onShow*`, bank slot pushes, `inviteToMyGuild` prompt/response, `onSkillLearnByClient`-like for `developSkill/addGuildSkill`, `enablePK/disablePK` triggers, `setNameProtected` triggers. Names above are Go-observed only.
2. Whether `onUpdateGuildInfo` or `onUpdateGuildProperty` carries guild changes after `guildLevelUp` etc. (both consumers exist).
3. `quitGuild` arg is the member table id while `demiseTo` arg is a cid; confirmed from the code, but the Go handler should be checked for the same convention.
4. `onAddGuildMember` pushes into `applyList` unconditionally for non-self members (`:2202`), even if a leader/approver is not the audience; the server should send it only to members with `canAdd` (or the client shows a stale applicants list when `canAdd` is false: it is only rendered when `canAdd == 1`, `:2502`).
5. `rankGet("exp")` reply `name` (see 4.4): `"exp"` vs `"level"`; value as raw exp or level. Also the page size / count: client binds whatever arrives (Go returns top 10).
6. `honor` semantics: positive = red-name PK points, negative = wanted. Rules for gaining/losing it, and battle `expBattle`/`rep` deltas, are server-only (not visible in client).
7. Guild line (`lineInfo.guild`): donate/bank/NPCs require a dedicated "Kênh bang hội" server line. H5 has a single line; decide to emit `lineInfo.guild == 1` for the only line (so the menus work) - **design decision**, not provable from the client.
8. PvP battle: ordering `onSetCharState{5}` -> `onBattleStart` for both players, and the `guest` assignment, is only documented in Go notes (`pvp-apvp.md`); the client only needs `guest` and both sides' `cList`.
9. Create-guild level 50 and silver 1,000,000: only text/silver is checked client-side; level gate, unique name, one guild per char and `haveBadWord` list (`GamePredef.BADWORDAR`) must be enforced server-side.
10. `GuildPanel` member `status` online flag refresh: panel re-pulls members every 30 s on show; no push for login/logout seen.
