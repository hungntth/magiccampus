# Chat (log, input bar, speech bubbles)

Updated 2026-11-04 (M3 phase A, plan `docs/plans/2026-11-04_04_MULTIPLAYER.md`). Whisper, private chat and the player menu are in `social.md`.

## Contract (shared `social.ts`)
- `ChatChannel` uses the **legacy ids**: 0 local, 1 world, 2 guild, 3 team, 4 whisper, 5 area, 6 headline, 9 rumour, plus H5 `SYSTEM: 99`.
  The push was renamed `onChat` → `onSay` (`SayPush {channelId, id, type, name, cname, msg, pmLevel}`).
- RPC `say(channelId, msg)` (quiet). Refusals are `RpcException.forbidden`, shown as a toast: rate limit, no Loa, not in a party, unsupported channel.
- Channel routing:
  - Local (0): the map, **including the sender**.
  - World (1): everyone. Lv ≥ 10 and 5 min since the last free message → free; otherwise 1 Loa (item 719) is consumed; otherwise refused (Go broadcast anyway).
  - Team (3): online party members on any map (`ChatService.sayTeam`); "Bạn chưa có nhóm" without a party.
  - Others: refused.
- Limits: 1100 ms per character across `say` / `wisper` / `p2pWisper`; 500 chars (private 55). Pure rules: `modules/chat/chat-rules.ts`.
- Blacklisted senders are dropped client-side (`SocialController`, by character id).

## Client
- `client/src/ui/chat.ts` + `ui/hud/hud.css` (`.hud-chat*`): pure CSS look (no `/ui/MainStage_ChatArea` skins).
  Tabs are a flex row; clear/enlarge/shrink/lock buttons sit top-right in the log, faded until hover.
- Send selector Hiện tại / Thế giới / Đội; `/w name text`; clickable sender names (prefill `/w`).
- `SocialController.onSay` (moved out of `GameScene`): logs every message; `LOCAL` also calls `Entity.say(msg)` on the speaker (self or peer).
  Legacy: `ChatCanvas.onSay` → `CreatureView.onSay` for `MSG_CHANNEL_LOCAL` (skipped when setting `hc`
  "hide chat" is on; that setting is not ported).
- `Entity.say` mirrors legacy `PopupText` (also used for NPC `onServiceText` and quest `completeText`):
  Times New Roman 12 black, 100 px wrap, > 80 chars truncated with `...` (`CHAT_POPUP_MAXCHAR`), 2 px `0xFF9900`
  rim around `0xFFFF65` fill, orange tail under the left edge, hides after 5 s; a new message replaces the old one.
  H5 places it above the name label / quest marker (legacy: above the head, names were under the feet).
