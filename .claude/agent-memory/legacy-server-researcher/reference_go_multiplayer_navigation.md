---
name: go-multiplayer-navigation
description: Where legacy Go multiplayer code lives (chat, group, social, trade, group battle), in-memory vs DB state, dispatcher collisions, stale memory claims
metadata:
  type: reference
---

Packages (under `D:\mcgame\internal\`): handlers `presentation/rtmp/handlers/{chat,group,social,trade}/`, logic `application/{group,social,trade}/service.go`,
group battle glue `handlers/combat/group_battle.go` + `application/combat/encounter.go:StartPVEBattleWithRoster`, rewards `application/combat/rewards.go`,
timeouts `application/battle/{service,timeout_handler}.go`, leader follow-through `presentation/rtmp/utils/group_transport.go`,
movement gating/`mList` `handlers/scene/movement.go`, scene flags `handlers/scene/player_data.go`.

State: groups and trade sessions are in-memory only (`infrastructure/persistence/memory/group_repository.go`, trade Service maps); friends in `player.friends`
(+`type` col) and `player.blocks` (separate id sequences -> id collision). `*_handler.txt` files in handler dirs are dead copies, not Go.

Quirks worth remembering: `Invite` adds the target to the group immediately (memory doc says otherwise); `Group.MapID` never set so `groupListOfMap` is empty;
blacklist is not enforced server-side; global chat still broadcasts when the player has no speaker item 719; trade has no accept RPC, no disconnect cleanup,
ignores item `tradable`; `getCharStateClient` is overwritten by `stub` handler (registered last, `cmd/gameserver/main.go:807`).
Flash chat channels are 0 local, 1 global, 2 guild, 3 team, 4 whisper, 5 area, 6 headline, push `onSay`; H5 `ChatChannel` (1/2, `onChat`) differs.
Flash sends `groupRequest(ownCid, leaderCid)` (2 args) but Go reads `args[0]` as leader. Always trust code over `docs/memory/group-party.md`.

Tip: `cat -n a.go b.go` numbers lines continuously across files; use `grep -n "^func"` per file for real line numbers.
