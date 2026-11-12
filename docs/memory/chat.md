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

## Guild channel (M6)
Channel 2 is live: `say(2, msg)` reaches online guild members (`guild.md`).
- Safety (2026-11-04): the client renders every chat string as text nodes / `textContent`, never `innerHTML`.
  Server `normalizeMessage` (chat-rules.ts) strips Cc/Cf chars (newlines, zero-width, bidi overrides), collapses
  whitespace, trims and caps by code point (`ChatLimits.MAX_MSG_LEN` 500 = Flash `MSG_CHAT_INPUT_MAX`; p2p 55).
- Log UI: the log is click-through (map clicks pass), so `.hud-chat-rail` is a clickable mirror scrollbar synced
  with it. `onAddItem` lines are "[Thông báo] Nhận: [name] xN" with a clickable tag; the tooltip is `itemTooltip` of
  a held copy of the template (BagController.itemInfo), else just the name.

- M9 phase G: see `settings.md` (tray Thiết lập / Bản đồ / Trợ giúp, keys P / M / H, chat emotion popup and typed emotion codes).


## M14 phase G: chat leftovers (2026-11-12)
Plan §2.6 / §3.11-13. Shared `chatExtras.ts` (`HEADLINE`, `CHAT_BAN`, `CHAT_BAN_TEXT`, `GM_MESSAGE`, `ChatPanelHeader`, `plainLength`, `banDuration`, `formatBanUntil` / `formatBanLeft`, `isBanLiftCommand`). Server `modules/chat/`.

- **Chat ban** (`chat-ban.{schema,service}.ts`, `chat-ban-rules.ts`): `checkPlayerIsBaned(targetId, targetName)` -> true = stop (a note was pushed), `banChatByPlayer(id, name, delPass, hours?)` (any positive 4th arg = 12 h, else 20 min; `delPass` ignored). Collection `chat_bans {characterId unique, bannedBy, bannedByName, expiresAt}`; the unique key is the atomic reservation (insert, or replace an expired row), then 100 **unbound gold** are spent conditionally (the reservation is released when that fails). `/huycam` or `/huycamchat` typed through `say` lifts it for 100 gold (any channel, no Loa; the banner is told). `say` on **every** channel and `roomChat` are refused before any Loa is spent ("Bạn đang bị cấm chat, còn N phút. Gõ /huycam ..."); whispers and `chatGM` are not blocked. A cache of expiries (one entry per online character) avoids a Mongo read per message; a read error lets the message through (Go).
- **Headline** (`headline.service.ts`): `say(text, 6)`: plain length (tags stripped, entities unescaped) > 49 -> "Chữ điền vào quá dài."; no item 2297 -> "Bạn không có đủ loa lớn..."; else one 2297 is consumed under the character lock, `onSay` channel 6 goes to everyone and the line is kept 30 min and replayed to a character entering the world (`SceneHooks.onMapChanged`, fromMap 0).
- **Chat panel / GM inbox** (`chat-panel.{service,rpc}.ts`): `createChatPanel(targetId)` / `getChatPanel(targetId, name)` -> `{id, name, classId, exp, level, iconCode}` (3 s rate limit, refuses self, fallback `{id, name}` when not found and a name was given). `chatGM(message, playerId, gmName)` stores the message (sender = session character, 500 chars) in `gm_messages` and sends an `onWisper` line "[Gửi GM] ..." to every online GM account (gmLevel > 0); the sender gets a note.
- **Emoji**: no server work (the relay already carries the codes). The existing picker (`ui/emojiPopup.ts`) inserts the Flash codes; a message that is exactly one code plays the bubble, a code inside a longer text shows as plain text in the log (M9 decision, unchanged).
- Client: `ui/chat.ts` "Đầu bảng" channel (49 plain chars, confirm via `HEADLINE_TEXT.CONFIRM`) + `ui/chatHeadline.ts` strip above the log (cleared 30 min after the last line, channel 6 is not logged in the tabs), `game/ChatBanActions.ts` + "Cấm Chat" / "Cấm Chat 12h" in the player menu, private chat header via `getChatPanel`, `/gm <text>` -> `chatGM`.
- Verified: ws smoke (46 checks: ban 20 min / 12 h, refusals, mute on every channel but whisper, `/huycam` paths, expiry + re-ban, headline + login replay, header, `chatGM` to a GM); browser: headline send + strip. Not verified in a browser: ban menu items, private chat header, `/gm`.
