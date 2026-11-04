---
name: reference-go-guild-pk-navigation
description: Where guild/PK/ranking code lives in the Go legacy server, which RPCs are real vs stub, and traps (unenforced permissions, wrong push names, dead material donation)
metadata:
  type: reference
---

Verified 2026-11-04 (research `docs/research/2026-11-04_12_GUILD_PK_SERVER_RESEARCH.md`).

- Guild: `internal/{domain,application}/guild/`, handlers `presentation/rtmp/handlers/guild/` (reg `handler.go:46-87`), repo `infrastructure/persistence/postgres/guild_repository*.go`,
  SQL fns in `supabase/migrations/20260414084416_*`, `20260417184534_*`. Rank settings + bank page count are hidden JSON rows in `player.guild_logs`.
- Authority is leader-only in practice: rank `can*` checkboxes and `guild_members.can_*` columns are never enforced/written. Costs for level up / member cap / bank / buildings / skills = none.
- Guild buildings = pure function of `guild.level` (`buildings.go:90-138`); build state only in memory; `data_tbl_building` costs ignored by server. Guild skills: flag row only, no member effect; `addGuildSkill`/`improveGuildSkill` (client calls) unregistered.
- PK: only `PVPStartClient` is client-reachable (`handlers/pk/pvp_start.go`); `pkInvite..pkLeave` is an unused in-memory skeleton. PvP battle = `application/combat/pvp.go`; no rewards/honor/pk value; map `pk`/`safe_flag` columns ignored by server.
- Rankings: `rankGet`/`getRankList` are stubs (`handlers/ranking/rank_get.go`); handler header comment claiming "top-10" is stale.
- Traps: Go guild push names (`onGuildPropertyRefresh`, `updateGuildInfo`, `onUpdateGuildNumProp`...) do not match AS handler names in GuildPanel (`onUpdateGuildProperty`, `onUpdateGuildInfo`, `onUpdateNumProp`); `onUpdateGuildRank` arity mismatch.
  `docs/client/system/CallBack.as` is truncated (decompile aborted), so push routing cannot be verified there.
- Item materials 7,16,18,21-28 have `color -1` in seeds, so `contribMaterial` (needs color>=2) never works. Guild DTO has 22 keys (legacy memory says 18).
- `.txt` copies of handler files (`guild_handler.txt`, `pk_handler.txt`, `stub/stub_handler.txt`) are dead; ignore them when checking registration collisions.
