# Multiplayer (M3): chat channels, player menu, party, group battle, friends, trade — Implementation Plan

**Date**: 2026-11-04 · **Status**: Approved (2026-11-04, including the H5 decisions marked in §1)
**Goal**: players can talk on the local, world and team channels and whisper. Clicking another player opens a menu
(info, whisper, invite to party, add friend, trade). Up to 5 players form a party:
- the leader leads, members follow on the map and through portals;
- the team shows on the HUD;
- members fight random encounters together, with a shared round and a reward split.

Players keep a friend list and a blacklist, and two players can trade items and money. Today there is only local/global chat
(H5 ids, push `onChat`) and nothing else social.

Delivered in **five phases**, each implemented, lint/test-verified and browser-checked (with two browser tabs / two accounts) before the next one:
- **A**: chat channels, whisper, player menu, player info.
- **B**: party.
- **C**: group battle.
- **D**: friends and blacklist.
- **E**: trade.

Research base (the implementer reads both):
- `docs/research/2026-11-04_05_MULTIPLAYER_CLIENT_RESEARCH.md` — Flash contract: target menu (§1), chat channels/RPCs/limits (§2),
  party RPCs/pushes/mList/HUD (§3), group battle client (§4), friends `initViewImC` (§5), trade panel (§6), lines (§7), strings.
- `docs/research/2026-11-04_06_MULTIPLAYER_SERVER_RESEARCH.md` — Go rules with stale-memory corrections: chat (§chat), party state machine,
  transport follow, AFK, group battle roster/rounds/rewards/disconnect, friends tables, trade state machine and swap, lines, showChaInfo.
- `docs/memory/chat.md`, `combat.md`, `inventory.md`, `movement.md`, `portal.md`.

## 1. Confirmed mechanics

*(H5)* marks a deliberate deviation or a gap we fill.

