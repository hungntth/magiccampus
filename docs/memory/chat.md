# Chat (log, input bar, speech bubbles)

Updated 2026-11-03.

## Contract
- RPC `say(channelId, msg)` (quiet), push `onChat` (`ChatMessage {id, name, channelId, msg, time}`); `id` is the
  character id. Channel 1 (`LOCAL`) broadcasts to the map **including the sender**, 2 (`GLOBAL`) to every map.

## Client
- `client/src/ui/chat.ts` + `ui/hud/hud.css` (`.hud-chat*`): pure CSS look (no `/ui/MainStage_ChatArea` skins).
  Tabs are a flex row; clear/enlarge/shrink/lock buttons sit top-right in the log, faded until hover.
- `GameScene.onChat`: logs every message; `LOCAL` also calls `Entity.say(msg)` on the speaker (self or peer).
  Legacy: `ChatCanvas.onSay` → `CreatureView.onSay` for `MSG_CHANNEL_LOCAL` (skipped when setting `hc`
  "hide chat" is on; that setting is not ported).
- `Entity.say` mirrors legacy `PopupText` (also used for NPC `onServiceText` and quest `completeText`):
  Times New Roman 12 black, 100 px wrap, > 80 chars truncated with `...` (`CHAT_POPUP_MAXCHAR`), 2 px `0xFF9900`
  rim around `0xFFFF65` fill, orange tail under the left edge, hides after 5 s; a new message replaces the old one.
  H5 places it above the name label / quest marker (legacy: above the head, names were under the feet).
