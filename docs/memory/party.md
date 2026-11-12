# Party (tổ đội) and group battle

Plan: `docs/plans/2026-11-04_04_MULTIPLAYER.md` (phases B and C; see its implementation notes). Implemented 2026-11-04.

## Contract (shared `party.ts`)
- RPCs, none quiet:
  - `groupInvite(cid)`, `groupJoin(inviterCid)`, `groupRequest(..., targetCid)`: these three are `forbidInBattle`. `groupRequest` reads the **last** numeric arg.
  - `groupReqDeny(cid)`, `groupAdd(cid)` → boolean.
  - `groupLeave`, `groupKick(cid)`, `groupGiveLeader(cid)` → boolean.
  - `groupAFK()` / `unGroupAFK(near)` → `{cid}`.
- Pushes: `onGroupInvited`, `onGroupRequest`, `onGroupDeny` / `onGroupRequestDeny` `{cid, name}`, `onGroupCantJoin(cid, code)`,
  `onGroupJoined {groupCharactorList, groupAKFCidList, mList, members}`, `onGroupLeave`, `onGroupDismiss(mList)`, `onGroupGiveLeader`,
  `onGroupAfk`, `unGroupAfk`.
  - H5-only `onGroupFlag({cid, inGroup, isLeader, groupAfk})` is broadcast to the map. Flash has no such handler; `onSetTeamLeague` is the unrelated league badge.
- `SceneCharacter` carries `inGroup`, `isLeader`, `groupAfk`.

## Rules (`modules/party/party-rules.ts` `PartyBook`, in memory)
- At most 5 members, leader first.
- Invites and requests are pending for 60 s (lazy expiry). The party is created when the invite is **accepted**; Go added the target at once.
- The leader leaving passes leadership to the next member. At 1 member the party is disbanded.
- Disconnect and `backToCharSelect` count as leave (`GameGateway.onCharacterLeave`).
- Followers:
  - Non-leader, non-AFK members cannot walk, click NPCs or click gates; `udcp` is refused with a note, and `sceneChange` / `gmGoMap` are forbidden.
  - The server stores their position as the leader's. Clients animate a 45 px trail (`PartyController.tick`).
  - When the leader changes map (`SceneTransportService.moveToMap`), followers that are not AFK and not fighting are taken along.
  - Followers do not send `cbom`.
  - The auto-say "Nhóm trưởng, đi nhanh nào." goes to team chat, at most every 3 s.
- AFK: the member walks freely and is not taken along. Return needs ≤ 300 px from the leader on the same map (the item 3552 remote return is not ported).
  The leader cannot go AFK. A joiner on another map starts AFK.
- HUD `ui/hud/teamBar.ts`: tiles with portrait, name, level, crown, AFK tint. There are no HP/MP bars (same as Flash). The system-bar T key is still not wired.

## Group battle (phase C, `modules/combat/roster.ts`, `group-loot.ts`)
- A random encounter is rolled for the leader only. The roster is non-AFK, online, same-map members with HP > 0 that are not in a battle, max 5, at slots 10..14.
- Enemy count by roster size: 1 → 1–2, 2 → 2–4, 3 → 3–5, 4–5 → 4–5.
- Rounds:
  - The round runs when every alive, connected player character has submitted.
  - `onCmdReady(slot)` goes to all participants as commands arrive (group battles only).
  - A second command in the same round is rejected.
  - The 30 s timeout fills missing commands for everyone.
- Flee by anyone ends the battle for all (result 2, no rewards).
- Rewards: computed with the leader's level, floor-split among survivors. Loot is round-robin per drop with per-recipient quest eligibility. Kill credit goes to survivors.
  Each member gets their own report, `onUPP`, and their own `battlePlayEnd` pushes.
- Disconnect: the leaver's HP/MP are saved, a leave-escape is queued (it runs at once if nobody else is missing a command), and the battle continues.
- Quest-battle NPCs stay solo.
- Not browser-tested with two real players at once (only a scripted leader plus one browser tab); 3+ member battles not tested.

