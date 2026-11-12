# Social: whisper, private chat, player menu, player info, friends, blacklist, enemies and intimacy

Plan: `docs/plans/2026-11-04_04_MULTIPLAYER.md` (phases A and D; see its implementation notes). Implemented 2026-11-04.
Research: `docs/research/2026-11-04_05_MULTIPLAYER_CLIENT_RESEARCH.md`, `..._06_MULTIPLAYER_SERVER_RESEARCH.md`. Chat channels are in `chat.md`.

## Whisper and private chat
- `wisper(name, text)` matches the **exact** online name (Go used a longest prefix).
  - The target and the sender both get `onWisper {sourceIdType: 2, id, name, targetName, msg, self}`.
  - An offline target gets a note.
- `p2pWisper(text, targetId)`: the target gets `onP2pWisper(text, senderId, senderName)`; there is no sender echo. Offline target → `onP2pWisperError(targetId)`.
- The window `ui/privateChat.ts` opens on an incoming message.
- `/w` splits on the first space, so names containing spaces are reachable only through the menu.

## Player menu and info
- Clicking a peer entity opens `ui/playerMenu.ts` with Thông tin, Chat mật, Chat riêng, Mời lập nhóm, Xin vào nhóm, Kết bạn, Giao dịch. Ctrl+click prefills `/w`.
- `showChaInfo(cid)` returns the whitelisted `ChaInfo` (identity, level, `equiptList`, `property`); money and position are not exposed. An offline id throws `notFound`.

## Friends and blacklist (phase D)
- Mongo `relationships` (counter `relationships`, unique characterId + targetId), type 1 friend / 2 black. One-directional, immediate, caps 120 / 30.
- RPCs, none quiet:
  - `initViewImC()` → `onInitViewImC({friend, black})`. The `data` field appears only when the target is online (snapshot; there is no presence push).
  - `addRelationByName(name, type)` → `onAddRelationship`, or `onAddRelationByName(-1, type)` for an unknown name.
    Other refusals (self, duplicate, full, bad type) are toasts.
  - `delRelationship(id)` → `onDelRelationship`.
  - A friend ↔ black conflict swaps the row (del + add); Flash showed an alert instead.
- Client:
  - `game/FriendController.ts`, `ui/friendPanel.ts` ("Hảo hữu", opened by the HUD "Giao lưu" button or key K): tabs Bạn bè / Sổ đen, add by name, shortcuts.
  - The blacklist filter drops `onSay`, `onWisper` and `onP2pWisper` by sender id. It is loaded at scene start.

## M14 phase A: relationship types, friend request, intimacy (2026-11-12)
Plan: `docs/plans/2026-11-04_17_SOCIAL_PVP.md` §2.1 / §3.1-3.3 / §7 A. Legacy: `E:\mcgame\docs\memory\social-relationships.md`, Go `application/social/*`, `handlers/social/*`, `handlers/item/intimacy_item.go`.

- Wire types (shared `social.ts`): 1 friend, 2 black, 3 enemy, 4 couple, 5 tutor, 6 brother. Caps friend 120, black 30, enemy 100 (others uncapped). `RelationEntry.intimacy` (per direction, default 0; rows written before M14 have no field and read 0). `InitViewImC` = `{friend, black, enemy, couple, tutor, brother}` (newest first).
- Server `modules/social/`:
  - `relationship-rules.ts` (pure): `planAdd`, `refusalText`, `planDelete`, `hasBond`, `applyIntimacy` (floor 0), `setCloseNum`. `intimacy-rules.ts`: `TeamThrottle`, `tickTargets`, `giftPlan`.
  - `relationship.service.ts`: reads + `addByName` + `remove` + the feature API below. `friend-request.service.ts`, `intimacy.service.ts`, `relationship.rpc.ts`.
  - The collection keeps its unique (characterId, targetId) index: one row per pair and direction. Go let enemy and black coexist; H5 swaps enemy <-> black like friend <-> black (decision).
- RPCs (none quiet): `addRelationByName(name, 1..3)`, `delRelationship(id)`, `initViewImC`, `refuseToAddFriend({targetId, selfName})`, `getFriendList`, `getBlackList` (arrays of `RelationEntry`), `useIntimacyItem(targetName, qty, templateId)` (`forbidInBattle`, reply `{success: true}`).
  - Types 4..6 by name are `invalidArgs`. Refusals are `RpcException.forbidden(note)` toasts (Go texts): duplicate per type, "Người này đã có quan hệ khác với bạn, hãy xóa quan hệ cũ trước!" (friend / enemy / couple / tutor / brother exclude each other; couple / tutor / brother also refuse a black add), "Danh sách đã đạt giới hạn N người, vui lòng xóa bớt trước khi thêm!".
  - `delRelationship` of a type 4..6 row: "Hãy giải trừ quan hệ ở chức năng tương ứng".
