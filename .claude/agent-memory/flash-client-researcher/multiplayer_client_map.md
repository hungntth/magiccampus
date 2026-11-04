---
name: multiplayer-client-map
description: Feature -> file cluster for party/chat/friends/trade in the legacy client, and where push handlers actually live despite the CallBack stub
metadata:
  type: reference
---

Full findings: `docs/research/2026-11-04_05_MULTIPLAYER_CLIENT_RESEARCH.md`.

- Push handler bodies ARE visible for multiplayer even though `CallBack.as` is a stub: `logic/Group.as` (all `onGroup*`),
  `view/view/compMain/ChatCanvas.as` (`onSay`, `onWisper`, `onP2pWisper`), `IMPanel.as` (`onInitViewImC`, `onAddRelationship`...),
  `TradePanel.as` (`onRequestTrade`, `onTargetLock`...). Grep `public function on` in the panel, not in CallBack.
- Player menu = `view/view/compMain/TargetCanvas.as` (radial, 9 buttons, no PK/block entry); PK is `ACTION_PK` click mode.
- `ChatPanelUtil` (private chat windows) is NOT decompiled; `getFriendList/getBlackList/refuseToAddFriend/tradeAddItem/...`
  do not exist in the client (trade = newTrade/tradeLock/tradeConfirm/stopTrade; friends = initViewImC/addRelationByName/delRelationship).
- Legacy chat channel ids: 0 local, 1 world, 2 guild, 3 group, 4 battle, 5 area, 6 headline, 9 rumour (H5 `ChatChannel` is shifted +1).
- Group `mList` is a linked list `{head:{obj:cid,next}}`, leader first; `onGroupDismiss` payload is the list itself.
- Language.as `GAMEPREDEF_S[222]` (`CHAT_TOOFAST`) resolves to a wrong string ("Đừng xóa!"): some Language constants are index-shifted.
