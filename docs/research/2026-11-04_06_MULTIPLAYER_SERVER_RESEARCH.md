# M3 Multiplayer: legacy Go server research

Scope: chat channels, party/group, group battle, friends/blacklist, trade, lines, other-player info view.
Source: `D:\mcgame` (read-only), verified against code on 2026-11-04. Legacy memory docs
(`docs/memory/group-party.md`, `social-relationships.md`, `battle-combat.md`) were used as a map only; several claims are **stale**
and are corrected below (section 9). Paths are relative to `D:\mcgame\internal\` unless stated otherwise.

## 1. Summary

- All multiplayer state except relationships is **in memory** in Go: groups (`infrastructure/persistence/memory/group_repository.go`),
  trade sessions (`application/trade/service.go:95-105`), battles. Only friends/blocks and the items/money moved by a trade are in Postgres.
- Chat is a thin fan-out: no cooldown or length cap on the server (only a 1100 ms dispatcher rate limit), no profanity filter, no
  blacklist filter (the Flash client filters incoming `onSay` by name, `docs/client/view/view/compMain/ChatCanvas.as:1718-1736`).
- A group is a list of at most 5 members, leader first; membership is added at **invite time** (not at accept time, memory doc is wrong).
  Followers cannot move; the leader's `onCR` carries `mList` and the clients animate the follow chain.
- Group battle: leader triggers (`cbom` random encounter or `hitNpc`), roster = non-AFK, online, same-map, HP>0 members; positions 10..14;
  round runs when every live player character has submitted; exp/money split equally among survivors.
- Trade: both parties get a session at `newTrade` (no accept RPC; the target's panel opens on `onRequestTrade`). The client composes its
  offer locally and sends the whole thing in `tradeLock`. Items are copied (create+delete rows), not atomic.
- Friends are one-directional rows, no request/confirm, no online push; blacklist is a separate table and is **not enforced server-side**.

## 2. Entry points (live handlers)

Registration order in `cmd/gameserver/main.go`: group (:526) ... combat (:539) ... trade (:732), social (:736), chat (:745), stub (:807, last).
`dispatcher.Register` is last-write-wins (`infrastructure/rtmp/dispatcher.go:208-212`).

Collision check (grep over all `Register("...")`): **no collision** for any RPC in this milestone. Notes:
- `say`, `wisper`, `p2pWisper`, `chatGM`, `createChatPanel`, `getChatPanel`: only `handlers/chat/handler.go:74-79`. A commented stub exists in `handlers/stub/handler.go` but is not live.
- `groupInvite..getCharLeaderClient` + room RPCs: only `handlers/group/handler.go:65-89`. `group/group_handler.txt` and `trade_handler.txt`, `social_handler.txt`, `stub_handler.txt` are dead non-Go copies.
- `refuseToAddFriend`, `acceptTeacher`: **not registered anywhere** (only commented stubs) -> "Method not found".
- Collision elsewhere (FYI): `getCharStateClient` is registered by scene (`handlers/scene/handler.go:151`) and then overwritten by the stub no-op (`handlers/stub/handler.go:25`, registered last) -> it returns nothing in the live server; the memory doc claim "returns real state" is stale. `clickBoss` also registered in scene (`handlers/scene/handler.go:143`) and overwritten by combat.

| RPC | Go handler | Service |
|---|---|---|
| `say` | `handlers/chat/say.go:22` | inline + `groupService.GetGroupByMember`, `guildService` |
| `wisper` | `handlers/chat/whisper.go:85` | `charService.GetCharacterIDByName` |
| `p2pWisper` | `handlers/chat/whisper.go:17` | - |
| `chatGM` | `handlers/chat/panel.go:87` | log + ack only |
| `createChatPanel`/`getChatPanel` | `handlers/chat/panel.go:14,18` | returns `{id,name,classId,exp,iconCode}` of target |
| `groupInvite` | `handlers/group/requests.go:12` | `application/group/service.go:82 Invite` |
| `groupJoin` | `requests.go:99` | `service.go:114 Join` |
| `groupReqDeny` | `requests.go:138` | none (push only) |
| `groupAdd` | `requests.go:183` | `Join(leader=caller, joiner=arg)` |
| `groupRequest` | `requests.go:217` | none (push only) |
| `reqAddGroup` | `requests.go:286` | `Join(leader=arg0, joiner=caller)` (same as groupJoin) |
| `groupReqSuccNotice` | `requests.go:311` | no-op, returns `{success:true}` |
| `groupLeave` | `handlers/group/membership.go:15` | `service.go:134 Leave` |
| `groupKick` | `membership.go:69` | `service.go:178 Kick` |
| `groupGiveLeader` | `handlers/group/leadership.go:12` | `service.go:232 GiveLeader` |
| `groupAFK` / `unGroupAFK` | `membership.go:115,120` (+`afk_return.go`) | `service.go:284 SetAFK` |
| `groupListOfMap` | `membership.go:128` | `service.go:300 ListByMap` |
| `getGroupMemberPosistion` | `membership.go:155` | char position lookup (no membership check) |
| `getCharLeaderClient` | `handlers/group/leader_position.go:11` | leader map/x/y/line |
| `getFriendList`, `initViewImC`, `getBlackList`, `addRelationByName`, `delRelationship` | `handlers/social/relationships.go`, `handler.go:30-40` | `application/social/service.go` |
| `initTS,findTeacher,findStudent,reportTS,delST` | `handlers/social/teacher_student.go` | `application/social/service.go:208-392` |
| `newTrade,stopTrade,tradeLock,tradeConfirm` | `handlers/trade/lifecycle.go:16,77,102,124` | `application/trade/service.go` |
| `tradeAddItem,tradeRemoveItem,tradeSetMoney` | `handlers/trade/exchange.go:12,41,61` | **no-ops** returning `{success:true}`; the Flash client never calls them (it uses only `newTrade/tradeLock/tradeConfirm/stopTrade`, `TradePanel.as:1139,1601,1679,1797`) |
| `getLineInfo`, `changeLine` | `handlers/auth/characters.go:17`, `auth/misc.go:71` | `infrastructure/rtmp/db_line_provider.go:26` |
| `showChaInfo` | `handlers/auth/characters.go:35` | `buildShowCharacterInfoPayload :258` |
| `getCharDetailData` | `handlers/character/detail_data.go:13` | `characterDetailProps` |

Rate limits (`infrastructure/rtmp/dispatcher.go`): `say` 1100 ms (:122), `getLineInfo` 10000 ms (:109), `showChaInfo` 1000 ms (:179),
`initViewImC` 10000 ms (:190), `battleUpdateCmd` 200 ms (:181), `cbom` 1000 ms silent drop (:45-49,110). Group, social and trade RPCs have **no** server rate limit.
Over limit: returns `ErrRateLimited` (code 429) except silent-drop methods (`dispatcher.go:226-232`). Flash client also throttles chat at 1.2 s (`GamePredef.as:1232`, `Player.as:2302`).

## 3. Chat

### 3.1 Wire facts
- Flash channel ids (`docs/client/predef/GamePredef.as:744-750`) = Go constants (`handlers/chat/handler.go:17-26`):
  `0 local(scene), 1 global(world), 2 guild, 3 team, 4 whisper/battle, 5 area, 6 headline(top), 9 rumour/system` (9 only appears client-side, `ChatCanvas.as:1767`).
- **Divergence in H5**: `packages/shared/src/protocol.ts:169-173` defines `LOCAL: 1, GLOBAL: 2, SYSTEM: 9` and pushes `onChat`; Flash/Go use `0/1/...` and `onSay`. Decide before M3 (see 8).
- RPC shape (Flash `Creature.as:404`, Go `helpers.go:59-71`): `say(sourceId, sourceType, channelId, msg)`; Go reads `args[2]` channel (default 0) and `args[3]` message, requires `len(args) >= 2`, empty message -> silent `null` (`say.go:22-31`).
- Push `onSay` payload (`say.go:57-64`): `{id, name, type: 2 (TBL_CHARACTOR), channelId, pmLevel, msg}`. The sender receives its own message too (local broadcast uses `BroadcastToScene(..., excludeConnID=0, ...)`, `say.go:316`).

### 3.2 Rules
1. No length limit, no trimming, no cooldown, no word filter on the server (verified: nothing in `say.go`/`helpers.go`). Only the 1100 ms rate limit. H5 currently caps at 200 chars (`server/src/modules/chat/chat.rpc.ts:12`); keep as H5 hardening.
2. Local (0, and 4/5/other default): broadcast to the sender's (line, map) scene (`say.go:313-329`, `currentRoomID` helpers.go:51). H5: `scenes.broadcast(session.mapId, ...)`.
3. Global (1) and Top (6): `BroadcastToAll` (`say.go:318,324`). Global costs **one item 719 "Loa"** (`handler.go:30`, `say.go:276-311`; template `data_tbl_item_template id 719`, name "Loa", `info` "Dung de phat ngon tren kenh the gioi", `use_type 4`, `type 550`, `stack_max 99999`, price 1000, gold 2).
   - Quirk (bug): when the player has no Loa, `consumeGlobalSpeaker` sends `onSystemMidMsgOrNote "Ban can co Loa de chat kenh the gioi!"` and returns `nil` -> `Say` still broadcasts (`say.go:51-55` ignores "no item" because no error is returned). Port decision needed: H5 should **abort** (recommended) and send the note.
   - Consumption goes through `itemService.UseItem` (speaker item effect), then pushes `onDelCharactorSlot(itemId, sid)` when stack hits 0 else `onAddCharactorSlot(itemDTO)` (`say.go:302-309`).
4. Guild (2): needs guild service else `onSystemMidMsgOrNote "Tinh nang chat guild chua kha dung!"`; not in a guild -> `onBlueMsg "Chua co bang hoi"`; else push to each online guild member (`say.go:331-354`). **H5 has no guilds: out of scope.**
5. Team (3): `groupService.GetGroupByMember`; none -> `onBlueMsg "Chua co nhom"`; else `onSay` to every online member in `group.Members`, across maps/lines (`say.go:356-379`).
6. Whisper `wisper(senderId, senderType, targetName..., msg)` (`whisper.go:85-147`): needs `len(args) >= 2`. With >= 3 args the text after index 2 is joined and the **longest prefix that is a character name** is the target (`resolveWhisperTargetByName :195`), rest = message; fallback target id = `args[0]` (the client's own id, effectively unusable). Empty message -> `null`. Offline target -> `onBlueMsg "Nguoi choi khong online"` to sender. Online -> `onWisper` to target and, if target != sender, to sender with payload `{text, sourceId, sourceName, sourceIdType: 2, pmLevel, targetId, targetName}` (:114-146).
7. `p2pWisper(msg, senderId, targetId)` (`whisper.go:17-83`): `senderId` must equal session char else `ErrUnauthorized`; offline target -> `onP2pWisperError {success:false, error:"Target player is offline"}` to sender; else target gets `onP2pWisper(msg, senderId, senderName, true)`; **sender gets no echo**.
8. `chatGM(msg, playerId, gmName)` (`panel.go:87-133`): logs only and replies `onChatGM {success:true, message:"Your message has been sent to GM"}`. No GM relay. Skip in H5 or ack only.
9. GM commands via `say` text before channel dispatch (`say.go:34-39,70-201`): `/add <templateId> <count> [0|1|2]`, `/stat <money|moneybind|gold|goldbind|exp|level> <n>`; need `char.GMLevel >= 5` (`say.go:20,227`) else `onSystemMidMsgOrNote "Ban can gmLevel >= 5 de dung lenh GM"`. Never broadcast. H5 already has a dev `gmGoMap`; do not port these.
10. Blacklist: **no server-side filtering** in chat, whisper, group invite or trade (grep `FindBlacklist` only in social/login paths). Flash client drops `onSay` locally when `_core.isBlack(name)`. For H5, either keep client-side or add a server filter (an H5 improvement, flag as such).
11. `createChatPanel(targetId)` / `getChatPanel(targetId, fallbackName)` -> reply `{id, name, classId, exp (cumulative), iconCode}`; `targetId == self` -> `ErrInvalidInput`; unknown target with fallback name -> `{id, name}` only (`panel.go:28-85`).

### 3.3 Push sequence
- `say` ok: `onSay` fan-out only. Global w/o item (live): `onSystemMidMsgOrNote` then (bug) `onSay`. Error replies: bad args -> `ErrInvalidArgs`; no pushes.

### 3.4 State
Nothing persisted. Online lookup = `rtmpServer.GetConnectionByCharacterID` (H5: `SceneManager.findByCharacter`, `scene.manager.ts:56`).

## 4. Party / group

### 4.1 Data model (`domain/group/group.go:12-33`, `application/group/service.go:14`)
`Group{ID, LeaderID, MapID, Members[]{CharID, Name, IsLeader, AFK}, RoomOpen..., CreatedAt}`; `MaxGroupMembers = 5` (`service.go:14`). Leader is always `Members[0]` (Invite creates with leader first; Join/Invite append; `GiveLeader` reorders new leader to index 0, `service.go:260-277`; Leave of leader promotes `newMembers[0]`, `service.go:159-167`).
`Group.MapID` is **never assigned** for plain groups (grep `.MapID =` in application/group: none) so `groupListOfMap(mapId != 0)` always returns `[]` (`group_repository.go:101-113`, `membership.go:128-153`). Room-groups (`createRoom`, `getRoomList`, `applyToRoom`, ...; `RoomOpen=true`) are a separate "dungeon room" feature: out of scope for M3.

### 4.2 Rules (numbered)
1. **No gating at invite/join**: no distance, level, league, same-map, battle-state, blacklist or "target busy" check (`requests.go:12-97`). `dis: "far"` is added to `onGroupInvited` only when `leaderChar.MapID != targetChar.MapID` (`requests.go:69-72`); the Flash client then shows nothing (`Group.as:42`, `if (obj && !obj.dis)`).
2. `groupInvite(targetId)` (any member can call): `targetId == self` -> `ErrInvalidInput`; both characters must exist (else error). `Invite` (`service.go:82-112`): if caller has no group, **create** one with the caller as leader; if target already in any group -> return the group unchanged (no error, still pushes!); if `len(Members) >= 5` -> `ErrGroupFull` (returned as an error response, **no pushes**); else **append target immediately** (`:103`) and clear room applications.
   - Consequence: Go membership exists before the target answers; `groupReqDeny` does not remove the target (`requests.go:138-181` only pushes). Invite expiry: **none** (no TTL anywhere).
   - H5 recommendation (deviation, keeps the wire): hold invites in a pending map `{leaderId -> targetId, expiresAt}` and only call `join` on `groupJoin`; TTL 60 s is an H5 choice (unverified vs original). The Flash client does not need the pre-added state.
3. `groupJoin(leaderId)` (invitee accepts, `Group.as:58`) -> `Join` (`service.go:114-132`): leader's group must exist else `ErrGroupNotFound` -> reply `{success:false,error}`; if joiner already in a group (including because of rule 2) return that group; full -> `ErrGroupFull` -> `{success:false, error}` (**no `onGroupCantJoin`**; grep shows the push is never sent, memory doc stale); else append and `broadcastGroupJoined`.
4. `groupRequest(...)` (apply to join): Flash sends **two args** `(requesterCid, leaderCid)` (`TargetCanvas.as:332`, `IMPanel.as:1629`) but Go reads `args[0]` as the leader and compares it to the caller (`requests.go:223-234`) -> with the real client payload `leaderID == joinerID` and Go replies `{success:false, error:"cannot request to join own group"}`. **Unverified at wire level** (could be an AMF arg-order quirk); H5 should read the **last** numeric arg as leader id and fall back to arg 0.
   - Valid case: leader has a group, joiner has none (else `{success:false,error}`), leader online -> push `onGroupRequest {id, name, exp, classId}` to the leader (`:259-277`, exp is raw `Experience`, not cumulative). Reply `{success:true}`.
   - Leader's panel later calls `groupReqSuccNotice(id)` (no-op) and, on accept, `groupAdd(requesterId)` (`GroupPanel.as:908`) -> `Join(leader=caller, joiner=arg)`, `broadcastGroupJoined`. `groupAdd` has **no check that the caller is the leader** or that a request exists.
5. `groupReqDeny(otherId)` (`requests.go:138-181`): used by the invitee ("No" to an invite) and by the leader (deny a request). Push to `otherId` if online: `onGroupRequestDeny {cid, name}` if the caller is a group leader, else `onGroupDeny {cid, name}`. Reply `{success:true}`. No state change.
6. `groupLeave` (`membership.go:15-38`, `service.go:134-176`): remove caller; if `!RoomOpen && remaining <= 1` -> delete group and push `onGroupDismiss` to **all old members including the leaver** with payload = linked list of the old group `{head:{obj,next...}, len}` (`broadcast.go:141-159,271-277`); else if caller was leader promote `newMembers[0]` (AFK cleared); push `onGroupLeave {sid, name, mList}` to remaining members **and the leaver** (`broadcastGroupLeave :174-204`). **No `onGroupGiveLeader`/`onCR` on leader promotion** (memory doc stale). Reply `{success:true, group:dto|null}` (`successGroupResponse`).
7. `groupKick(targetId)` (`membership.go:69-113`, `service.go:178-230`): caller must be leader (`ErrNotLeader`), target != self, target must be a member (`ErrMemberNotFound`); errors come back as `rtmp.ErrorToResponse` objects (code/message), not pushes. Remaining 1 -> `onGroupDismiss` to all old members (kicked included); else `onGroupLeave {sid:target,name,mList}` to remaining + kicked.
8. `groupGiveLeader(newLeaderId)` (`leadership.go:12-86`, `service.go:232-282`): `newLeaderId == self` -> `{success:false,error}`; leader only; target must be member; new leader's AFK flag cleared; members reordered with new leader first. Pushes in order to all members: `onGroupJoined` (full refresh) then `onGroupGiveLeader {sid:oldLeaderId, oName, tid:newLeaderId, nName, afkflag:wasAFK, mList}` (`broadcast.go:243-269`). No `onCR` (memory doc says `onCR` follows; code does not). Return value is the success object (not a bare boolean, Flash `giveLeaderResult` expects Boolean per memory doc: **unverified**; send `true` to be safe? see 8).
9. `groupAFK` / `unGroupAFK(nearbyFlag)` (`membership.go:115-126,179-225`, `afk_return.go`):
   - `groupAFK`: `SetAFK(true)` for the caller (leaders can be flagged; the movement check ignores it for leaders). Pushes `setCharactorAfk {cid, mList}` to every member; `unGroupAFK` -> `unSetCharactorAfk {cid, mList}`.
   - `unGroupAFK(true)`: just clears the flag (no distance check). `unGroupAFK()` / false: "remote return" requires consuming item **3552 "Sach Hoi Nhom"** (`afk_return.go:16,99-115`, `data_tbl_item_template` id 3552, `use_type 1`, `type 550`); missing item -> `onMidNote "Can Sach Hoi Nhom moi co the hoi nhom"` and `{success:false}`; else teleport to leader (map/x/y/line from leader's connection, safe point if x/y <= 0), then the AFK flag is cleared and `unSetCharactorAfk` carries extras `{line, posMapId}`.
   - AFK members: skipped in battle roster (`group_battle.go:28`) and in leader transport follow (`utils/group_transport.go:52`); allowed to move (`scene/movement.go:507-516`).
10. `getGroupMemberPosistion(cid?)` -> `{success, map, x, y}` of **any** character (no group check); `getCharLeaderClient(cid?)` -> `false` unless that char is a group leader, else `{cid, leaderId, name, map, mid, posMapId, x, y, line}` (`leader_position.go:11-58`).
11. Disconnect (`main.go:368-393` -> `handlers/group/disconnect.go:29-71`): runs **after** combat cleanup, same as `Leave` but pushes go to the *other* members only (`onGroupDismiss` or `onGroupLeave`). Still no GiveLeader/onCR. Not run on map change or logout-to-char-select unless that path calls disconnect (unverified).
12. Movement restriction (`scene/movement.go:43-52,478-520`): a non-leader, non-AFK member calling `udcp`/`udcr` gets `onMidNote "Da o trong nhom phai nghe loi nhom truong"` and `{success:false, error:"Cannot move while in group (must follow leader)"}`; no position change.
13. Leader movement (`movement.go:62-98,535-560`): after the leader's `udcp/udcr`, every **non-AFK member that is on the same map** gets its stored position set to the leader's (`syncGroupMemberPositions`); the `onCR` broadcast to the map includes `mList` = linked list `{head:{obj:cid, next:{...}}, len}` in `Members` order when the mover is the leader (`attachGroupMovementState :522`). Followers' sprites are animated client-side from `mList`.
14. Scene player payloads (`scene/player_data.go:26-80`): `inGroup:true`, `isLeader`, `groupAfk`, and `mList` (`{head:{...}}`, no `len`) are added to `onScenePlayerEntered`/`createChars`/`sceneLogin` entries for grouped players; `inBattle`, `state` (1 normal, 5 battle) too. **There is no map-level push when group membership changes** (no `onSetTeamLeague`: grep finds none, memory doc stale); the team flag only reaches observers when they next receive the player's scene payload.
15. Leader transport follow-through (`utils/group_transport.go:31-112`): called after every leader map change (`sceneChange` `scene/login.go:240`, `toMovable` `scene/movement.go:280`, transport item `item/transport.go:232`, NPC teleport `npc/npc_func_other.go:378`, `npc/npc_script.go:675`, admin `scene/admin_transport.go:94`). For each member except leader: skip AFK, skip offline, skip `conn.IsInBattle()`; push `onCharLeaveScene(cid)` to old room, move room, `UpdatePosition(map, x, y, dir 0)`, then to that member `onCreateNpcs {}`, `onCreateBoss {}`, `onSceneEnter(map, x, y, -1)`, scene population (`onCreateChars` equivalent) and broadcast `onScenePlayerEntered(playerData)` to the new room; finally `RefreshGroupState` (re-sends `onGroupJoined`). Skipped when `oldRoomID == newRoomID`.
16. Group chat/channel: see 3.2.5.
17. Restart: all groups lost (in-memory repo `main.go:517`); players are removed from groups on disconnect so nothing to restore on login.

### 4.3 Payloads
- `onGroupJoined {groupCharactorList: {"<cid>": playerData+{cid,isLeader,afk,inGroup:true,inGroupWithTotal:true}}, groupAKFCidList: {"<cid>":cid}, groupafkId: 0, mList:{head,len}}` (`broadcast.go:14-117`). `playerData` = scene-player payload (`sceneService.GetCharacterForClient`) overlaid with `id,cid,name,classId,gender,level,exp(cumulative capped),expRe,posMapId,posX,posY,posDir,pmLevel,ee,ef,en,cl,qn` (+`showPetId/showPetObj`) (`group_payload.go:9-60`). Members whose character lookup fails are silently dropped from the list.
- `onGroupInvited {pid, name, dis?}`, `onGroupInviteSent {pid, name}`, `onGroupRequest {id, name, exp, classId}`, `onGroupDeny`/`onGroupRequestDeny {cid, name}`.
- Reply shapes: success `{success:true, group:{id, leaderId, mapId, members:[{cid,name,isLeader,afk}]}}`; failures `{success:false, error:string}` or `ErrorToResponse` object. The members' `name` in the DTO is empty (service never fills `Member.Name`).

### 4.4 Push sequences (summary)
| Action | Sequence |
|---|---|
| invite ok | caller: `onGroupInviteSent`; target (if online): `onGroupInvited` (dis="far" if maps differ); reply group DTO. Group full: reply error, no pushes |
| invitee accepts | all members: `onGroupJoined` |
| invitee denies | inviter: `onGroupDeny` (membership unchanged in Go) |
| request / accept | leader: `onGroupRequest`; on `groupAdd` all members `onGroupJoined`; deny -> requester `onGroupRequestDeny` |
| leave (>= 3 members) | remaining + leaver: `onGroupLeave {sid,name,mList}` |
| leave / kick (-> 1 member) | all old members: `onGroupDismiss {head,len}` |
| give leader | all: `onGroupJoined`, `onGroupGiveLeader` |
| AFK on/off | all members: `setCharactorAfk` / `unSetCharactorAfk {cid,mList}` |
| leader moves map | per follower: `onCharLeaveScene`(old room), `onCreateNpcs`, `onCreateBoss`, `onSceneEnter`, scene population, `onScenePlayerEntered`(new room), then `onGroupJoined` refresh |
| disconnect | other members: `onGroupLeave` or `onGroupDismiss` |

## 5. Group battle

Entry: leader-only. `eligibleBattleRoster(initiatorId, mapId)` (`handlers/combat/group_battle.go:15-56`):
1. If initiator is not in a group, or is **not the leader** -> roster = `[initiator]` (a follower calling `cbom` fights alone; the server does not block it).
2. For each member in `group.Members` order (leader first): skip AFK; skip offline; skip if `char.MapID != mapId` or `CurrentHP <= 0`; skip if the member already has an active battle (except the initiator). Roster empty -> `[initiator]`.
3. `StartPVEBattleWithRoster` (`application/combat/encounter.go:349-440`): each roster id must not be in an active battle (defeated stale battles get resolved first). Roster capped at 5. Player i takes position `PlayerCharPositions[i] = 10,11,12,13,14` (pets `15..19`) when the connection setting `playerInFront` is false (default); when true, players and pets swap rows (`encounter.go:35-40`, `domain/combat/position.go:45-48`). Enemies use `EnemyCharPositions = 0,2,1,4,3` then pet slots `5,7,6,9,8`, max 10.
4. `cbom` random-encounter enemy count (`encounters.go:262-279`): by roster size `1:[1,2] 2:[2,4] 3:[3,5] 4-5:[4,5]` uniform inclusive; then capped by the number of **distinct normal (non-boss) `map_creature` rows of the map** (`encounters.go:136-142`); each enemy is rolled independently against `[start_rate,end_rate)` (`selectRandomMapCreatures :281+`). Encounter rate clamp `[0.30, 0.75]`, 0 = never (`encounters.go:246-260`), cooldown 4 s (`combat/battle.go:24`) set on **every** participant connection (`encounters.go:215`).
5. `hitNpc` with a roster > 1 builds one enemy from the NPC template (`combat/battle.go:25-70`). Quest battles started from `clickNpc` (`npc/quest_battle.go:62`, `StartPVEBattleWithMultipleEnemies`) are **solo** (no roster).
6. Start pushes, **per participant** (`group_battle.go:122-145`): `battle.AddWatcher(conn)` for every player-character participant (watchers = participants only, no spectators in PvE); for each living character: `conn.SetBattleID`, `onUpdatePet` HP/MP (if pet), `onSetCharState {cid,5}` to self, `onSetCharState` broadcast to the map, then `onBattleStart {battleFieldId, cList (all participants by position), guest:false, sneakFlag:0, bossFlag:false, airBattle:false}`. Then `setBattleRoundDeadlines`.
7. **Round readiness** (`combat/commands.go:138-145`, `domain/combat/battle.go:761-786`): pending commands are merged per actor; the round runs only when every **alive** participant with `EntityType=character` on the player side has a command. Pets do not block (the processor auto-generates pet behaviour). Members that already submitted get `{success:true, battleId, round, waitingForCommands:true, missingActorIds}`; a repeated submission overwrites the previous command for that actor (`mergeBattleCommands :440-450`).
8. Round execution: commands sorted by speed (existing H5 `round.ts`), results broadcast via `battle.BroadcastToWatchers("onBattlePlayList", groups)` (`commands.go:255`) to **all** participants; the last submitter's RPC reply also carries `actions`+`cList`. If the battle continues: each participant gets `onCmdReady(position)` (`group_battle.go:161-173`, `commands.go:253`) **before** the playlist, then deadlines are re-armed. On end: an `{end:true, type:0, result}` step is appended (`result` 1 win / 0 loss / 2 fled) and every participant gets `onUPP {currentHp,currentMp}` (`group_battle.go:175-190`).
9. **Manual flee ends the whole battle**: `executeEscape` for a non-queued player flee calls `SetPlayerFled` and `ProcessRound` breaks with `Winner = enemy`, `PlayerFled=true` (`domain/combat/turn_executor.go:258-295`, `turn_processor.go:316-321`). One member fleeing ends the fight for all with no rewards.
10. **Timeout**: 30 s per round (`application/battle/service.go:19`), checker every 5 s (`:21`), stale-battle cleanup 10 min (`:22`, `cleanupStaleBattles :344`). On expiry, `HandleTurnTimeout` (`application/battle/timeout_handler.go:30-65`) keeps pending commands and fills `ClientActionTimeout (-40)` for **every** missing live player character, then processes one round and broadcasts via watchers. At most one timeout per battle per tick (`checkTurnTimeouts`, `service.go:196-250`). Quirk: after a timeout round no new deadlines are armed (nothing calls `setBattleRoundDeadlines`) until the next command-driven round; unverified whether another path re-arms. H5's existing re-arm-per-round design is fine; just make the deadline per battle.
11. **Rewards** (`application/combat/service.go:470-517`, `rewards.go`): winner = player side only. `CalculateExpReward(players[0].Level, enemies)` and `CalculateMoneyReward(enemies)` use the **first** player-side participant's level (the leader); then `splitReward = floor(total / survivors)` (`rewards.go:33-34,506-511`) where survivors = player-side **characters** with `IsAlive || MaxHP == 0` (`survivingRewardParticipants :484-503`). Dead members get nothing. Exp goes through `GainExperience` per member, money to `MoneyBind`. Pets get 50 % exp share (`petExpShareRatio`, solo scope; not in M3).
12. **Loot**: each creature loot row rolled **once** per dead enemy (not per member), filtered by quest eligibility (`qid` row only for recipients with that quest active); the winning roll is handed round-robin to the eligible survivors (`rewards.go:289-300`); quest-needed items use x5 rate cap 50000 (`:213-218`, `rand(50000)+1 <= rate`). Items are added to the bag at `EndBattle`; the member sees them via pushes at **their own** `battlePlayEnd`.
13. **Kill credit**: per participant at its own `battlePlayEnd` (`combat/battle.go:331`, `collectQuestKillUpdates :511-554`): when the battle result is a player win, every enemy creature counts for **every** character who ends the battle (alive or dead, including members that did not strike). Pushes `onAddChaQuest` per updated quest and `onUpdateQuestKill`.
14. **`battlePlayEnd`** (`combat/battle.go:274-480`) is per participant: ends the battle once if still active (`CheckVictory`, else enemy wins), saves HP/MP/SP from the participant, pushes progress/reward callbacks for that character only, `ClearBattle`, `onSetCharState {cid,1}` (self + map broadcast), sets 4 s encounter cooldown, `AckBattleCleanup`. The ended battle stays cached until every character acked (`service.go:519-541`, `GetBattleForCleanup :182`).
15. **Disconnect** (`application/combat/service.go:235-285`, `main.go:368-380`): persists the leaver's HP/MP/SP. If more than one player character is alive: queue `ClientActionEscape` with `QueuedLeave:true` for that actor (executed in the next round: `flee` action then idle `behaviorId 10170`, the actor is set HP 0/dead and **does not** mark `PlayerFled`, `turn_executor.go:258-295`) and return the battle id; otherwise end the battle (enemy wins unless already decided). `main.go:376-378` then calls `ClearBattleDeadlines(battleId)` for the whole battle even in the grouped-leave case, and nothing triggers the queued round: if the leaver was the last missing command the round is **not** executed until another command arrives (stale cleanup after 10 min). Memory doc says "removes only that participant's deadline": stale. H5 should run the round immediately if no live command is missing after a leave.
16. Watcher fan-out removal on disconnect: `battle.RemoveWatcher`-style cleanup is described in the memory doc; **unverified** in code (not traced).
17. Group leader transport skips members in battle (`group_transport.go:59`) and `groupLeave` is not forced by entering battle.

### Port notes (H5 BattleManager)
Current H5 `Battle` is single-character (`server/src/modules/combat/battle.types.ts:57-72`: `characterId`, `byCharacter` map in `battle.manager.ts`). Needed:
```ts
interface Battle { characterIds: number[]; /* roster, leader first */ commands: Map<number, Cmd>; ... }
// manager: byCharacter: Map<number, battleId> for every participant; remove() deletes all.
function roster(leader: Session, mapId: number): number[] {
  const g = groups.ofMember(leader.characterId); if (!g || g.leaderId !== leader.characterId) return [leader.characterId];
  const out = g.members.filter(m => !m.afk).map(m => scenes.findByCharacter(m.charId)).filter(s => s && s.mapId === mapId
      && s.battleId === null && hp(s) > 0).map(s => s.characterId).slice(0, 5);   // keep leader first
  return out.length ? out : [leader.characterId];
}
// slot = 10 + index; enemy count = pick(min,max by roster size) capped at normalCreatureRows.length
// battleUpdateCmd: commands.set(charId, cmd); missing = alive character fighters without a command;
//   if (missing.length) return { waitingForCommands: true, missingActorIds }; else resolveRound() and fan out onBattlePlayList to all roster sessions.
// settle: survivors = fighters.filter(f => f.kind==='character' && (f.alive || f.hpMax===0));
//   exp = floor(expFor(leaderLevel, enemies) / survivors.length); money likewise; credit survivors only; loot round-robin; kill credit for every roster member.
```
Where: `server/src/modules/combat/{battle.manager.ts,combat.service.ts,battle-settle.service.ts,encounter.ts}`; group lookup injected from `modules/group/group.service.ts`.

## 6. Friends / social

### 6.1 Storage (Postgres)
- `player.friends` (`supabase/migrations/20260328184527_baseline_mcgame_schema.sql:2626-2634`): `id bigint, character_id, friend_id, group_id int=0, nickname varchar(50), intimacy int=0, created_at`; `UNIQUE(character_id, friend_id)` (`:4374`); plus `type smallint default 0` (`20260505071855_add_relationship_type.sql`): 0 friend, 1 black (unused here), 2 enemy, 3 couple, 4 tutor, 5 brother (`domain/social/relationship.go:14-21`).
- `player.blocks` (`:1971-1977`): `id, character_id, blocked_id, reason, created_at`; `UNIQUE(character_id, blocked_id)` (`:4194`). **`friends.id` and `blocks.id` come from different sequences** -> same id can exist in both tables; `FindByID` tries friends first then blocks (`postgres/relationship_repository.go:237-266`), so `delRelationship` of a block whose id equals someone's friend row returns `ErrUnauthorized`. H5: single collection with one counter and a `kind` field.
- Relationships are directional: A adding B does not create B->A. Friends list = `where character_id = me and type = 0 order by created_at desc`, name joined live from `player.characters` (`get_friend_relationships`, `20260414083459_add_low_risk_repo_db_functions.sql`).
- No friend count limit in SQL or Go (`create_friend_relationship` is a plain insert). Name validation only: `len(name) <= 30` bytes and no control chars (`relationships.go:18-27`).

### 6.2 RPCs
- Client type enum (1-based) <-> domain (0-based) = `domainType + 1` (`social/client_contract.go:53-74`): `1 friend, 2 black, 3 enemy, 4 couple, 5 tutor, 6 brother`.
- `initViewImC()` (`relationships.go:32-71`): pushes `onInitViewImC {"<relId>": dto}` for **friends + blacklist** (`FindByCharacterID` = friends then blocks, `relationship_repository.go:27-40`), returns `null`. DTO: `{id, name, otherId, type (client enum), num (intimacy; 0 for blocks), data: {exp, classId} | null}`, `data` only when the other is online.
- `getFriendList()` -> array of the same DTO for friends only (`social/service.go:81-108`). `getBlackList()` -> array of block DTOs (`service.go:110-125`).
- Login payload `black` (inside `onChooseCharactor`): all-string DTO `{id,name,num:"0",otherId,selfId,type:"2"}` (`domain/social/relationship.go:70-79`).
- `addRelationByName(name, clientType)` (`relationships.go:125-217`, `service.go:155-191`): name lookup by exact character name (`GetCharacterIDByName`); self -> error; `Exists(char, other, type)` -> "relationship already exists"; only types friend(1) and black(2) are creatable (others: `Exists` returns `ErrInvalidInput`). **Immediate, one-directional insert; no confirmation.** Reply push `onAddRelationByName(targetId, clientType)` (`-1, type` on any failure) and return `{success, relationship}` / `{success:false,error:"cannot add relationship"}`. For type friend: `onSystemSay` to the adder (`Ban da ket ban voi <font color="#FF0000">NAME</font>!`) and, if the target is online, `onSystemSay` to the target (`<font ...>NAME</font> da them ban vao danh sach ban be!`) (`:219-249`). Blocking a friend does **not** remove the friend row (both can exist; `UNIQUE` is per table).
- `delRelationship(relId)` (`relationships.go:251-300`, `service.go:197-206`): row must belong to the caller (`ErrUnauthorized`), not found -> `ErrNotFound`; success pushes `onDelRelationship(relId)` and returns `null`.
- No `onFriendOnline/Offline` pushes of any kind (grep `onFriend|friendOnline` empty). Online status is a snapshot (`data` present or null) at list time via `rtmpServer.IsCharacterOnline`. A Redis `SocialPresenceStore` (`utils.UpsertSocialPresence`) tracks map/x/y/line but is not used by the social service (not needed for H5).
- `refuseToAddFriend`: not registered (see 2).

### 6.3 Teacher / student (only noted)
`initTS` -> `onInitTS` (students list, `handlers/social/teacher_student_payload.go`), `findTeacher(name)` -> `onFindTeacher` also returned directly: result `{t:1,i,n}` ok or `{t:2,f:code}` with codes 1 not found, 7 self, 2 already this teacher, 3 already has a teacher, 4 teacher has >= 5 students, 5 info error, 6 teacher exp <= student exp (`service.go:238-287`); `findStudent` mirrors it (`:289-341`, codes 8 self, 2 student has teacher, 3 already, 4 >= 5 students, 5 teacher exp <= student exp); `reportTS`, `delST`. "Client will handle the actual relationship creation": no server RPC creates the tutor row (`acceptTeacher` is not registered; `handleNpcTutor` is a stub per the memory doc). **Defer entirely.**

### 6.4 Proposed H5 schema
```ts
// collection friendships: { id: number (counter 'friendship'), characterId, otherId, kind: 'friend'|'black', createdAt }
// unique index (characterId, otherId, kind); name joined from characters at read time (names can change).
```
List order: newest first. No cap in legacy (H5 may add one; flag as H5 choice).

## 7. Trade

### 7.1 State
In-memory only: `sessions map[tradeId]`, `byCharacter map[charId]tradeId`, `nextTradeID = now.UnixMilli()` (`application/trade/service.go:95-105,32-90`); `tradeSession{Initiator, Target, Offers[charId]{Money,Gold,PetIDs[5],Items[1..5],Locked,Confirmed}, Executing}` (`types.go:107-130`). Persistence only at the swap. Constants: `maxTradeItems = 5`, `maxTradePets = 5` (pet trading is rejected: "pet trade is not supported yet"), action states `1 normal`, `4 trade` (`types.go:18-23`; client `GamePredef.as:148,151`).
No timeout, no distance, no level, no map, no battle check, no blacklist check. **No cleanup on disconnect** (`main.go:368-393` never touches `tradeService`): a disconnect leaves both parties stuck in "already in a trade" until the other calls `stopTrade` (which resolves the session by character id) or the server restarts. H5 must stop the session on disconnect/logout and on map change.

### 7.2 State machine and rules
1. `newTrade(targetId)` (`handlers/trade/lifecycle.go:16-74`, `service.go:32-90`): args `< 1`/bad id -> `{flag:false, info}`; self -> `"Cannot trade with yourself"`; target offline -> `"Target player is not online"`; both characters must exist; initiator already in a session -> `"you are already in a trade"`, target in a session -> `"target is already in a trade"`. Creates the session for **both** at once (no pending state). Then pushes `onRequestTrade(initiatorId, initiatorName)` to the target; if the push errors the session is stopped and `"Target player is not available"` is returned; else `onSetActionState {cid, state:4}` for **each of the two characters to both parties** (4 pushes total). Reply `{flag:true, tradeId}`. There is **no accept/decline RPC**: the target's client opens the panel on `onRequestTrade` (`TradePanel.as:1496-1501`), and either side closes with `stopTrade`.
2. `stopTrade()` (`lifecycle.go:77-100`): no session -> `null` silently. Otherwise detach and push to both: `onSetSlotSid(itemId, sid)` for every locked item (restore bag slots), `onStopTrade`, then `onSetActionState {cid, state:1}` x4.
3. `tradeLock({money, gold, petIds[], petId, items:{"1".."5": itemId}})` (`lifecycle.go:102-122`, `service.go:120-178,267-358`): requires a session and not `Executing` ("trade is being finalized"). Validation (`buildOffer`/`validateLockItems`): money and gold >= 0; `char.Money >= money` ("not enough silver") and `char.Gold >= gold` ("not enough gold") - **unbound `money`/`gold` only, `moneyBind`/`goldBind` cannot be traded**; any `petId > 0` -> error; <= 5 items, slot keys 1..5, item ids > 0 and unique; each item must be found, owned by the caller (`CharacterID`), in the **normal bag** (`SlotTypeBag`, so quest bag, equipped and pet-item bag items are excluded), and **not bound** (`IsBound`). The item template column `tradable` (0 for 5018 of 6468 item templates in `data_tbl_item_template`) is **never consulted** (grep `Tradable` only in models), nor quest-item type 508/509 beyond the bag-type check. H5: consider also honouring `tradable` (improvement, flag as such).
   - On success: the offer replaces the caller's previous one, `Locked=true`, `Confirmed=false`; the **other side's `Confirmed` is reset to false** (`service.go:157-159`). Locking again is allowed until confirmed (re-lock replaces the offer, since lock checks only `Executing`).
   - Pushes: caller gets `onSetSlotSid(itemId, -1)` per item (hide bag slots); target gets `onTargetLock {money, gold, itemList: {"<slot>": {type, itemId, sid, stackNum}}, petIds:[-1 x5]}` (`service.go:623-642`); reply `{flag:true}` (failure `{flag:false, info}`).
4. `tradeConfirm(md5SecondaryPassword)` (`lifecycle.go:124-181`, `service.go:180-265`): requires a non-empty string arg else `{flag:false, success:false}`; verifies it against the account's secondary password (`utils/secondary_password.go:20-40`; default md5 of "123456" = `e10adc3949ba59abbe56e057f20f883e`, `domain/auth/account.go:18,71-77,96-101`); on mismatch pushes `a(<SecondaryPasswordFailureMessage>)` and returns `{flag:false, success:false}`; on success pushes `setClientDP(hash)` to cache it. H5: `account.schema.ts:13 secondaryPassword` exists, but `bag-ops.rpc.ts:3` ignores the drop password; align with that (skip) unless the user wants it.
   - Requires both sides `Locked` ("both sides must lock before confirming"). Marks the caller `Confirmed`. If the other side is not confirmed (or the session is `Executing`) the reply is `{flag:true, success:true}` with **no push to the other party** (the "target confirmed" label is not shown early; `onTargetConfirm` is only sent at completion, see below). If both confirmed -> `Executing=true`, run `executeTrade` on a snapshot.
5. `executeTrade` (`service.go:363-451`), in this order: reload both characters; re-check `Money`/`Gold` >= offered for each ("initiator/target does not have enough currency"); `ensureBagCapacity` for each receiver: `bagCount + incomingItems <= min(char.MaxBagSlots(), DefaultBagSlots)` ("inventory is full", `:476-495`); re-resolve each offered item (exists, still owner, still bag, still unbound); **copy** each item to the other party at its first empty bag slot (`cloneItemForTrade :682`: new row, same template/stack/bound/enchant/star/colour/properties/durability); delete the originals; update both characters' money/gold (`init.Money = init.Money - offered + received`, same for gold) with two separate `Update` calls.
   - Atomicity: **not transactional**. Failure while copying rolls back created rows only (`rollbackCreatedItems`); failure after deletion or between the two character updates is not undone (first character saved, second may fail). H5 should perform the swap under a per-character lock (reuse `modules/inventory/char-lock.ts`) and ideally in a Mongo transaction (replica set requirement for transactions: **unverified** for `docker/docker-compose.yml`), otherwise ordered operations with compensation.
6. Failure path in `tradeConfirm` (`lifecycle.go:152-163`): the session is detached, both parties get `onSetSlotSid(itemId, originalSid)` for all offered items (restore), `onTradeFail(info)` to both, `onSetActionState {state:1}` x4; reply `{flag:false, success:false, info}`. Client shows "Khong co du khong gian tui do!"/generic fail text (`TradePanel.as:1460-1466`).
7. Success path: reply `{flag:true, success:true, received:[itemDTO...]}` to the confirmer; then `onTargetConfirm` to the other party (`:171`), `onAddCharactorSlot(itemDTO)` per received item to each side, `onUPP {money, gold}` (new totals) to each side, `onSetActionState {state:1}` x4, `onTradeSuccess` to both (`:171-180`). Sender-side slots were hidden by `onSetSlotSid(-1)`, and deletion of the originals is signalled implicitly (no `onDelCharactorSlot`): the client treats the hidden slots as gone after `onTradeSuccess`/refresh (**unverified**; H5 should push `onDelCharactorSlot` per sent item to be safe, matching `inventory/pushes.ts`).
8. `tradeAddItem/RemoveItem/SetMoney`: no-op stubs (`exchange.go`), Flash never calls them. Do not port.

### 7.3 Port notes
```ts
// server/src/modules/trade/trade.service.ts  (new module; in-memory Map<tradeId, Session> + Map<charId, tradeId>)
newTrade(a: Session, bId): { flag: boolean; info?: string; tradeId?: number }  // checks above; push onRequestTrade to b; action state 4 to both
lock(charId, offer)  // validate against Mongo (money/gold from character, items from character_items with slotType bag && !isBound)
confirm(charId)      // both locked + both confirmed -> swap under withCharLocks([a,b]); on error -> onTradeFail + restore slots
onDisconnect(charId) // stopTrade (restore, onStopTrade to the peer, state 1)  -- Go lacks this
```
Pushes already available in H5 `inventory/pushes.ts` (`onAddCharactorSlot`, `onDelCharactorSlot`, `onSetSlotSid`?, `onUPP`): confirm `onSetSlotSid` exists before relying on it (**unverified**).

## 8. Lines and other-player info

### 8.1 Lines
- `getLineInfo()` (`handlers/auth/characters.go:17-33`): re-sends the character list callback if a char service is wired, then returns an array of `{id, name, url, clients (online count of that channel), max, status (10 open, 20 offline/maintenance), auction, guild}` from the DB-backed gateway line table (`infrastructure/rtmp/db_line_provider.go:26-56`). Marks the connection as having confirmed the line list (`connection_rpc.go:166-180`). Rate limit 10 s.
- `changeLine(lineId)` (`auth/misc.go:71-139`): moves the connection to channel `lineId` inside the same map: `onCharLeaveScene(cid)` to the old (line,map) room, join the new one, update presence, broadcast `onScenePlayerEntered {id,name,gender,classId,level,pmLevel,posX,posY,posMapId,resCode,iconCode,vipT:0,SpeT:0,t:0}` to the new room, reply push `onChangeLine(lineId)`. No capacity/status check, no group handling (group follower on another line still gets group pushes, since lookup is global).
- Scenes in Go are keyed by `(channelId, mapId)`; chat local/scene broadcasts, `onCR` etc. are per line. **H5 runs one process, one line**: implement `getLineInfo` returning a single line (`status 10`), `changeLine` as an ack push `onChangeLine(id)` with no scene change. Exact H5 client expectations are a client-side concern (unverified).

### 8.2 Player info view
- `showChaInfo(..., charId)` (`auth/characters.go:35-67,258-308`): the char id is the **last numeric arg** (`lastInt64Arg`). Offline -> push `onViewChar(null)` and return `null`. Online -> returns `{data, guild, equipActiveList, equiptList, ee, en, ef, pmLevel, newGrade:0, achLog:{}, totalAchPoint:0}`. `data` = full `Character.ToDTO()` (`domain/character/character.go:802-872`) plus `cl, qn, t:0, chival:0, pop, gmLevel:0 (masked), expRe, newGrade:0, questLog (string), imgCode`. **Over-exposure**: `ToDTO` includes `money, moneyBind, gold, goldBind, posMapId/X/Y, attLastPoint`, all event currencies, etc. for any online player. H5 should whitelist: `id,name,classId,gender,level,exp,cl,qn,expRe,att*, hpMax/mpMax/spMax, pmLevel, imgCode, pop` + guild/equip.
- `getCharDetailData(charId?)` (`character/detail_data.go:13-39`): returns the 26-key detail rate payload of **any** character id (no ownership/online check). H5 already implements it for self (`server/src/modules/character/character-stats.rpc.ts:30`); extend to accept a target id only if the client UI needs it (unverified); safest is to restrict to self or online players.
- `createChatPanel/getChatPanel`: see 3.2.11 (exposes `classId`, cumulative `exp`, `iconCode` for any id).

## 9. Corrections to legacy memory docs (verified against code)
| Memory claim | Code reality |
|---|---|
| groupInvite does not append the target until `groupJoin` (`group-party.md:9`) | `Invite` appends immediately (`service.go:103`) |
| Leader leaves/disconnects -> `onGroupGiveLeader` + `onCR` | Only `onGroupLeave` (`membership.go:34`, `disconnect.go:44-47`) |
| Collapse sends `onGroupLeave` + `onSetTeamLeague(cid,0)` | Only `onGroupDismiss`; `onSetTeamLeague` and `onGroupCantJoin` do not exist in Go |
| `groupGiveLeader` returns Boolean | returns `{success, group}` object (`leadership.go:75`) |
| Disconnect removes only that member's deadline | `main.go:377` clears all battle deadlines |
| `getCharStateClient` returns real state | overwritten by a nil stub (`stub/handler.go:25`) |
| groupListOfMap lists groups per map | `Group.MapID` never set -> empty for mapId != 0 |
| Friend blocks wire type `2` equals domain `1` | confirmed (`client_contract.go:53-74`, `relationship.go:70-79`) |

## 10. Port plan pointers (H5)
- New modules: `server/src/modules/group/{group.module,group.rpc,group.service}.ts` (in-memory `Map`, mirrors `service.go`; pending-invite map is an H5 improvement), `social/{social.rpc,social.service,friendship.schema}.ts`, `trade/{trade.rpc,trade.service}.ts`. Shared types in `packages/shared/src/` (`group.ts`, `social.ts`, `trade.ts`) re-exported from `index.ts`.
- Reuse: `SceneManager.findByCharacter` for pushes; `Session.callback`; `modules/inventory/char-lock.ts` for swap atomicity; `BattleManager` extended per section 5; `scene.rpc.ts` `udcp/udcr` must (a) reject non-leader non-AFK members, (b) attach `mList` to the leader's `onCR`, (c) sync member positions; `scene-transport.service.ts` must call a `followLeader` hook for non-AFK, non-battling members (rule 4.2.15); `onScenePlayerEntered` payload gets `inGroup,isLeader,groupAfk,mList`.
- Disconnect hook order (Go): combat cleanup -> presence -> group leave. Add trade stop (Go lacks it).

## 11. Unverified / open questions
1. `groupRequest` arg order on the wire (two Flash args vs Go reading `args[0]`); verify with a real client capture before relying on `args[0]`.
2. Whether Flash `giveLeaderResult` accepts the `{success,group}` object (memory doc claims Boolean); Go returns an object (`leadership.go:75`).
3. Watcher cleanup on disconnect (`battle.Watchers` removal) was not traced; only the queued-leave path was read.
4. Whether any path re-arms battle deadlines after a timeout round (`application/battle/service.go:196-250` does not).
5. Whether the client removes traded items from the bag from `onTradeSuccess` alone (no `onDelCharactorSlot` is sent by Go).
6. `logout`/back-to-char-select group and trade cleanup (`BackToCharSelect` in `auth/misc.go`, not read) - does it call the disconnect handler?
7. Mongo transaction support for the trade swap (replica set not confirmed for `docker/docker-compose.yml`).
8. H5 chat channel numbering/push name (`onChat`, 1/2) vs Flash/Go (`onSay`, 0/1): decide whether the H5 DOM client keeps its own contract (`protocol.ts:169`) or moves to the legacy one; this research assumes the legacy values when "channel N" is mentioned.
9. `data_tbl_item_template.tradable` semantics for the Flash UI (the client may block double-click on non-tradable items client-side; not traced).
10. Pet participants in group battle (positions 15..19, pet exp share) are out of M3 scope and only noted.

## 12. Confirmed negatives
- No friend request/confirm flow, no `refuseToAddFriend`/`acceptTeacher` handlers, no friend online/offline push, no friend cap.
- No blacklist enforcement on the server (chat, whisper, invite, trade, friend add).
- No chat cooldown/length/profanity checks other than the dispatcher's 1100 ms limit; no GM relay for `chatGM`.
- No invite TTL, no distance/level/league/battle gating on group invite/join, no `onGroupCantJoin`, no team overhead badge push.
- No trade timeout, distance, level, blacklist or `tradable`-column checks; no trade cleanup on disconnect; pet trading unsupported; `tradeAddItem/RemoveItem/SetMoney` are stubs.
- No spectator watchers in PvE group battle (watchers = participants).
