# Social: whisper, private chat, player menu, player info, friends and blacklist

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

## Deferred
Teacher/student, enemies, couples, brothers, intimacy, live presence, the guild channel, `getChatPanel` header.
Quiet the new RPCs after the user confirms.
