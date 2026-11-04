---
name: guild-pk-rank-client-map
description: Guild/PK/ranking file cluster in the legacy client; guild pushes live in GuildPanel.as, PK has no duel RPCs, ranking is ActivePanel rankGet
metadata:
  type: reference
---

Full findings: `docs/research/2026-11-04_11_GUILD_PK_CLIENT_RESEARCH.md`.

- All guild pushes (`onInitViewGuildP`, `onAddGuildMember`, `onDemise`, ...) are `public function on*` bodies in
  `view/view/compDragable/GuildPanel.as`; the guild `on*` in `CallBackGlobal.as` are empty no-ops. Building/bank/skill-panel
  pushes are NOT visible (stub CallBack); only the Go server (`handlers/guild/build_rpc.go`) names them.
- Guild ranks: -1 applicant, 1 leader, 2..5 configurable, 6 member. Member `note` = `"name|classId|exp"`.
  `quitGuild` takes the member table id, `demiseTo` takes a cid.
- PK is NOT a duel flow: `pkInvite/pkReady/pkAction/...` do not exist. PK = ACTION_PK click -> `PVPStartClient(cid)` (CharactorView.as:176),
  opt-in flag = `uif("apvp", bool, false)` (Core.updateSettingNow). Two different `btnPK` (SystemBarCanvas = attack mode, MiniMapCanvas = apvp toggle,
  where `selected` means PK closed). `getRankList` is a local method of CrossBattleRank, not an RPC.
- `honor` on a char object: >0 red name, <0 "[Wanted]". `CharactorView._textGuild` is declared but unused: no guild name above players.
- Rankings = `ActivePanel.as` `rankGet(category)` -> `{name, data:[{id,name,guild,value}]}`; grid bound as `this[name+"Grid"]`.
- Guild features need a server *line* with `lineInfo.guild` ("Kênh bang hội"), guild NPCs (type 17) are not created otherwise (Core.as:474).
- Guild bank has no withdraw path in the client (Slot.as only handles guild->guild move); deposit is only `contribMaterial`.