### 1.1 Chat (phase A)
- Legacy channel ids (Flash and Go): 0 local, 1 world, 2 guild, 3 team, 4 whisper, 5 area, 6 headline, 9 rumour. Push `onSay {channelId, id, type, name, cname, msg, pmLevel}`.
  - *(H5)*: re-align the shared `ChatChannel` to the legacy ids and rename the push `onChat` → `onSay`, per the "names from the Flash client" rule.
  - `say(channelId, msg)` keeps the H5 two-arg shape (the legacy `selfId, 2` prefix carries nothing the session doesn't know).
  - Existing client/server code using `ChatChannel.LOCAL/GLOBAL` and `onChat` is updated in the same phase.
- Local (0): sent to the map, including the sender (as today).
- World (1): sent to everyone. Requires item 719 "Loa", consuming 1. Go broadcast even without a Loa (bug).
  - *(H5)*: refuse with the Flash "need Loa" string (client research §2).
  - The client-tracked "1 free per 5 min at level ≥ 10" becomes a server rule: level ≥ 10 and 5 min since the last free world message → free; otherwise consume a Loa;
    otherwise refuse.
- Team (3): sent to the online party members on any map. Not in a party → note "Bạn chưa có nhóm" (or the Flash string if one exists).
- Guild (2), area (5), headline (6), rumour (9): refused, "chưa hỗ trợ". Guild is M6.
- Server rate limit: 1100 ms per character for `say`, `wisper` and `p2pWisper` combined; message length ≤ 500.
- `wisper(targetName, text)`: the target is looked up by exact name among online characters. *(H5)*: Go used a longest-prefix match; exact is safer.
  - The target receives `onWisper` and the sender gets an echo, both with `sourceIdType: 2` (the Flash client formats only that).
  - Offline or unknown target → note "Người chơi không trực tuyến" (Flash string if present).
  - The client parses `/w <name> <text>`.
- `p2pWisper(text, targetId)` (private chat window): the target receives `onP2pWisper(text, senderId, senderName)`; there is no echo.
  An offline target gets `onP2pWisperError(targetId)`. Private text ≤ 55 chars. *(H5)*: plain text; the legacy HTML payload is not used.
- Blacklist (phase D) is client-side, as in legacy: `onSay`, `onWisper` and `onP2pWisper` from blacklisted ids are dropped.

### 1.2 Player menu and info (phase A)
- Clicking another player's entity opens a menu (H5 DOM, replacing the radial TargetCanvas) with:
  - Thông tin → `showChaInfo(cid)`;
  - Chat mật → prefill `/w name `;
  - Chat riêng → private chat window;
  - Mời lập nhóm → `groupInvite` (B);
  - Xin vào nhóm → `groupRequest` (B; only when the target is in a party and you are not);
  - Kết bạn → `addRelationByName(name, 1)` (D);
  - Giao dịch → `newTrade` (E).
  - Watch, assassinate and PK are out of scope.
- `showChaInfo(cid)` returns a **whitelisted** view: id, name, classId, gender, level, iconCode, equipped items (`BagItem[]`, equip sids 1..22) and `property`
  (final stats). *(H5)*: Go exposed money, gold and position.

### 1.3 Party (phase B)
- At most 5 members, leader first. In memory only (lost on restart).
- *(H5)* invite flow:
  - `groupInvite(cid)` creates a **pending invite** (60 s) and pushes `onGroupInvited({cid, name, level, dis?})` to the target (`dis: "far"` when on another map).
  - The target accepts with `groupJoin(inviterCid)` or declines with `groupReqDeny(inviterCid)`, which pushes `onGroupDeny(cid)` to the inviter.
  - Go added the target at once (stale design); the Flash UI has an accept dialog, so acceptance is the intended flow.
  - The inviter creates the party if they had none. Inviting someone already in a party → `onGroupCantJoin(cid, code)` with the Flash codes (10/20/30, client research §3).
- `groupRequest(selfCid, targetCid)`: a player without a party asks the target's leader. *(H5)*: read the **last** numeric arg as the target (Go/Flash disagree).
  - The leader gets `onGroupRequest({cid, name, level})`.
  - `groupAdd(cid)` accepts (returns boolean); `groupReqDeny(cid)` declines (`onGroupRequestDeny`).
- Joining pushes `onGroupJoined({groupCharactorList, groupAKFCidList, mList})` to every member (the `AKF` typo is kept).
  - `mList` is the linked list `{head: {obj, next}, len}`, leader first. The H5 client may also read a flat array the server adds as an H5 extension `members`.
- `groupLeave()`, `groupKick(cid)` (leader only), `groupGiveLeader(cid)` (leader only, returns boolean).
  - When the leader leaves or disconnects, the next member becomes leader.
  - When the party drops to 1 member it is disbanded with `onGroupDismiss(mList)` to everyone. Otherwise `onGroupLeave(cid)` / an updated `onGroupJoined` go to the remaining members.
  - *(H5)*: on a leader change, send an updated `onGroupJoined` to all members (Go sent only `onGroupLeave`).
- Movement:
  - Non-leader, non-AFK members cannot move: their `udcp`/`udcr` are refused with a note, and the client blocks map clicks ("Nhóm trưởng, đi nhanh nào." auto-say in channel 3, Flash).
  - The leader's moves are relayed: each non-AFK member on the same map follows the leader's path with a 45 px gap. *(H5)*: the client of each player animates followers from the leader's `onCR`;
    the server stores member positions as the leader's.
  - When the leader changes map (portal or `toSafe`), every non-AFK, non-battling member follows to the same map and landing point.
- AFK: `groupAFK()` and `unGroupAFK(near: boolean)` both return `{cid}`. An AFK member moves freely and does not follow or join battles.
  Return needs to be within 300 px of the leader on the same map (*(H5)*: remote return with item 3552 is not ported).
- Scene payloads (`createChars`, `onScenePlayerEntered`) gain `inGroup`, `isLeader`, `groupAfk` so others see the leader flag. *(H5)*: membership changes are broadcast to the map
  as `onSetTeamLeague({cid, isLeader, inGroup})`. Go had no such push; the H5 name follows the Flash team-flag handler.
  The implementer checks the client research for the real handler name and records the choice.
- HUD: team tiles (portrait, name, class, level, AFK tint). There are no HP/MP bars in Flash; the H5 tiles may show them as an extension if cheap.
- Cleanup on disconnect or `backToCharSelect`: treated as leave.

### 1.4 Group battle (phase C)
- A random encounter (`cbom`) is rolled only for the leader (or a solo player). Members' `cbom` are ignored.
- The roster is non-AFK, online, same-map members with HP > 0 and not in a battle, leader first, max 5, at slots 10..14.
- Enemy count by roster size: 1 → 1–2, 2 → 2–4, 3 → 3–5, 4–5 → 4–5, capped by the distinct non-boss rows.
- `onSetCharState(5)` and `onBattleStart` go to every participant. Every teammate's map entity must be known to each client, which is true since they share the map.
- A round runs when every **alive** player character has submitted. Earlier submitters wait.
  - `onCmdReady(slot)` is pushed to all participants as each command arrives, so their "wait" icon clears.
  - The playlist goes to all participants.
- Timeout: 30 s; missing commands become `-40` for all missing members in one round.
- Flee by any member ends the battle for all with `result 2` and no rewards (Go).
- Rewards: exp and money are computed with the **leader's level** and split with floor division among surviving characters.
  - Loot is rolled once per enemy and handed round-robin to the eligible survivors (quest-item rules per recipient).
  - Kill credit goes to every surviving member's matching quests. Dead members get nothing (Go).
  - Each client sends its own `battlePlayEnd`; pushes are per recipient.
- Disconnect: the leaver is marked fled/dead for the battle (HP persisted). *(H5)*: if no live command is still missing, the round runs immediately (Go stalled).
  The battle continues for the others.
- Quest-battle NPCs (`clickNpc`): only the clicker fights (solo), as in Go.

### 1.5 Friends and blacklist (phase D)
- Relationship types: 1 friend, 2 black (3 enemy, 4 couple, 5 tutor, 6 brother not ported). Caps: friends 120, black 30.
- One-directional and immediate (no request/confirm):
  - `addRelationByName(name, type)` → `onAddRelationship(entry)`, or `onAddRelationByName(-1, type)` when the name does not exist ("Người chơi này không tồn tại!").
  - Adding a friend removes a black row for the same target and vice versa.
- `delRelationship(id)` → `onDelRelationship(id)`.
- `initViewImC()` is fire-and-forget; the reply is `onInitViewImC({friend: [...], black: [...]})`.
  - Each entry is `{id (row id), cid, name, level, classId, iconCode, data?}`, where `data` is present only when online (the Flash online marker).
  - Snapshot only; there is no live presence push (Go). *(H5)*: the panel re-requests on open.
- Persisted in a Mongo `relationships` collection `{_id (counter 'relationships'), characterId, targetId, type, createdAt}`, unique (characterId, targetId).
  One id sequence, which fixes Go's colliding sequences.
- Not added to the H5 roadmap now: teacher/student, enemies, couples.

### 1.6 Trade (phase E)
- `newTrade(cid)` → `{flag, info}`:
  - Both players must be online, on the same map, not in a battle, not already trading, and different characters.
  - It creates the session for both and pushes `onRequestTrade(cid, name)` to the target, whose panel opens; there is no accept step (Flash and Go).
- `tradeLock({money, gold, items: itemId[]})` → `{flag, info}`:
  - Validate: at most 5 items, all owned, unbound, in the bag (slotType 0), not equipped; money/gold ≤ the unbound balances; `petIds` ignored.
  - Lock that side, push `onTargetLock({money, gold, itemList: BagItem[], petIds: []})` to the other side.
  - Re-locking resets both confirmations.
- `tradeConfirm(code)` → `{flag, info}`: requires both sides locked. *(H5)*: the protection-code arg is ignored (no secondary password).
  - The first confirm pushes `onTargetConfirm()` to the other side. The second confirm executes the swap.
- Swap (*(H5)*: no Mongo transactions, the server is standalone without a replica set). Under both per-character locks, acquired in ascending id order:
  1. Check bag space for both.
  2. Debit money with conditional `$inc` on both sides.
  3. Move each item row by conditional update (`characterId`, slot) to the receiver's free slot indexes.
  4. Credit money.
  - Any failure compensates in reverse and results in `onTradeFail(msg)`.
- Success pushes, to each side:
  1. `onDelCharactorSlot` for items given;
  2. `onAddCharactorSlot` for items received;
  3. `onAddMoney` / `onUPP` for money;
  4. `onTradeSuccess()`.
  - *(H5)*: Go skipped the slot pushes.
  - Failure: `onTradeFail(msg)` to both, then the session ends.
- `stopTrade()` → `onStopTrade()` to the other side. Disconnect, battle start or map change also stop the trade. *(H5)*: Go never cleaned up.

### 1.7 Lines
Out of scope: H5 runs one process. `getLineInfo`/`changeLine` are not registered.

## 2. Shared contract

New files `packages/shared/src/social.ts` (chat, menu, relationships), `party.ts` and `trade.ts`, re-exported from `index.ts`.
The implementer writes the exact interfaces from §1 (field names as listed there and in the research docs). The binding names are:

- Chat:
  - `ChatChannel = { LOCAL: 0, WORLD: 1, GUILD: 2, TEAM: 3, WHISPER: 4, AREA: 5, HEADLINE: 6, RUMOUR: 9, SYSTEM: 99 }`. `SYSTEM` is H5-local; check that the existing system-message use doesn't collide.
  - `SayPush {channelId, id, type, name, cname, msg, pmLevel}`, `WisperPush {sourceIdType, id, name, targetName, msg, self: boolean}`.
- `ChaInfo` (whitelisted `showChaInfo` reply).
- Party:
  - `GroupMember {cid, name, level, classId, gender, iconCode, isLeader, afk, mapId}`;
  - `MList {head: MListNode | null, len}` and `MListNode {obj: GroupMember, next: MListNode | null}`;
  - `GroupJoined {groupCharactorList: GroupMember[], groupAKFCidList: number[], mList: MList, members: GroupMember[]}`;
  - `GroupInvited {cid, name, level, dis?: 'far'}`.
- `SceneCharacter` gains `inGroup: boolean; isLeader: boolean; groupAfk: boolean`.
- `RelationEntry {id, cid, name, level, classId, iconCode, type, data?: {online: true}}`, `InitViewImC {friend: RelationEntry[], black: RelationEntry[]}`, `RelationType = {FRIEND: 1, BLACK: 2}`.
- Trade: `TradeOffer {money, gold, items: number[]}`, `TradeReply {flag: boolean, info: string}`, `TargetLock {money, gold, itemList: BagItem[], petIds: number[]}`.
- `BattleCmdReady` (phase C): `onCmdReady(slot: number)` positional.

## 3. Design

### 3.1 State
- Party: an in-memory `PartyManager` (`server/src/modules/party/`) with `partyId → Party {leaderId, members[], afk:Set, invites}` and `characterId → partyId`.
  Pending invites expire after 60 s (checked lazily).
- Trade: an in-memory `TradeManager` (`server/src/modules/trade/`), with session `{a, b, offers, locked, confirmed}`.
- Relationships: Mongo `relationships` collection (§1.5).
- Chat: a per-character last-free-world-message timestamp in memory (*(H5)* resets on restart, which is acceptable).
- Every manager registers `gateway.onDisconnect` (as `CombatService` does) and hooks `backToCharSelect`.
- Restart story: parties and trades vanish (clients get no push; they see a fresh state on relog). Relationships persist.

### 3.2 Server modules
- `modules/chat/`: channel routing, rate limit, Loa consumption (through `InventoryService`), whisper and p2p. Keep files < 300 lines.
- `modules/social/`: `showChaInfo`, relationships (`initViewImC`, `addRelationByName`, `delRelationship`).
- `modules/party/`:
  - pure `party-rules.ts` (+tests: invite/accept/deny/expiry, leave/kick/leader transfer/disband, AFK, mList build);
  - `party.manager.ts`, `party.service.ts`, `party.rpc.ts`.
  - Movement integration in `scene.rpc.ts` (`udcp`/`udcr` refusal for followers, leader relay), and transport follow in the scene/portal transport service.
- Combat (phase C): `BattleManager` and `round.ts` handle N player fighters (round readiness, `onCmdReady`, per-recipient settle and rewards split, loot round-robin);
  the encounter in `CombatService` uses the party roster. Pure parts tested: roster selection, enemy count by size, reward split, readiness.
- `modules/trade/`: pure `trade-rules.ts` (+tests: validation, lock/confirm state machine, re-lock reset), `trade.manager.ts`, `trade.service.ts` (swap with compensation), `trade.rpc.ts`.
- All new RPCs un-quieted, `requireCharacter`; trade, party-invite and give-leader RPCs use `forbidInBattle` where it makes sense.

### 3.3 Client
- `ui/playerMenu.ts`: click on another player entity (`GameScene` / `Entity` hit test, the same as NPC clicks).
- `ui/chaInfoPanel.ts`: equipment grid plus stats; reuse `itemCell.ts` and the `characterPanel` CSS.
- `ui/chat.ts`:
  - send-channel selector Hiện tại (0) / Thế giới (1) / Đội (3);
  - `/w name text`;
  - tab filters mapped to the new ids;
  - whisper formatting;
  - `ui/privateChat.ts` window for `p2pWisper`.
- `game/PartyController.ts` + `ui/hud/teamBar.ts`:
  - invite/request dialogs;
  - team tiles with leader, AFK tint and a right-click/menu for leave/kick/give leader/AFK;
  - leader flag over entities;
  - followers trail the leader;
  - map clicks are blocked for followers.
- Combat client (phase C): multiple player units at slots 10..14, wait icons cleared by `onCmdReady`, and a menu only for the local player.
- `ui/friendPanel.ts` (HUD button / key from `systemBar` "Hảo hữu" if present): friend and black tabs, online marker, add by name, delete, whisper/invite shortcuts.
- `ui/tradePanel.ts`: two-sided grid (own 5 slots fed by bag drag/double-click, money/gold inputs, Khóa → `tradeLock`, Xác nhận → `tradeConfirm`, Hủy → `stopTrade`), the other side filled by `onTargetLock`.
- Keep `GameScene.ts` from growing (it is already about 427 lines); put new wiring in controllers, and extract from `GameScene` if you need to touch it heavily.

### 3.4 Touch points

| Phase | Files |
|---|---|
| A | shared `social.ts`, `protocol.ts` (`ChatChannel`, remove `onChat` use); server `modules/chat/*`, new `modules/social/*`, `app.module.ts`; client `ui/chat.ts`, `ui/privateChat.ts`, `ui/playerMenu.ts`, `ui/chaInfoPanel.ts`, `GameScene`/`Entity` click wiring |
| B | shared `party.ts`, `SceneCharacter` flags; server `modules/party/*`, `scene.rpc.ts` (movement), transport/portal service (follow), `character.rpc.ts` (`backToCharSelect` cleanup); client `game/PartyController.ts`, `ui/hud/teamBar.ts`, `Entity` leader flag + follow |
| C | server `modules/combat/*` (multi-fighter); client `game/battle/*`, `BattleController.ts`, `ui/battleMenu.ts` |
| D | shared `social.ts` relations; server `modules/social/relationship.*`; client `ui/friendPanel.ts`, chat blacklist filter |
| E | shared `trade.ts`; server `modules/trade/*`; client `ui/tradePanel.ts`, `BagController` hooks |

## 4. Non-goals
- Guild, area, headline and rumour chat channels (guild is M6). The chat-link item formatter (`chat-link-formatter.md`) is a later polish.
- Watch battle, assassinate, PK, rooms (`createRoom`…), teacher/student/enemy/couple/brother relations, `groupListOfMap` (Go returns empty), remote AFK return (item 3552).
- Lines (`getLineInfo`/`changeLine`), cross-server.
- Pets in trade or party battles, the trade protection code / secondary password.
- Live online/offline presence pushes for friends.
- Persisting parties across restarts.

## 5. Verification
1. Unit tests per phase: chat routing and world-chat rule; party rules (§3.2); group battle roster, enemy count, readiness, reward split; trade validation, state machine and swap planning.
2. `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test`. Baseline: shared 11, swf 4, server 162.
3. Browser: two accounts in two tabs (or one normal tab plus one second tab of the built-in browser), both on the same map:
   - **A**: local chat bubble seen by both; world chat refused without a Loa (then free at Lv ≥ 10); `/w` whisper both ways; the player menu opens on click; info shows the other player's gear.
   - **B**: invite → accept → team tiles on both. The leader walks and the member follows; the leader takes a portal and the member arrives too. The member cannot click-walk. AFK / return.
     Leave, kick, give leader, disband on the last leave. Team chat.
   - **C**: on map 3 the party meets 2–4 enemies. Both choose commands; the round waits for both (wait icons). The win splits exp/money. A flee ends the battle for both.
     Disconnecting one tab mid-battle lets the other continue.
   - **D**: add a friend by name (online marker), add to the black list (their chat is hidden), delete.
   - **E**: trade request opens on both. Lock offers; confirm on both; items and money swap and the bags update. Cancel. Bound items are refused.
4. Docs: new `docs/memory/party.md`, `social.md` (chat channels, menu, friends), `trade.md` (+ index lines); update `chat.md` and `combat.md` (group battle).

## Implementation notes (phase A)

Implemented 2026-11-04. Lint clean; tests shared 11, swf 4, server 172 (162 + 10 new in `chat-rules.test.ts`).
Browser-verified with two accounts on map 1 (see the report).

- Shared: new `social.ts` (`ChatChannel` with legacy ids + `SYSTEM: 99`, `ChatLimits`, `SayPush`, `WisperPush`, `P2pWisper`, `ChaInfo`);
  `ChatMessage` and the old `ChatChannel` were removed from `protocol.ts`. `ChaInfo.equiptList` keeps the Flash key spelling.
- Server: `modules/chat/` (`chat-rules.ts` pure + tests, `chat.service.ts`, `chat.rpc.ts`), `modules/social/` (`showChaInfo`),
  `SceneManager.onlineSessions()`. RPCs `wisper`, `p2pWisper`, `showChaInfo` are registered without `quiet`; `say` stays quiet.
  Server now registers 54 RPCs.
- Deviations:
  - `say` refusals (rate limit, no Loa, not in a party, unsupported channel) are `RpcException.forbidden`; the client shows the
    message as a toast from the rejected call. Whisper to an offline name is a note (`onSystemMidMsgOrNote`), not an error.
  - Team channel (3) is the phase-B stub: always refused with "Bạn chưa có nhóm" (`ChatService.sayTeam`).
  - Private chat window shows only the partner name (no `getChatPanel`/class/level header), and an incoming `onP2pWisper` opens the
    window straight away instead of the Flash blinking "unread" icon.
  - Player menu: "Xin vào nhóm" (needs party state) is omitted; "Mời lập nhóm", "Kết bạn", "Giao dịch" are greyed and toast
    "Tính năng đang phát triển". Ctrl+click prefills `/w name `.
  - `/w` splits on the first space (like Flash), so names containing spaces can only be reached through the menu or private chat.
  - `showChaInfo` to an offline id throws `notFound` (Go pushed `onViewChar(null)`); it takes the last numeric arg.
  - Chat input max length raised 100 -> 500; the chat log `.who` names are clickable (prefill `/w name `).
  - `GameScene.ts` shrank (427 -> 423 lines): chat construction, `onChat` and the entity-click wiring moved to
    `game/SocialController.ts`. `Entity` peers are now interactive (`eventMode static`, hover glow like NPCs).
- Not verified in the browser: `onP2pWisperError` (offline private-chat target), world cooldown after 5 min.

## Implementation notes (phase B)

Implemented 2026-11-04. Lint clean; tests shared 11, swf 4, server 199 pass (19 new in `party-rules.test.ts`; the run counts 8 more than the
172 + 19 baseline arithmetic, all passing). Server registers 64 RPC methods (+10, none quiet). Browser-verified with two accounts (see the report).

- Shared: new `party.ts` (`PartyLimits`, `GroupCantJoinCode`, `GroupMember`, `MList`, `GroupJoined`, `GroupInvited`, `GroupRequested`, `GroupDenyPush`,
  `GroupLeavePush`, `GroupGiveLeaderPush`, `GroupAfkPush`, `GroupFlagPush`); `SceneCharacter` gained `inGroup / isLeader / groupAfk`.
- Server: `modules/party/` (`party-rules.ts` pure `PartyBook` with injectable clock + tests, `party.manager.ts` = `PartyBook` on `Date.now`,
  `party.service.ts`, `party.rpc.ts`, `party.module.ts`). `PartyModule` imports only `CharacterModule`; `SceneModule` and `ChatModule` import it.
  - RPCs: `groupInvite`, `groupJoin`, `groupRequest` (all `forbidInBattle`), `groupReqDeny`, `groupAdd` (-> boolean), `groupLeave`, `groupKick`,
    `groupGiveLeader` (-> boolean), `groupAFK`, `unGroupAFK` (both -> `{cid}`).
  - Pushes: `onGroupInvited`, `onGroupRequest`, `onGroupDeny`, `onGroupRequestDeny`, `onGroupCantJoin(cid, code)`, `onGroupJoined`, `onGroupLeave`,
    `onGroupDismiss(mList)`, `onGroupGiveLeader`, `onGroupAfk`, `unGroupAfk`, H5 `onGroupFlag`.
  - Gateway: `GameGateway.onCharacterLeave` / `leaveCharacter` (hooks run by `backToCharSelect` while the character is still bound). Party leave and
    `onScenePlayerLeft` use it (the latter fixes a pre-existing ghost entity after `backToCharSelect`).
  - Scene: `SceneRpc.move` refuses locked followers with a note and relays the leader's position to followers (`CharacterService.updatePositions`);
    `sceneChange` / `gmGoMap` throw `forbidden` for locked followers; `SceneTransportService.moveToMap` takes non-AFK, non-fighting followers on the
    leader's old map along (each gets its own `onSceneEnter`), then re-sends `onGroupJoined` (member map ids). Scene payloads carry the flags.
  - Chat: `ChatService.sayTeam` delivers channel 3 to every online party member on any map ("Bạn chưa có nhóm" otherwise).
- Client: `game/PartyController.ts`, `game/NpcPanels.ts` (extracted from `GameScene` to make room), `ui/hud/teamBar.ts`, `PopupMenu` in `ui/playerMenu.ts`,
  `Entity.setLeaderFlag`, `askConfirm` got an optional `onNo`. `GameScene.ts` shrank 423 -> 396 lines.
- Decisions and deviations:
  - **Team flag push**: the Flash client has no map-wide team-flag handler. The leader flag appears only through `Group.setGroupState` (member lists) and the polled
    `getCharLeaderClient`; `setLeagueFlag` / `onSetTeamLeague` is the unrelated red/blue cross-battle league badge. So the plan's `onSetTeamLeague` was **not** used;
    the H5 push is `onGroupFlag({cid, inGroup, isLeader, groupAfk})`, broadcast to the map. `getCharLeaderClient` is not registered.
  - A pending invite does not create the party; the party is created when the invite is accepted. Invites and requests are per (target, sender), expire lazily after
    60 s; the client dialog also closes itself at 60 s. Requests are keyed to the party, so they survive a leader change and die with a disband.
  - `groupReqDeny` decides by pending state (invite from `otherCid` to the caller, else a request when the caller leads) instead of Go's "is the caller a leader".
  - `onGroupDeny` / `onGroupRequestDeny` carry `{cid, name}` (Flash payload), not a bare cid. `onGroupCantJoin` is sent to the caller, with `cid` = target
    (target already grouped, party full, target in battle = code 10) or the caller's own id (caller already grouped on `groupJoin` / `groupRequest`).
  - A joiner on another map than the leader (`dis: "far"` invite) starts AFK so they are not stuck locked on a map without the leader; `unGroupAFK(true)` needs 300 px.
    The AFK return book (item 3552, `unGroupAFK(false)`) is not ported and is refused with a note. The leader cannot go AFK (forbidden).
  - `groupGiveLeader` is refused (false + note) for an AFK member or one on another map (the Flash HUD also hides it for AFK members).
  - Leave / kick with >= 3 members: `onGroupLeave` to the remaining members and the leaver, plus an updated `onGroupJoined` when the leader changed. All push
    payloads carry `members` (flat) next to `mList`.
  - Followers: no `moveToSafeArea()` on leave / dismiss (the legacy client walks the player to the safe area); no `getGroupMemberPosistion` tooltip data.
    Locked followers cannot start walking, click NPCs or gates (the legacy client only blocked walking); the auto-say "Nhóm trưởng, đi nhanh nào." goes to
    team chat, throttled to once per 3 s. A far invite shows the dialog at once (legacy showed a blinking icon first).
  - Follower movement is animated by every client (`PartyController.tick`) as a trail behind the previous non-AFK member at 45 px; followers do not send `udcr`
    and do not trigger `cbom` (the leader's encounter stays solo until phase C). NPC teleports (`clickNpc` on transport NPCs) still move a locked follower: not gated.
  - Member HUD tiles show portrait, name, level, crown, AFK tint and a map tooltip; no HP/MP bars. The system-bar team button / key T is still "not ready".
- Not verified in the browser: request flow (`groupRequest` -> `onGroupRequest` -> `groupAdd`, needs a third account), `dis: "far"` invite + AFK-on-join,
  3+ member leave / kick, `backToCharSelect` cleanup (the client never calls it), follower exclusion while in battle, a real gate (only `/go`, same `moveToMap` path).

## Implementation notes (phase C)

Implemented 2026-11-04. Lint clean; tests shared 11, swf 4, server 220 (199 + 21 new: `roster.test.ts`, `group-loot.test.ts`, `round-group.test.ts`).
Server still registers 64 RPC methods (no new RPC; `cbom`, `battleUpdateCmd`, `battlePlayEnd` unchanged and un-quieted). New push: `onCmdReady(slot)`.

- Shared: `BATTLE_PLAYER_SLOTS` (10..14) and `BattleCmdReady` in `battle.ts`.
- Server (`modules/combat/`):
  - New: `roster.ts` (pure: `selectRoster`, `enemyRange` / `groupEnemyCount`, `missingCommands`, `splitReward`, `isSurvivor`), `group-loot.ts` (pure round-robin
    loot with per-recipient quest eligibility), `battle-command.service.ts` (command validation per member, moved out of `CombatService`),
    `battle-end.service.ts` (per-member `battlePlayEnd` pushes).
  - Changed: `battle.types.ts` (`Battle.members` / `commands`; per-member `MemberResult`), `battle.manager.ts` (per-participant lookup, `detach`), `round.ts`
    (`resolveRound` takes one command or a per-slot map; missing = timeout; any flee ends for all; `PlayerCommand.leave` for a queued disconnect),
    `encounter.ts` (`rosterSize` argument), `battle-settle.service.ts` (survivor split, per-member persistence), `battle-loot.service.ts` (group roll),
    `combat.service.ts` (roster start, command intake, readiness, per-recipient playlist, disconnect), `combat.module.ts` (imports `PartyModule`).
  - Flow: `cbom` from a follower (non-leader, non-AFK) is ignored; a leader's roster is the party's eligible members; the encounter is rolled once with the enemy
    count by roster size. `onSetCharState(5)` + `onBattleStart` go to every participant. Each accepted command is stored and `onCmdReady(slot)` goes to all
    participants (group battles only, solo unchanged); the round runs when every alive, connected player character has a command. The 30 s deadline fills missing
    commands as timeouts for everyone. A flee by any member ends the battle for all (result 2, no rewards).
  - Rewards: exp and money use the leader's level and are split by floor among survivors; kill credit and loot go to survivors only (round-robin per drop);
    each member's `report` is placed on its own copy of the end marker, `onUPP` before the list, and the other pushes at its own `battlePlayEnd`.
  - Disconnect: alone (or already ended) -> settle as fled and drop (old behaviour). In a group the leaver's HP/MP are saved, it is marked left, a queued
    `leave` escape runs in the next round (immediately when nobody else is missing a command) and the battle continues; the last alive player leaving makes the
    remaining (dead) members lose.
- Client: `BattleUnit(p, selfId)` (MP/SP bars only for the local character, `setWait`), `BattleStage` (`showWaitIcons` / `clearWaitIcon`),
  `BattleController` (`onCmdReady`, own slot instead of the fixed slot 10, wait icons per round for groups, no command UI while fallen, flee/leave fades the unit
  in `playback.ts`). The battle files were being edited by another session at the same time; only additive edits were made.
- Deviations / decisions:
  - A second submission in the same round is rejected (`forbidden`) instead of overwriting (a potion would otherwise be consumed twice).
  - The enemy count is rolled with the roster size known BEFORE the HP check; a member found dead afterwards shrinks the roster but not the enemy count.
  - An AFK party member walking alone rolls a solo encounter; locked followers never send `cbom` (and the server ignores it).
  - A dead member sees "Chiến thắng! Bạn đã gục nên không nhận thưởng" instead of the reward toast; no pets, no spectators.
- Verified: unit tests above; server flows driven by two scripted ws clients (win with equal split 63 exp / 27 money each, onCmdReady before the playlist, flee ends both
  with result 2, disconnect mid-battle runs the round at once and the other player finishes, 30 s timeout round for both). Browser (built-in pane, hidden): one
  browser player (follower) + one scripted leader: two player units at 10/11 with their own names, wait icons over both, cleared by `onCmdReady`, menu only for
  the local player, shared playback, solo battle afterwards still works.
- Not verified in the browser: two browser players at once (the pane is hidden and throttled; other sessions' edits reload the page), flee and disconnect UI,
  3+ member battles, loot round-robin with real quest drops (pure test only), quest-battle NPCs staying solo (code path unchanged).

## Implementation notes (phase D)

Implemented 2026-11-04. Baseline before: lint green, shared 11, swf 4, server 220. After: lint green, shared 11, swf 4, server 228 (+8 in `relationship-rules.test.ts`).
Server now registers 67 RPC methods (+3: `initViewImC`, `addRelationByName`, `delRelationship`; none quiet).

- Shared (`social.ts`): `RelationType`, `RelationTypeId`, `RelationLimits` (120 / 30), `RelationEntry`, `InitViewImC`.
- Server (`modules/social/`): `relationship.schema.ts` (collection `relationships`, counter `relationships`, unique (characterId, targetId)), `relationship-rules.ts`
  (pure `planAdd` / `normalizeName` / `canDelete`), `relationship.service.ts`, `relationship.rpc.ts`; `social.module.ts` wiring.
  `CharacterService` gained `findByName` and `findByIds` (additive).
- Client: `game/FriendController.ts` (lists, pushes, blacklist lookup), `ui/friendPanel.ts` + `friendPanel.css`; HUD "Giao lưu" button and key K now open the panel
  (`SystemBar` / `MainHud` / `GameScene` wiring); player menu "Kết bạn" enabled; `SocialController` drops `onSay` / `onWisper` (not self-echo) / `onP2pWisper`
  from blacklisted ids and exposes `whisperTo` / `openPrivate`.
- Deviations:
  - The blacklist filter matches by character id (push `id` / `senderId`), not by name as legacy did. It is populated by an `initViewImC` sent when the scene starts, so it
    works before the panel is opened (legacy only filled it after the IM panel was opened once).
  - Adding a friend who is blacklisted (and the reverse) swaps the row on the server (`onDelRelationship(old)` then `onAddRelationship(new)`); the Flash client blocked this with an Alert.
  - Refusals other than an unknown name (self, duplicate, list full, invalid type) are `RpcException.forbidden` / `invalidArgs` shown as toasts; Go answered `onAddRelationByName(-1, type)` for all.
    `delRelationship` of a row that is not the caller's throws `notFound`.
  - No "đã thêm bạn" `onSystemSay` to the target (Go sent one); no class name column, no intimacy; delete asks `askConfirm` with a short text instead of the intimacy string.
  - Shortcuts are Chat mật, Chat riêng, Mời nhóm (offline friends disabled) and Xóa; the blacklist row only has Xóa. No "Thông tin" shortcut.
- Verified: unit tests; scripted ws run (add friend with online marker, duplicate, unknown name -> `onAddRelationByName(-1,1)`, self, bad type, friend -> black -> friend swap with
  del/add pushes, foreign delete, relog persistence, offline marker dropped when the target is offline, delete); browser (built-in pane) with MpaAlice + a scripted MpaBob:
  panel via HUD button, unknown-name toast, add by Enter, online marker, friend -> black swap, blacklist persisted across a relog, local chat / whisper / private chat from Bob
  all hidden while blacklisted and visible again after deleting the row, delete confirm, shortcut buttons (whisper prefill, group invite sent).
- Not verified: K key in the browser (HUD button was used), `Chat riêng` window opening from the panel (the test removed a window's DOM by hand), the 120/30 caps beyond the unit test.

## Implementation notes (phase E)

Implemented 2026-11-04. Baseline before: lint green, shared 11, swf 4, server 228. After: lint green, shared 11, swf 4, server 239 (+11: `trade-rules.test.ts`, `trade-swap.test.ts`).
Server now registers 4 more RPC methods (`newTrade`, `tradeLock`, `tradeConfirm`, `stopTrade`; none quiet).

- Shared (`trade.ts`): `TRADE_MAX_ITEMS`, `TradeOffer`, `TradeReply`, `TargetLock`.
- Server (`modules/trade/`): pure `trade-rules.ts` (`parseOffer`, `validateOffer`, `TradeBook` state machine), pure `trade-swap.ts` (`planSwap`, `runSaga`),
  `trade.manager.ts`, `trade-swap.service.ts` (swap under both `withCharLock`s in ascending id order, saga: debits -> row moves -> credits, reverse undo),
  `trade.service.ts`, `trade.rpc.ts`, `trade.module.ts` (exports `TradeService`; imports neither scene nor combat).
  Hooks: `SceneTransportService.enterScene` and `CombatService.startGroup` call `TradeService.stopFor(cid, true)`; disconnect / back-to-char-select via gateway hooks.
- Client: `ui/tradePanel.ts` + `tradePanel.css`, `game/TradeController.ts`; `BagController.tradeHook` / `openPanel()` and `BagPanelHost.interceptUse` (bag double-click feeds the trade while open);
  player menu "Giao dịch" enabled (`PlayerMenuActions.trade`, `SocialHost.trade`).
- Deviations:
  - Item rows are moved (same item id, new `characterId` / `slotIndex`), not cloned as in Go, so received items keep their instance id.
  - Bag space is checked against currently empty slots only (slots freed by the receiver's own outgoing items are not reused, like Go's `bagCount + incoming <= cap`); two full bags cannot swap 1 for 1.
  - Validation failures answer `{flag:false, info}` (Flash shows `info`); only malformed args throw `invalidArgs`. `forbidInBattle` on `newTrade` / `tradeLock` / `tradeConfirm`, but not on `stopTrade`
    (a battle start already ends the trade and the client echoes `stopTrade` when its panel hides; a no-session `stopTrade` is a silent no-op).
  - A re-lock is allowed at any time before execution (also after the caller confirmed) and resets both confirmations; the panel treats `onTargetLock` as "reset my confirm to lock".
  - `onTargetConfirm` goes only to the peer of the first confirmer. No `onSetActionState` pushes (the H5 client has no trade action state). The `tradable` template column is not consulted (as in Go).
  - Success pushes per side: `onDelCharactorSlot` (given), `onAddCharactorSlot` (received), `onAddMoney(cid, 'money', received, newTotal)` only when the other side offered Bạc, `onUPP {money, gold}`, `onTradeSuccess`.
    Gold has no `onAddMoney` (only `onUPP`).
  - Map change / battle start / back-to-char-select / disconnect end the trade; both sides get `onStopTrade` (on disconnect only the peer).
  - Layout: trade panel at the left of the stage, the bag opens beside it (`beside-shop` position).
- Verified: unit tests; scripted ws run with MpaAlice (13) / MpaBob (14) and Mongo before/after: success swap (rows, slot indexes 3 / 1,2, money and gold both sides), bound / equipped / foreign / 6 items /
  too much Bạc / Vàng / bad shape refused, confirm before both locks refused, re-lock reset (peer must reconfirm), cancel, disconnect mid-trade, insufficient money at confirm time (A debited then B fails ->
  A restored, `onTradeFail` both), bag full (30 rows, nothing changed), map change and battle start ending the trade, `newTrade` against a fighting player refused; browser (built-in pane, Alice) with a scripted Bob:
  panel opens on `onRequestTrade`, bag double-click fills slots, money clamp, bound item refused by the server toast, Khóa / Xác nhận / swap with bag and wallet updated, Hủy, peer cancel closing the panel,
  player menu "Giao dịch" opening the panel.
- Not verified: drag from the bag onto the panel (only double-click), a battle starting while the panel is open in the browser, Esc closing the panel, two real browser tabs.