- Friend request: after a friend add the server pushes `onBeFriendOfOther {id, otherId, name, alreadyFriend}` to an online target (`alreadyFriend` = target holds friend / couple / tutor / brother row toward the requester; a target who blacklisted the requester gets nothing). `refuseToAddFriend` is silent unless the requester really holds a friend row toward the refuser, then `onRefusedToAddFriend {id, name}` goes to the requester. Offline targets get nothing; the requester's row stays.
- Intimacy:
  - `onSetClose(otherId, otherName, num)`: num > 0 new total, num < 0 a drop by -num, 0 reset.
  - Only friend / couple / tutor / brother rows grow (enemy and black never).
  - Gift items 32 / 1303 / 1302 / 1315 = +660 / +60 / +60 / +660 per unit to both directions. Check order: unknown name -> self -> not a bond row -> "Không đủ vật phẩm." -> consume (bag pushes `onAddCharactorSlot` / `onDelCharactorSlot`) -> add -> `onSetClose` to the online sides (spend before credit, under the character lock). Qty 1..9999.
  - Team: +6 per player, one claim per 55 s (`TeamThrottle`, shared by both sources). Sources: a won PvE group battle (`BattleHooks.onAnyEnd`, toward the other non-left members, no combat edit needed) and a 60 s online-party tick (non-AFK online members only). The claim is taken even when no row exists (Go). Stale stamps are dropped on disconnect / character leave.
- Internal API for mentor / brotherhood / marriage (`RelationshipService`, exported with `IntimacyService`):
  - `link(a, b, type)` writes both directions (creates or converts, keeping each side's intimacy; refuses a pair where a black row exists).
  - `convert(a, b, type)` retypes existing non-black rows. `unlink(a, b)` deletes non-black rows. All three lock both characters in ascending id order under `rel:<id>` keys (not the bag lock, so callers inside `withCharLock` are safe).
  - `addIntimacy(owner, other, delta)` (one direction, null when no bond row, pipeline update with floor 0), `resetIntimacy(a, b)` (divorce), `announce(changes)` (`onSetClose`), `get(owner, target)`, `hasBond`, `list`, `snapshot`, `pushSnapshot(characterId)` (`onInitViewImC` to an online character).
- Client:
  - `ui/friendPanel.ts` (shell, pluggable tabs via `registerTab(spec)` / `FriendController.registerTab`) + `ui/im/imTabs.ts` (specs: Bạn bè, Kẻ thù, Sổ đen, Sư đồ, Kết bái; the last two are plain read-only lists of the tutor / brother rows until phases B / C supply a `renderBody`) + `ui/im/imList.ts` (rows with ♥ intimacy, action bar) + `ui/im/intimacyGift.ts` (name + quantity dialog).
  - `game/FriendController.ts`: Yes/No prompt for `onBeFriendOfOther` (a note toast when `alreadyFriend`; ignored for blacklisted senders), `onRefusedToAddFriend` toast, `onSetClose` -> `chat.notice(setCloseLine)` + row update. `FriendHost` gained `chat` (one-word edit in `GameScene.ts`).
  - Bag double-click on 32 / 1302 / 1303 / 1315 goes through `ItemFuncs.handle` -> gift dialog -> `useIntimacyItem`.

## M14 phase B: mentor
Sư đồ (`mentor_links`, rank row, NPC 49, IM tab) is documented in [mentor.md](mentor.md). It uses `RelationshipService.link / convert / unlink / pushSnapshot` and replaces the plain Sư đồ tab through `registerTab`.

## M14 phase C: brotherhood
Kết bái (`brotherhoods` / `brotherhood_members`, ceremonies, title 153 + `broT`, NPC 1637, IM tab) is documented in [brotherhood.md](brotherhood.md). It uses `RelationshipService.link / convert / addIntimacy / announce / pushSnapshot` and replaces the plain Kết bái tab through `registerTab`.

## M14 phase D: marriage
Kết hôn (`marriages`, seek board, proposals, couple rows type 4, `onInitCouple`, rank, divorce card, Cupid NPC marriage, IM couple header) is documented in [marriage.md](marriage.md). It uses `RelationshipService.link / convert / unlink / resetIntimacy / announce / pushSnapshot` and the new `addSnapshotListener` (runs after every `initViewImC` answer; marriage pushes `onInitCouple` there).

## Deferred
Teacher/student is done in M14 B (see [mentor.md](mentor.md)); live presence, the guild channel, `getChatPanel` header (Track 2). Enemy revenge items and auto-adding enemies on PK (plan §8 non-goals).
Quiet the new RPCs after the user confirms.