## Deferred
`groupListOfMap`, `getGroupMemberPosistion`, `getCharLeaderClient`, the remote AFK return book, the safe-area walk on leave, pets in party battles.
Quiet the new RPCs after the user confirms.


## M14 phase F: team rooms ("Chiêu mộ nhóm") and group leftovers (2026-11-12)
Plan: `docs/plans/2026-11-04_17_SOCIAL_PVP.md` §2.5 / §3.8 / §11. Shared `room.ts` (`ROOM`, `RECRUIT_CATALOG` fid 1-17, `ROOM_TEXT`, args / replies / pushes, `nextScheduledAt`, `validateRecruitWill`, `roomExpired`).

### Server (`modules/party/`)
- A room is a **party with a recruit ad**: `Party.room?: RoomAd {fid, type, minLevel, maxLevel, scheduledAt}` (memory only). `PartyBook` gained `createSolo`, `addToParty`, `partyById`, `allParties`; a room party **survives with one member** and dissolves when empty (`leave`).
- `room-rules.ts` `RoomBook` / `RoomManager`: 5 min create cooldown per leader, one pending application per applicant (10 min TTL, max 20 per room). `room.service.ts` orchestrates, `room.rpc.ts` is the RPC surface, `group-extras.service.ts` holds the leftovers. `PartyService` exposes `afterLeave`, `afterJoin`, `announce` and an `onLeave(hook)` list (RoomService hangs the bare-cid `onMemberLeave` / `onSetRoomHost` pushes on every leave, kick or disconnect).
- RPCs (none quiet): `createRoom({minLevel,maxLevel,fid,type,hour,minute})` -> roomNo (needs Lv 30; leader of the own party or a new one-member room; `forbidInBattle`), `getRoomList()` -> `{st, d[]}` (+ `onGetRoomList`), `getMyRoom()` -> `{f: 0|1|2, d?}` (+ `onGetMyRoom`; f 2 = pending application), `applyToRoom(roomNo)`, `acceptRoomApply(cid)`, `kickRoomMember(cid)`, `leaveRoom()` (an applicant just cancels), `setRoomHost(cid)` -> boolean, `setRoomConfig({...})`, `roomChat(text)` (chat module, 55 chars, gated by the chat ban), `groupListOfMap(mapId)`, `getGroupMemberPosistion(cid)` (sic; own party only), `getCharLeaderClient(cid)`, `reqAddGroup(leaderCid)` (forwards to `groupRequest`), `groupReqSuccNotice` (null).
- Pushes: `onCreateRoom(roomNo)`, `onApplyToRoom()`, `onApplyListChange {f, d, leaderId}` (+ a note), `onAcceptRoomApply(cid)` after `onGroupJoined`, `onKickRoomMember(row)` to every pre-kick member (the kicked get no `onMemberLeave`), `onMemberLeave(cid)` (a bare number, the legacy panel bug fixed), `onSetRoomHost(cid)`, `onSetRoomConfig {fid, type, minLevel, maxLevel, time}`, `onRoomSay [cid, name, text]`, and an H5 `onGetMyRoom {f:1, d}` refresh to every member after each change.
- Decisions: refusals are `RpcException.forbidden(note)`; applying only checks the minimum level (as Go); the ad expires 30 min after `scheduledAt`: the ad is removed (members stay a normal party, a lone leader's party is dissolved) with `ROOM_TEXT.EXPIRED` + `onGetMyRoom {f:0}` (a 20 s sweep); `setRoomHost` follows `groupGiveLeader` (same map, not AFK).

### Client
`game/RoomController.ts` + `ui/groupRecruit/*` (board with type filter, "Nhóm của tôi", create / update dialog, room chat). Entry: the "Chiêu mộ" button under the portrait and the own tile's menu. The tile menu has "Vị trí" (`getGroupMemberPosistion`, 1.1 s throttle). Map names come from `getTransportMaps` only (other maps show "Bản đồ <id>").

### Verified / not
ws smoke (2 accounts + 1 applicant, all flows above) and a browser run (create, applicant list, accept, room chat, member leave). Not verified: config / kick / host dialogs in the browser, expiry sweep live (only `roomExpired` unit-tested). Quiet the new RPCs only after the user confirms.
