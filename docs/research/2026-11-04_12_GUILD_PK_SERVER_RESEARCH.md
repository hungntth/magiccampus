# M6 Guild, PK and rankings: legacy Go server research

Date 2026-11-04. Scope: guild core, guild buildings and skills, PvP duel (`PVPStartClient` family), rankings.
Legacy root `D:\mcgame`. Client cross-checks come from `D:\mcgame\docs\client` (decompiled AS); `system/CallBack.as` is **truncated**
("Decompile aborted"), so push-name routing could not be verified from it. Mongo checked with `mongosh` (read-only).
Legacy `docs/memory/guild-system.md` and `pvp-apvp.md` were read first and verified; deviations are called out in section 8.

Legend: **[data]** backed by a seed table or the Flash client; **[go]** invented by the Go port (no data, no client evidence);
**[stub]** returns canned/no-op data.

## 1. Summary

- **Guild** is a real, Postgres-persisted feature: `player.guilds`, `guild_members`, `guild_applications`, `guild_warehouse`,
  `guild_skills`, plus two JSON blobs hidden in `guild_logs` (rank settings, bank page count). 32 RPCs are registered live
  (`handlers/guild/handler.go:46-87`), with **no registration collisions** (grep of all `Register("<name>")` over `*.go`; the `.txt` files
  under `handlers/*/` and `handlers/stub/stub_handler.txt` are dead copies).
- Authority model is much simpler than the UI suggests: rank permission checkboxes (`canAdd`, `canKick`, ...) are stored but **never enforced**.
  Real gates are "is leader" plus three per-member DB booleans (`can_invite`, `can_kick`, `can_edit_announcement`) that nothing ever sets to true,
  so in practice **only the leader** can approve/refuse/kick/edit notice/rename/level up/promote/demise/disband.
- Guild buildings are **cosmetic and free**: building layout is a pure function of `guild.level`; "upgrade" bumps the guild level by 1 with no cost and no cap
  and the client-side cost check is the only check. Guild skills are a flag row `(guild_id, skill_id)`, also free, and **no member-side effect exists**
  (`addGuildSkill` / `improveGuildSkill`, which the client calls, are not registered in Go).
- **PK**: only `PVPStartClient(targetCid)` is reachable from the Flash client. It starts a real 1v1 PvP battle (attacker bottom, target top, pets included),
  gated on the **target's** `apvp` setting, same map and distance <= 20 px. There are **no rewards, no honor, no PK value, no red name, no death penalty**.
  The `pkInvite / pkInviteResp / pkReady / pkAction / pkSurrender / pkLeave` family is an in-memory lobby skeleton that nothing in the client calls.
- **Rankings**: `rankGet` and `getRankList` are **stubs** returning an empty-shaped payload; no ranking persistence exists in Go.

## 2. Entry points

### 2.1 Guild RPCs (all in `internal/presentation/rtmp/handlers/guild/`, registered `handler.go:46-87`)

First arg is optionally a `nil` responder; every handler strips it with `trimResponderArg` (`helpers.go:80-85`). Auth: `currentCharacterID` (`helpers.go:29-40`).

| RPC | Go handler (file:line) | Service function |
|---|---|---|
| `initViewGuildP` | `panel.go:14` | `buildGuildPanelResponse` (`helpers.go:97-133`) |
| `getGuildMemberList` | `panel.go:35` | same panel build, returns member map keyed by member id |
| `initGuildList` | `panel.go:67` | `Service.ListGuilds` (`service_extra.go:51`) |
| `addGuild` | `membership.go:14` | `Service.CreateGuild` (`service.go:91`) |
| `addGuildMember` (apply) | `membership.go:110` | `Service.ApplyToGuild` (`service_extra.go:77`) |
| `confirmGuildApply` | `membership.go:225` | `Service.ApproveApplication` (`:142`) |
| `refuseGuildMember` | `membership.go:267` | `Service.RefuseApplication` (`:181`) |
| `quitGuild` | `membership.go:150` | `LeaveMember` (`service.go:278`) or `CancelApplication` (`service_extra.go:197`) |
| `kickGuildMember` | `membership.go:305` | `Service.KickMember` (`service.go:230`) |
| `demiseTo` | `membership.go:351` | `Service.TransferLeadership` (`service_guild_management.go:59`) |
| `delGuild` | `updates.go:209` | `Service.DisbandGuild` (`service.go:344`) |
| `updateGuildMember` | `updates.go:14` | `Service.PromoteMember` (`service.go:310`) |
| `updateGuildRank` | `updates.go:78` | `Service.UpdateGuildRankSettings` (`service_guild_management.go:40`) |
| `updateGuildNotice` | `updates.go:143` | `Service.UpdateGuildInfo` (`service.go:385`) |
| `changeGuildName` | `updates.go:173` | `Service.UpdateGuildName` (`service_guild_management.go:12`) |
| `guildLevelUp` | `updates.go:246` | `Service.UpgradeGuildLevel` (`:93`) |
| `addGuildBankSlotNum` | `updates.go:271` | `Service.IncreaseBankPageCount` (`:133`) |
| `addMaxGuildMemberNum` | `updates.go:300` | `Service.IncreaseMemberCapacity` (`:113`) |
| `contribMoney` | `updates.go:325` | `Service.AddContribution` (`service_guild_skills.go:65`) |
| `contribMaterial` | `contrib_material.go:25` | `AddWarehouseMaterial` + `AddContribution` |
| `getInitGuildSlot` | `panel.go:100` | returns `guild.Warehouse` map |
| `moveGuildItem` | `contrib_material.go:169` | `UpdateWarehouseSlot` / `RemoveWarehouseSlot` |
| `dropGuildItem` | `contrib_material.go:122` | `RemoveWarehouseSlot` |
| `developSkill` | `updates.go:407` | `Service.DevelopSkill` (`service_guild_skills.go:87`) |
| `getGuildPrivateSkillData` | `panel.go:121` | `filteredSkillDevData` (`helpers.go:235-270`) |
| `createGuildBuildings` | `buildings.go:18` | `guildBuildingAssignments` (`:90-138`) |
| `clickBuild` | `build_rpc.go:18` | `buildFuncOptions` (`:122`) |
| `execBuildFunc` | `build_rpc.go:44` | per-func push |
| `constructBuild` | `construction_rpc.go:52` | in-memory `constructionState` |
| `finishCreate` / `finishUpgrade` | `construction_rpc.go:137/141` -> `finishConstruction :171` | `UpgradeGuildLevel` on upgrade |
| `resetConstruction` | `construction_rpc.go:145` | deletes in-memory state |

Not registered (client calls them, Go answers 404 "Method not found", `dispatcher.go:239,333`): `addGuildSkill(skillId)`, `improveGuildSkill(skillId)`
(client `SkillUseSlot.as:441,445`), and `StartConstruction` exists as a method but is not registered (`construction_rpc.go:38`).

### 2.2 PK RPCs (`handlers/pk/handler.go:51-57`)

| RPC | Handler | Notes |
|---|---|---|
| `PVPStartClient(targetCid)` | `pvp_start.go:22` | live, only one the client calls (`CharactorView.as:207`) |
| `pkInvite(targetCid, mapId?)` | `invite.go:14` | **[stub-ish]** in-memory invite, no battle |
| `pkInviteResp(matchId, accept)` | `invite.go:86` | skeleton |
| `pkReady(matchId)` | `match.go:13` | skeleton |
| `pkAction(matchId, payload)` | `match.go:44` | skeleton: echoes `onPkActionResult` |
| `pkSurrender(matchId)` / `pkLeave(matchId)` | `match.go:80` / `:102` | skeleton: set winner, `onPkResult` + `onPkEnd` |

No `pkInvite*`, `pkReady`, `onPk*`, `onForcePVP` caller or handler exists in `docs/client` (grep). Rate limits only for these six (`dispatcher.go:168-173`). The only fallback
into the lobby is `startPVPBattle` when combat/char services are nil (`pvp_start.go:55-60`, never true in prod: `cmd/gameserver/main.go:486`).

### 2.3 Ranking RPCs (`handlers/ranking/handler.go:22-25`)

`rankGet(category)` `rank_get.go:38`, `getRankList()` `rank_get.go:76` (both stubs, section 6). Client also calls `getCoupleRank` (marriage handler) and `getGuildWarRank`
(`activity/progress.go:100`, hard-coded fake rows "WarGuild1..3"), outside this milestone.

## 3. Rules

### 3.1 Guild constants

| Constant | Value | Cite |
|---|---|---|
| Rank scale | -1 applicant, 1 leader, 2 vice, 3 officer, 4 elite, 5 veteran, 6 member | `domain/guild/guild.go:15-22` |
| Create gate: char level | `>= 50` **[go]** (client has no level check) | `membership.go:41` |
| Create gate/cost: silver | 1,000,000 silver (bind first) | `membership.go:45,73-77`; client `AddGuildPanel.as:349` checks `money < 1000000`, string `ADDGUILDPANEL_S[4]` "tốn 1000000 bạc" **[data]** |
| Guild name length | client 2..10 chars; server only `!= ""` | `AddGuildPanel.as:335-346`, `membership.go:30` |
| Start values | level 1, exp 0, population 0 (+1 on leader join), max pop 50, joinLevelReq 1, icon 0, funds 0 | `service.go:111-126` |
| Max members step | +10 per `addMaxGuildMemberNum`, no cost, no cap | `service_guild_management.go:125` |
| Bank pages | start 1, +1 per call, hard cap 4, no cost | `:152-160` |
| Guild level up | `level++`, no cost, no cap | `:93-111` |
| Exit refund rate | 90% (`9/10`), stored in `characters.guild_restore_*` | `service_extra.go:17-20`, `service_guild_helpers.go:21-24` |
| Contribution currency ids | 20 normal, 21 donate | `domain/character/character.go:199-200`; client `GamePredef.as:647-648` |
| `onUpdateNumProp.type` | 1 donate contrib, 2 normal contrib, 3 guild money, 4 guild exp | client `GamePredef.as:1763-1766` |
| Guild map | id 49 (`Bang Hội`, `pk=1`, `safe_flag=0`), safe point 1225,700 | `buildings.go:13`, Mongo `data_tbl_map` id 49 |

### 3.2 Guild rules by RPC

1. **addGuild** `{name}` (`membership.go:14-108`): level < 50 -> push `a` "Cấp không đủ để tạo bang hội" and return `nil` (`:41-44`);
   `Money < 1M && MoneyBind < 1M` -> `a` "Không đủ tiền..." (`:45-48`) (note: either wallet alone must hold 1M; they are not summed).
   Name taken -> `a` "Tên bang hội đã tồn tại" (`:53-55`); already a member -> `a` "Bạn đã có bang hội" (`:56-58`).
   Order is **create guild first, then debit** (`:50` then `:73-77`); debit failure rolls back via `DisbandGuild` (`:79-83`). Debit: `MoneyBind -= 1M` if `MoneyBind >= 1M` else `Money -= 1M`.
   Leader gets his pending 90% contribution restore (`consumeContributionRestore`, `service_guild_helpers.go:39-68`).
2. **addGuildMember** `{gid}` = apply (`membership.go:110-148`, `service_extra.go:77-126`): guild must exist; caller not in a guild and has no pending application
   (both raise `ErrAlreadyInGuild`, `:98-100`). **No** level requirement, **no** full check, **no** auto-join (`join_approval_required` column is never read). One pending application per character.
3. **confirmGuildApply** `{tableId}` (`membership.go:225`, `service_extra.go:142-179`): approver must be leader (or `can_invite` flag, never set); guild
   `population >= max_population` -> `ErrGuildFull`. Member inserted at rank 6 (`RankMember`), restore contribution applied, application row deleted.
4. **refuseGuildMember** `applicationId` (`:267`, `service_extra.go:181`): same gate; deletes the row. Pushes type 3.
5. **quitGuild** `id` where `id` is the **guild_members.id (tableId)** for a member, or the **application id** for an applicant (`membership.go:160-192`).
   Applicant: cancel own application, push type 4. Member: caller must own that member row (`:194`), leader refused with `ErrNotGuildLeader` (`:198`), then `applyGuildExitState`
   (contribution reset to 0 with 90% parked, abandon guild quests) and row removal (population -1). Push type 2.
6. **kickGuildMember** `memberId` (`membership.go:305`, `service.go:230-275`): kicker is leader or `can_kick`; target may not be the leader (`ErrCannotKickLeader`); same exit state. Push type 1.
   No self-kick check, no rank comparison.
7. **demiseTo** `newLeaderCid` (a **character id**, not member id) (`membership.go:351`, `service_guild_management.go:59-87`): caller must be current leader; target must be a member.
   SQL swaps ranks: new leader -> 1, old -> 6 (`20260417184534_extra_db_functions.sql:326-345`).
8. **delGuild** (`updates.go:209`, `service.go:344`): leader only. Every member gets exit state (90% parked, guild quests abandoned), then `delete_guild` nulls `characters.guild_id` and deletes the guild (cascade rows).
9. **updateGuildMember** `{tableId, updateType:"rank", newData}` (`updates.go:14`, `service.go:310-341`): leader only; `newRank` in 2..6; unknown member -> push `a` "Không tìm thấy thành viên..." and `nil`.
   The client uses it to **promote an applicant to member** (`newData=6`, `GuildPanel.as:4683-4686`) but Go's `PromoteMember` calls `UpdateMemberRank` on a member row, so promoting an *application id* fails
   `GetMemberByID` -> `a` note. Real approval is `confirmGuildApply`. Treat the applicant path as unused.
10. **updateGuildRank** `{nameN, canAddN, canQuestN, canSlotN, canInfoN, canDelN, canDutyN, rankIdN}` N=1..6 (`updates.go:78-141`): leader only (`service_guild_management.go:48`). Rebuilds from `DefaultRankSettings`
    (`service_guild_helpers.go:160-169`), overwrites names and (rank != 1) the six flags, persisted as a `guild_logs` row (action `guildRankSettingsAction`). **Not enforced anywhere** (section 8).
    Default names: Bang chủ, Phó bang, Trưởng lão, Tinh anh, Thành viên cũ, Thành viên; defaults give ranks 1-2 all 1, rank 3 all but `canDel/canDuty`, rank 4 `canAdd/canQuest/canInfo`, rank 5 `canQuest`, rank 6 none.
11. **updateGuildNotice** `(gid, text)` (`updates.go:143`, `service.go:385-429`): leader or `can_edit_announcement`. `announcement = text`; `description` becomes `text` if non-empty (wire field `guildInfo` is `Description`).
12. **changeGuildName** `name` (`updates.go:173`, `service_guild_management.go:12-38`): leader only; unique name (self allowed); no cost, no length check, no profanity check.
13. **contribMoney** `{s: silver, g: gold}` (`updates.go:325-405`): `char.Money >= s && char.Gold >= g` else `ErrInsufficientFunds`. `guildMoney += s + g*2000`; `donateContrib += guildMoney/8` (integer division).
    Matches client `goldToContribution = gold*2000/8` (`GuildContribPanel.as:1075`); client forces silver to multiples of 1000 (`:715`). Silver is taken from `Money` only (not bind). Guild **exp is never increased** anywhere in Go.
    Note it debits the character **before** crediting the guild (`:364-373`), no rollback on guild failure.
14. **contribMaterial** `{slotId, num}` (`contrib_material.go:25-120`): bag slot only, `stack >= num > 0`. Consume-then-credit (`ConsumeItemStackByID` `:90`, then warehouse upsert `:95`, then contribution `:100`).
    `guildMaterialContribution` (`:265-289`): item 2039 passes unconditionally (warehouse count = num, contrib = num*100); every other item needs `kind == 6 && color >= 2`;
    `factor = color^5`; bucket by template id (`:291-302`): `24,21,23,26,28` -> rare mat 2027 (`floor(num*factor/8)` stock, `floor(num*factor*100/8)` contrib);
    `16,7,18,22,25,27` -> common mat 2026 (`/8`, contrib `*50/8`). **Dead path with the seeds**: every material (ids 7,16,18,21-28) has `color = -1` and 2039/2026/2027 are `kind=5`
    (Mongo `data_tbl_item_template`); no row has `kind=6 && color>=2` (count 0), and the client rejects `color < 2` too (`GuildContribPanel.as:775`). So donating materials never works with these seeds.
15. **Warehouse** (`guild_warehouse`): sid of a slot = `500 + slot_index + 1` (`domain/guild/extras.go:59`), type 28, `itemId = sid`. `upsert_guild_warehouse_material` merges by `(guild, template)` first, else takes the lowest free `slot_index`
    (`20260417184534_extra_db_functions.sql:347-390`). `moveGuildItem(sSid, tSid)`: move into empty slot, merge same template up to `stack_max` (99999 fallback), else split; any member may move (no rank check).
    `dropGuildItem(slotId)`: leader only (`:147`), pushes `onDelGuildSlot` then `onDelGuildItem{tid,num}`. Withdrawing items to a bag is **not implemented**.
16. **developSkill** `{gid, sid}` (`updates.go:407-455`): `sid` must exist in skill data; caller must be a member of that guild (`service_guild_skills.go:92-95`) - **not even leader-only**
    despite the client text "needs to be opened by the guild leader" (`data_tbl_skill.description`). No `guild_dev_exp / guild_dev_money` charge, no level or prerequisite check. Upsert inserts level 1, conflicts do nothing.
17. **getGuildPrivateSkillData** (`panel.go:121`): `{gid, skillDevData}` where `skillDevData = {skillId: 1}` filtered to the **highest level per `code_name`** (`helpers.go:235-270`).

### 3.3 Wire shapes

Guild object, 22 keys from `Guild.ToDTO` (`domain/guild/guild.go:93-136`, handler override of `ln` at `helpers.go:141`):
`id` (string), `name`, `cid` (leader id string), `ln` (**leader name** after override; raw DTO has the id), `level` (string), `exp` (number), `iconCode` (string, or `null` when icon = 0), `money` (number), `guildInfo`
(= description), `bagSlotNum` (string), `memLimit` (string), `dailyProduce` "0", `daliyCost` "0" (sic), `moneyLimit` "0", `time` ("YYYY-MM-DD HH:MM:SS" or `null`), `timeStamp` null,
`totalExp` (= exp), `skillData` (JSON **string** `{"skillId":level}`, `"{}"` when none), `announcement`, `joinLevelReq` (number), `memberNumber` (number), `members` (array). Legacy memory said "18 keys"; the code emits 22.

Member DTO (`GuildMember.ToDTO`, `guild.go:152-170`): `id`, `tableId` (both = `guild_members.id`), `gid`, `cid`, `rank`, `status` (1 if connected or `last_online` < 5 min, else 0), `name`, `level`, `class`, `memberClass`,
`note` = `"name|classId|exp"` (`guild.go:189`), `duty`, `normalContrib`, `donateContrib`, `contribution` (= total).
Application DTO (`extras.go:31-56`): same keys, `rank:-1`, `status` online 0/1, `normalContrib/donateContrib: 0`, no `duty/contribution`.
Panel (`helpers.go:87-133`): `{myGuild, memberList[], guildRank[], applyList[], skillDevData{}}`. An **applicant** (no membership, pending application) gets `memberList=[theirApplication]`, `applyList=[]` (`:108-124`); the client keys on `rank == -1`.
Warehouse slot (`extras.go:58-67`): `{id, sid, type:28, itemId:sid, stackNum, tid}`; `getInitGuildSlot` returns `{slotId: slot}`.
`chooseCharactor` login payload carries `guild` (guild DTO or null), `gData` (own member DTO), `gi` (warehouse map) (`auth/login_payload.go:348-387`). `showCharacterInfo`'s `guild` is the guild **name string**, default `"Không bang hội"`
(`auth/characters.go:278-297`).

### 3.4 Chat channel 2 and guild tag on scene players

- Guild chat: `say(channelId=2)` -> `broadcastGuildChat` (`chat/say.go:331-356`): sender not in a guild -> `onBlueMsg("Chưa có bang hội")`; else the **same `onSay` payload as other channels** (`{id,name,type,channelId,pmLevel,msg}`, `say.go:57-64`)
  is sent to every **online** guild member including the sender. No cooldown or rank gating beyond the common chat limiter.
- Guild-hall construction messages are `onSay` with an extra `guildName` object, `type:2`, `footle:false` (`construction_rpc.go:575-586`).
- **Guild tag on scene players: confirmed negative.** Neither the scene create-char DTO nor `onSay` carries a guild name; grep for `guild` in `application/scene`, `handlers/scene`, `domain/character` finds only guild id and contribution fields. The only place a player's guild name is shown is `showCharacterInfo.guild`.

### 3.5 Buildings (light)

- `data_tbl_building`: 18 rows; `id`, `code_name` (`BUILD1000xx` = chain key), `level`, `name`, `type` (1 normal, 3 empty lot `EXT_POINT` id 1, id 10 "Đang xây" placeholder), `num_limit`, costs `money_cost, exp_cost, gen_m_cost (2026), rare_m_cost (2027), sp_m_cost (2039), gold_cost, maintain_cost`,
  `pre_building` / `post_building` (pipe lists of prerequisite building ids), `prop1..4 / prop1_value..4_value`, `func_script` (AS snippets), `icon_code`, `res_code`.
  Chains: hall `BUILD100001` ids 2,6,7,11,12,16 (levels 1-6); house `BUILD100002` ids 3,8,9,13,14,17 (`num_limit` 2); treasury `BUILD100003` ids 5,15 (levels 1-2); academy `BUILD100004` ids 4,18 (levels 1-2).
  Level-1 costs, e.g. house L1: 60,000 money + 192,000 exp + 300 gen mat + 100 special mat; hall L2: 1,260,000 money, 2,016,000 exp, 3000/1600/2000 mats (`pre_building "2|3|5"`).
  `prop1/prop1_value`: hall `4 -> level`, `1 -> 20`; treasury `5 -> level`; house `1 -> 20/30/40/50/60/70` (likely "+members"; **unverified**, Go never reads props). `func_script` strings drive menu entries: `extInfo`, `showGuildWarehouse`, `showDonatePanel`, `showGuildSkillPanel` (`build_rpc.go:122-164` substring-matches them).
- `data_tbl_extend_position`: 11 lots on map 49 (`id 1..11`, `tid 1`, `build_type 1`, `pos_x/pos_y`, `pos_dir 0`).
- Go layout (`buildings.go:90-138`), **[go]** and ignores `pre_building`: only extend ids 4, 5, 9, 10, 11 are ever occupied: 4 and 9 houses, 5 treasury, 10 hall, 11 academy.
  hall tid by guild level 1..5 = 2,6,7,11,12 (else 16); house = 3,8,9,13,14 (else 17); treasury = 5 at L1 else 15; academy = 4 at L1 else 18. Other lots stay empty forever.
  `createGuildBuildings` only answers when the caller stands on map 49, else `[]` without a push (`:34-37`).
- Build flow (`construction_rpc.go`): `constructBuild(extendId, targetTid, mode, mapId)` (mode 1 upgrade, 2 create) validates membership + the lot exists, stores `constructionState` **in memory** keyed `buildId = 1346 + extendId`
  (`:51-52`, upgrade with `extendId > 1346` keeps it), pushes `onCreateBuild` to self, `setBuildNpcState{state:1,eid}` to everyone, guild `onSay`. `finishCreate/finishUpgrade(buildId)` need the stored state; upgrade runs `UpgradeGuildLevel`
  (**leader-only**, so a non-leader finish returns `ErrNotGuildLeader`; create just echoes). No timer, no cost, no prerequisite or `num_limit` check, nothing persisted. A restart wipes in-progress state (finish then 404s).
  The client does the cost check against `guild.money/exp` and warehouse stock (`GuildBuildProcess.as:379-481`) but **no server deduction** follows.
- Skill data: 94 `data_tbl_skill` rows with `guild_dev_exp > 0` (`type 11`; `kind 2` x88, `kind 5` x6): 4 core lines `SKILL700101..401` (attack/magic attack/def/magic def, levels 1-6, `buff_id` 1316-1323...) and `*NO` variants, plus
  `SKILL530601` (pet), `SKILL534701/534801` (cooking, pharmacy), `534901/535001` (track), `535601`, `535701/535801/536001` (HP/MP/SP-ish). Per row: `guild_dev_exp` (e.g. 192000 L1), `guild_dev_money` (120000 L1), `cost_guild_contrib` (17280 L1),
  `req_level`, `use_env 4` (= guild skill, client `SkillUseSlot.as:437`). 104 rows have `cost_guild_contrib > 0`.
  **No Go code applies guild skill effects to members** (the only non-guild references to `guild_dev_*` are the model struct `gamedata/models/skill.go:32-33,108-109`).

### 3.6 PvP

1. **Opt-in toggle**: `uif("apvp", bool, false)` stores into `PMProcessData["interfaceData"]` + `character_interface_settings` (`auth/interface_settings.go:52-93`, registered `auth/handler.go:247`); default `apvp:false` (`:345`).
   Client toggles via minimap button (`MiniMapCanvas.as:764`). Map rows have `pk` (0/-1 none, 1 danger, 2 arena): client prints "forced PVP zone" text when `map.pk > 0` (`GameScene.as:282`, `GAMESCENE_S[0]`)
   but **Go ignores `pk`** and `safe_flag` (grep `\.Pk\b` finds only the model).
2. **PVPStartClient(targetCid)** (`pvp_start.go:22-52`): args < 1 or self-target -> `ErrInvalidArgs`. Target `apvp` false/unreadable -> push `onMidNote("Mục tiêu chưa bật PK, không thể tấn công.")`, return `{success:false, blocked:"target_apvp_off"}`.
   Attacker's own `apvp` is **not** checked. Flash retry-with-force is not honoured.
3. **startPVPBattle** (`:54-117`): both characters loaded from DB; `MapID` must match (`ErrInvalidInput`); squared distance on **persisted** `PosX/PosY` must be <= 20 px (`pvpStartMaxDistance = 20`, `:19`), else
   `onMidNote("Mục tiêu quá xa, không thể tấn công.")` + `{success:false, blocked:"out_of_range"}`; target must have a live connection (else `ErrNotFound`); either side already in an active battle -> `ErrInBattle`
   (`application/combat/pvp.go:20-27`, unless that battle's player is dead, in which case it is resolved first, `service.go:216`).
   **Not checked**: safe map/area (client only: `CharactorView.as:184-189` refuses when target stands in `map.sArea` with `CHARACTORVIEW_S[0]`), level gap, party/guild/friend relation, newbie protection, PK cooldown, attacker death/HP.
4. **Battle build** (`pvp.go:15-69`): `BattleTypePVP = 2` (`domain/combat/battle.go:23`); attacker char slot 10 (`PosPlayerCharCenter`), attacker pet 15, target char **0** (`PosEnemyCharCenter`) with `Side=Enemy`, target pet 5
   (`domain/combat/position.go:22-37`). Only the single active battle pet of each side. `battle.Start()`, `initBattleFieldID`.
5. **Round resolution**: waits for **both** characters' commands (`IsPlayerCommandActor` returns true for any character in PvP, `battle.go:761-768`); deadline **25 s** (`application/battle/service.go:20`) re-armed each round
   (`group_battle.go:100-120`), timeout fills `ClientActionTimeout` for missing actors (`application/battle/timeout_handler.go:47-60`). Damage uses the generic turn processor; no PvP-specific formula.
6. **Result**: `EndBattle` is type-agnostic (`application/combat/service.go:470-517`). Rewards come from `CalculateExpReward/MoneyReward` which only count `enemy.IsNPC && !IsAlive` (`domain/combat/damage.go:186-229`), so a character enemy yields **0 exp, 0 money**;
   creature loot is looked up by `enemy.EntityID` (`rewards.go:189-193`) which for a PvP target is a character id (collision risk, **unverified** that any creature has that id). No honor/pk points/title/red name/bounty/penalty exists
   (grep of `honor|pkvalue|redname|evil` in `application/combat`, `domain/combat`, handlers: none). HP/MP are persisted per player at their own `battlePlayEnd` (`handlers/combat/battle.go:380-405`). A dead player uses the normal revive flow.
7. **Disconnect quirk**: `HandleCharacterDisconnect` ends the battle for a lone `SidePlayer` (`application/combat/service.go:235-286`); `CountAlivePlayerCharacters` counts only `SidePlayer` characters, so a **target** disconnect ends the battle and
   the winner is whatever `CheckVictory` says else `SideEnemy` (i.e. the disconnecting target "wins"). **[go]** bug, do not copy.
8. **Cross-server**: `battleServer.inBattleServer -> assassinate` (client branch) is out of scope.

### 3.7 Rankings

`rankGet(category)` (`rank_get.go:38-74`): needs a character; `category` must be a string in `{expBattle, exp, money, pop, totalBp, achPoint}` (`:13-20`), else `ErrInvalidArgs`. Returns
`{ data: { desc: {guild:"Không có bang", id:null, name:null, value:null}, key: <same> }, name: category }` (`:22-35,69-72`) - **[stub]**, not a top-10 list (the file header and legacy memory claim otherwise).
`getRankList` returns `nil` (`:76-80`). Client (`ActivePanel.as:3129-3156`): `onInfo({name, data})` sets `this[name+"Grid"].dataProvider = data`, with `name=="level"` post-processing `value = expToLevel(value)` and `name=="treasureHunt"` time formatting.
Client categories requested (`ActivePanel.as` `getInfo(...)` calls): `popMonth, popWeek, totalBp, lastWeekBp, expBattle, exp, money, pop, achPoint, treasureHunt` plus `marriage` (`getCoupleRank(0)`) and `guildWarRank` (`getGuildWarRank(null)`).
Go rejects `popMonth, popWeek, lastWeekBp, treasureHunt` with an error. Row fields used by the grids: `name`, `guild`, `value` (and `id`), `guildName/ln/level/totalTime/winNum` for guild war.

## 4. State

### 4.1 Persisted in Go (Postgres, baseline migration `20260328184527_baseline_mcgame_schema.sql`)

| Table (lines) | Columns |
|---|---|
| `player.guilds` (2836-2858) | `id` bigint seq, `name` varchar(50) UNIQUE, `leader_id`, `level` def 1, `experience` bigint, `population`, `max_population` def 50, `icon`, `funds` bigint, `contribution_total`, `announcement`, `description`, `join_level_req` def 1, `join_approval_required` def true, `activity_points`, `last_activity_reset`, `created_at`, `updated_at`; indexes on leader and `(level, experience)` |
| `player.guild_members` (2742-2762) | `id`, `guild_id`, `character_id`, `rank` def 3 (code always passes one), `duty` varchar(50), `contribution_normal/donate/total/weekly`, `can_invite/kick/edit_announcement/access_warehouse/manage_warehouse` (all default false, never written), `joined_at`, `last_online`; UNIQUE `(guild_id, character_id)` |
| `player.guild_applications` (2683-2695) | `id`, `guild_id`, `character_id`, `message`, `status`, `created_at`, `processed_at/by`; UNIQUE `(guild_id, character_id)`; code allows one pending per character |
| `player.guild_warehouse` (2806-2818) | `id`, `guild_id`, `slot_index`, `template_id`, `stack_count`, `properties` jsonb, `deposited_by/at`; UNIQUE `(guild_id, slot_index)` |
| `player.guild_skills` (2780-2788) | `id`, `guild_id`, `skill_id`, `level`; UNIQUE `(guild_id, skill_id)` |
| `player.guild_logs` (2713-2724) | rows reused as KV: rank settings JSON and `{pageCount}` bank pages (`guild_repository_extra.go:156-190`) **[go]** |
| `player.characters` | `guild_id` (FK `ON DELETE SET NULL`), `guild_restore_contrib/donate` (migration `20260410043725`), currency ids 20/21 hold `GuildContrib/DonateContrib` |
| SQL fns | `add_guild_member`/`remove_guild_member` also set `characters.guild_id` and `guilds.population +-1` (`20260414084416...sql:3-20, 586-606`) |

Member contribution columns are updated by `AddMemberContribution` (guild_repository_extra.go:65) and `SetMemberContribution` on restore; character currencies hold the same numbers (kept in sync by hand, not transactionally).

In memory only: `constructionState` map (`construction_rpc.go:25-36`), last build context per connection (`rtmp/connection.go:54-55,291-301`), all PK invites/matches (`application/pk/service.go:37-45`), battles (`battleRepo`).

### 4.2 Proposed Mongoose schemas (H5)

- `guilds` (`modules/guild/guild.schema.ts`): `guildId` (counter, number), `name` (unique), `leaderCid`, `level`, `exp`, `money`, `memLimit` (50), `bagPages` (1), `announcement`, `description`, `iconCode`, `rankSettings: [{rank,name,canAdd,canQuest,canSlot,canInfo,canDel,canDuty}]`,
  `skills: [{skillId, level}]`, `buildings: [{extendId, tid}]` (only if costs are ported), `createdAt`.
- `guild_members`: `memberId` (counter; the wire `id/tableId`), `guildId`, `cid` (unique), `rank`, `normalContrib`, `donateContrib`, `joinedAt`. Name/level/class are joined from `characters` at read time.
- `guild_applications`: `appId` (counter, **separate id space from members in the wire `tableId`: the client mixes them in `quitGuild`**; Go keeps two tables with independent ids so collisions are possible, use one shared counter), `guildId`, `cid` (unique), `createdAt`.
- `guild_warehouse`: `slotId` (counter), `guildId`, `slotIndex`, `templateId`, `stackCount`.
- Character fields: `guildId`, `guildRestoreContrib`, `guildRestoreDonate`, `guildContrib`, `donateContrib`, plus `interface.apvp` (boolean; `uif` is not in H5 yet).
- Restart: everything above is persistent; in-progress construction, PK invites and battles are lost (acceptable, same as Go).

## 5. Data tables (Mongo `data_tbl_*`)

| Collection | Use |
|---|---|
| `data_tbl_building` (18) | build chain, costs, prerequisites, props, `func_script` (section 3.5) |
| `data_tbl_extend_position` (11) | lots on map 49 |
| `data_tbl_skill` | guild skills: `guild_dev_exp`, `guild_dev_money`, `cost_guild_contrib`, `use_env 4`, `type 11` |
| `data_tbl_item_template` | guild materials ids 2026 / 2027 / 2039 (`kind 5`, `type 550`, `color -1`); crafting materials 7,16,18,21-28 (`kind 6`, `color -1`) |
| `data_tbl_map` | `pk`, `safe_flag`, `s_area`, `dead`: counts: pk>0 on 64 maps (53 with `pk 1`, 11 with `pk 2`); `safe_flag 1` on 53 maps; map 49 `pk 1 safe 0`, map 54 `Chiến Trường Bang Hội` `pk 2` |

Sample building rows (id: name, level, costs money/exp/gen/rare/sp, pre): `2: Đại sảnh cấp 1, 1, 0/0/0/0/0, null`; `3: Nhà cấp 1, 1, 60000/192000/300/0/100, "2"`; `4: Học viện cấp 1, 1, 630000/1008000/1500/800/1000, "6"`;
`5: Kho cấp 1, 1, free, "2"`; `6: Đại sảnh cấp 2, 2, 1260000/2016000/3000/1600/2000, "2|3|5"`; `16: Đại sảnh cấp 6, 6, 11550000/18480000/27000/14000/8000, "12|14|15|4"`.
Note `pre_building` of academy L1 is `"6"` (hall L2) which Go's fixed layout does not honour.

Id pairing: guild material item ids 2026/2027/2039 = `GamePredef.GUILD_GENERAL_M/RARE_M/SPE_M` (`GamePredef.as:1768-1770`); `IN_BUILDING = 10` = building row "Đang xây"; build id `1346 + extendId` is **[go]**.

## 6. Push sequences

All "guild members" pushes go only to **online** members (`helpers.go:336-350`); "all" = `BroadcastToAll`.

- **addGuild** ok: `onUPP{money,moneyBind,guildContrib,donateContrib}` (self) -> `onAddGuild(guildDTO)` (all) -> `onInitViewGuildP(panel)` (self) -> `a` guide (self) -> `a` restore note if contribution > 0 -> RPC result = guildDTO.
  Errors: `a` message and `nil` result (no RpcException) for level/funds/name/in-guild.
- **addGuildMember** (apply): `onAddGuildMember(appDTO)` to self, then to all online members (`:140-144`; the applicant is not a member so receives only the first), result appDTO.
- **confirmGuildApply**: `onConfirmGuildApply{gid, tableId, cid, gData}` to members, then to the applicant; then `onUPP{guildContrib,donateContrib}` + `a` restore note to the applicant. Client handler `onConfirmGuildApply(member)` (`GuildPanel.as:2930`).
- **refuseGuildMember**: `onDelGuildMember{id,gid,cid,name,type:3}` to members, applicant; applicant also `onUPP` + `a` leave note. Quit type 2 (member), 4 (applicant cancel), kick type 1.
- **demiseTo**: `onDemise{gid, oldCid, newCid, ln}` to members, then `updateGuildInfo(guildDTO)` to all.
- **delGuild**: `onDelGuild(guildId)` to all, then per ex-member `onUPP{contrib}` + `a` leave note.
- **updateGuildMember**: `onUpdateGuildMember{tableId, updateType:"rank", newData}` to members.
- **updateGuildRank**: `onUpdateGuildRank(payload{gid, rankData})` (one arg). **Client handler takes two args `(gid:int, rankData:Object)`** (`GuildPanel.as:1747`), so Go's single-object push does not match; H5 should send `(gid, rankData)`.
- **updateGuildNotice**: `updateGuildInfo{id,name,cid,ln,level,exp,memberNumber,memLimit,bagSlotNum,money,guildInfo,updateType:3,daliyCost,dailyProduce,moneyLimit,timeStamp}` to members. Client has `onUpdateGuildInfo(obj)` (`GuildPanel.as:1976`), not `updateGuildInfo`.
- **changeGuildName**: `onChangeGuildName(name)` to members then to all (`:201-204`); client handler `onChangeGuildName(String)` matches.
- **guildLevelUp / addGuildBankSlotNum / addMaxGuildMemberNum**: `onGuildPropertyRefresh{level | bagSlotNum | memLimit}` to members. Client has `onUpdateGuildProperty(obj)` (copies keys onto `myGuild`, `GuildPanel.as:1798`); no `onGuildPropertyRefresh` anywhere in `docs/client`.
- **contribMoney**: `onMinusMoney(cid,"money",silver,newMoney)` / `("gold",...)`, `onUpdateGuildNumProp{type:3,num}` (members), `onUpdatePerNumProp{name,type:1,cid,num}` (self), `onSystemSay("<name> đã quyên góp ... bạc/vàng.")` (self). Client has `onUpdateNumProp(obj{type,num,cid})` (`GuildPanel.as:4876-4916`), so the Go names are probably wrong.
- **contribMaterial**: item push (`onDelCharactorSlot(id, sid)` or `onAddCharactorSlot(item)`), `onUpdatePerNumProp{type:1,...}`, `onAddGuildSlot(slotDTO)` (members); result `1`.
- **moveGuildItem**: `onMoveGuildItem{sSid,tSid,sId}` / `onStackGuildItemInto{sSid,tSid,sId,tId,tStackNum}` / `onStackGuildItem{...,tStackNum,sStackNum}`; mismatched template -> `a` note + `nil`. **dropGuildItem**: `onDelGuildSlot(slotId)`, `onDelGuildItem{tid,num}`.
- **developSkill**: `onGuildSkillDeveloped{gid,sid,skillDevData}` to members, result same payload.
- **Buildings**: `createGuildBuildings` -> `onCreateGuildBuildings([...])` (self) and as RPC result; `clickBuild` -> `onList(buildId, "Công trình bang hội", "Mọi người hãy đến xây dựng", options[])` (sync) with options `{label,func,bid}`;
  `execBuildFunc(func, buildId, buildType)` -> `onShowExtInfo(buildId)` | `onShowGuildWarehouse(5)` | `onShowDonatePanel(5)` | `onShowGuildSkillPanel(skillPayload)`; construct -> `onCreateBuild{...tid:10,layer:1}` (self), `setBuildNpcState{state:1,eid}` (all), `onSay` (members);
  finish -> `onGuildPropertyRefresh(guildInfo)` (members), `reloadBuild{extendId,buildState:"",mid,posX,posY,posDir,gid,id,layer:1,tid,timeStamp:null}` (members; client `BuildingView.reloadBuild`), `setBuildNpcState{state:0}` (all), `onSay` (members); reset -> `onCancelUpgrade{bid}` (self), `setBuildNpcState{state:0}`.
  Layer-0 empty lot rows: `{posX,layer:"0",tid,id,mid,posY,posDir,buildType}`; occupied rows `layer:"1"`, `id = 160 + extendId` (`buildings.go:52-67`) vs construct id `1346 + extendId`: inconsistent ids **[go]**.
- **PVPStartClient** success order (`pvp_start.go:119-134`, per viewer, attacker first then target): `SetBattleID`, `AddWatcher`, owner-pet `onUpdatePet(petId,"currentHp",str)` + `("currentMp",str)`, `onSetCharState{cid:str,state:5}` to self and scene broadcast (excluding the viewer),
  `onBattleStart{battleFieldId, cList (shared canonical), guest:false|true, sneakFlag:0, bossFlag:false, airBattle:false, battleType:2, mapId}`; then arm the 25 s deadline. RPC result `{success:true, battleId}`.
  Failures: `{success:false, blocked}` plus `onMidNote`; `ErrInBattle`/`ErrNotFound`/`ErrInvalidInput` via `rtmp.ErrorToResponse` (a normal reply, not a throw).
  Later per round: `onCmdReady`, `onBattlePlayList` to watchers (both players), final `onUPP{currentHp,currentMp}` per player, `battlePlayEnd` per player resets state (`onSetCharState{state:1}`). Client mirrors the stage for `guest=true` (`BattleStage.as:803-828, 2863-2874`).
- **pk lobby (unused)**: `onMidNote` "Đã gửi lời mời PK..." (inviter), `onForcePVP(fromCid)` (target), `onPkMatchReady{matchId,mapId,players[]}`, `onPkInviteExpired(matchId)`, `onPkStart{matchId,startAt}`, `onPkActionResult{...}`, `onPkResult{matchId,winner,reason,endAt,mapId,state}` + `onPkEnd(matchId)`. Defaults: invite 30 s, match 5 min (unused), cooldown 10 s per inviter (`application/pk/service.go:27-34`).

## 7. Port notes (TypeScript)

Where: `server/src/modules/guild/{guild.module.ts, guild.rpc.ts, guild.service.ts, guild-rules.ts, guild.schema.ts, guild-build.service.ts}`; `server/src/modules/pk/{pk.rpc.ts, pk.service.ts, pk-rules.ts}`;
`server/src/modules/rank/{rank.rpc.ts, rank.service.ts}`; shared types in `packages/shared/src/guild.ts` re-exported from `index.ts`. Accessors to add to `GameDataService` (cache at startup, like `skills`): `building(id)`, `buildings()`, `extendPositions(mapId)`, `guildSkills()`.
Gaps in H5 today: no `guild`/`gData`/`gi` in the `chooseCharactor` result, no `uif`/`apvp`, no `getCharInfo.guild`, no rank RPCs, `BattleManager` is PvE only (`Side = 'player'|'enemy'`, `Fighter.kind 'character'|'creature'|'pet'`).

Pure rules (unit-testable, `guild-rules.ts`):

```ts
export const GUILD = { CREATE_LEVEL: 50, CREATE_COST: 1_000_000, START_MAX: 50, MAX_STEP: 10, BANK_PAGES_MAX: 4, REFUND_PCT: 90 } as const;
export const RANK = { APPLICANT: -1, LEADER: 1, VICE: 2, OFFICER: 3, ELITE: 4, VETERAN: 5, MEMBER: 6 } as const;
export const donateContribOf = (silver: number, gold: number) => Math.floor((silver + gold * 2000) / 8);
export const restore = (v: number) => Math.floor((v * 9) / 10);
export const canManage = (m: Member) => m.rank === RANK.LEADER; // Go: leader only; can_* flags unused
export const guildDto = (g, leaderName, members): GuildWire => ({ id: String(g.guildId), name: g.name, cid: String(g.leaderCid), ln: leaderName,
  level: String(g.level), exp: g.exp, iconCode: g.iconCode ?? null, money: g.money, guildInfo: g.description, bagSlotNum: String(g.bagPages),
  memLimit: String(g.memLimit), dailyProduce: '0', daliyCost: '0', moneyLimit: '0', time: fmt(g.createdAt), timeStamp: null, totalExp: g.exp,
  skillData: JSON.stringify(Object.fromEntries(g.skills.map((s) => [s.skillId, s.level]))), announcement: g.announcement,
  joinLevelReq: g.joinLevelReq, memberNumber: members.length, members });
```

`GuildService` core (consume-then-credit, no Mongo transaction needed per op; use `findOneAndUpdate` guarded by `money >= cost`):

```ts
async createGuild(sess, name) {                                // 'addGuild'
  const c = await this.chars.get(sess.cid);
  if (c.level < GUILD.CREATE_LEVEL) return this.note(sess, 'Cấp không đủ để tạo bang hội');
  if (c.moneyBind < COST && c.money < COST) return this.note(sess, 'Không đủ tiền để tạo bang hội');
  if (await this.members.exists({ cid: c.id })) return this.note(sess, 'Bạn đã có bang hội');
  if (await this.guilds.exists({ name })) return this.note(sess, 'Tên bang hội đã tồn tại');
  // unique index on name/cid protects the race; debit bind first, else silver
  const g = await this.guilds.create({ guildId: await nextId('guild'), name, leaderCid: c.id, level: 1, memLimit: 50, bagPages: 1, rankSettings: defaultRanks() });
  await this.members.create({ memberId: await nextId('gmember'), guildId: g.guildId, cid: c.id, rank: RANK.LEADER, ...restoreOf(c) });
  await this.chars.debit(c.id, c.moneyBind >= COST ? 'moneyBind' : 'money', COST);
  sess.callback('onUPP', { money, moneyBind, guildContrib, donateContrib });
  this.scenes.broadcastAll('onAddGuild', dto); sess.callback('onInitViewGuildP', await this.panel(c.id));
  return dto;
}
```

Port decisions to confirm with the user (Go behaviour vs sane defaults): (a) keep "leader-only" authority or honour rank flags `canAdd/canDel/canInfo` (Go ignores them; the client UI lets the leader edit them, so enforcing them is the evident original intent);
(b) enforce costs for `guildLevelUp`, `addMaxGuildMemberNum`, `addGuildBankSlotNum`, build costs from `data_tbl_building`, `developSkill` costs from `guild_dev_exp/money` (Go charges nothing; the client only pre-checks build costs and skill exp/money, `TipDevSkill.as:161-177`);
(c) fix the Go bugs listed in section 8.

Guild chat: in `ChatService`, accept channel 2: `guildOf(cid)` else `RpcException.forbidden('Chưa có bang hội')`, then send `onSay` to online members via `SceneManager` per-character lookup, same `SayPush`.

PK in H5 (`pk.service.ts`, extends `BattleManager`):

```ts
async startPvp(sess, targetCid) {                              // 'PVPStartClient'
  if (targetCid === sess.cid) throw RpcException.invalidArgs('targetCid');
  if (!(await this.settings.apvp(targetCid))) { sess.callback('onMidNote', 'Mục tiêu chưa bật PK, không thể tấn công.'); return { success: false, blocked: 'target_apvp_off' }; }
  const [a, t] = await Promise.all([this.chars.get(sess.cid), this.chars.get(targetCid)]);
  if (a.mapId !== t.mapId) throw RpcException.invalidArgs('map');
  if ((a.posX - t.posX) ** 2 + (a.posY - t.posY) ** 2 > 20 ** 2) { /* onMidNote 'Mục tiêu quá xa...' */ return { success: false, blocked: 'out_of_range' }; }
  if (this.battles.inBattle(a.id) || this.battles.inBattle(t.id)) throw RpcException.conflict('inBattle');
  const b = this.battles.createPvp(a, t);   // attacker slots 10 (+pet 15), target slots 0 (+pet 5), side 'enemy' for the target
  // push per viewer: onUpdatePet hp/mp, onSetCharState 5 (self + map), onBattleStart { guest: false | true, battleType: 2, ... } ; deadline 25 s
  return { success: true, battleId: b.id };
}
```

Needed in `battle.types.ts`: `battleType: 1 | 2`, a second player-controlled side (`Fighter.kind 'character'` with `side 'enemy'` + a `controller: cid`), commands required from both, `deadline = 25_000`, settle with **no rewards** (skip exp/money/loot/kill credit when `battleType === 2`),
disconnect = disconnector loses (fix Go quirk), per-viewer `onBattleStart.guest`. Everything else (`round.ts` damage, `onBattlePlayList`, `battlePlayEnd` HP persist) reuses the existing pipeline. The `pk*` lobby family should **not** be ported (no client caller).
H5 also needs the `uif(key, value, isPet)` RPC persisted to character settings (key `apvp`), safe-area gating is client-side (add a server check using `data_tbl_map.s_area`/`safe_flag` as a hardening, outside Go parity).

Rankings (`rank.service.ts`): implement `rankGet(name)` over `characters` with row `{id, name, guild, value}`: `exp` (level/exp desc), `money`, `pop`, `expBattle`, `totalBp`, `achPoint`; return `{name, data: {"1": row, ...}}` top 10. Which fields exist in H5 today: `level/exp/money` only; the others need new columns or return `{}`.
Source and refresh in Go: none (stub). Data-backed pieces are only the category names and row field names the client binds.

## 8. Unverified, deviations from legacy memory, confirmed negatives, open questions

Deviations from `docs/memory/guild-system.md` / `pvp-apvp.md` (verified against code):
- Guild DTO has **22** keys, not 18; `ln` is the leader **name** on the wire (handler override), the raw `ToDTO` has the id.
- `iconCode` now comes from `guilds.icon` when non-zero (`guild.go:111-118`); the memory file says always `null`.
- `guild_skills.level` stays 1 and is never upgraded; `developSkill` has no cost or permission check.
- `rankGet` is **not** a top-10 list (handler header comment is stale): empty-shaped stub.

Confirmed negatives: rank permission flags are never enforced; no guild tag in scene/createChars payloads; no guild skill stat effect on members; no PvP rewards/honor/PK value/red name/death penalty; no safe-map or map-`pk` gating on the server;
no guild exp gain anywhere; no registration collisions for any guild/pk/ranking RPC; `addGuildSkill`/`improveGuildSkill` unregistered; `getRankList` never called by the client under that RPC name (the `getRankList` in `CrossBattleRank.as:552` is a local function, **unverified** what it calls).

Go bugs not to copy: `onUpdateGuildRank` arity (1 arg vs client's 2); push names `onGuildPropertyRefresh`, `updateGuildInfo`, `onUpdateGuildNumProp`, `onUpdatePerNumProp`, `onGuildSkillDeveloped`, `onAddGuildSlot`, `onDelGuildSlot`... have **no matching AS handler names** in the decompiled panels
(`onUpdateGuildProperty`, `onUpdateGuildInfo`, `onUpdateNumProp` exist; `DataManager.addGuildSlot/delGuildSlot/updateGuildSlot` exist, `DataManager.as:501,542,784`) - the real routing lives in the truncated `CallBack.as`, **unverified**: confirm with `flash-client-researcher`
before choosing H5 push names; contribMoney debits before crediting without rollback; applicant promote path in `updateGuildMember`; disconnecting PvP target "wins"; guild application ids and member ids are separate sequences but the client's `quitGuild(id)` is ambiguous between them;
`finishUpgrade` by a non-leader fails with a generic error after consuming no resource; `createGuildBuildings` ids `160+extendId` vs `1346+extendId`; character contribution vs `guild_members.contribution_*` can drift.

Open questions:
1. Original (live) cost model for guild level up, member cap, bank pages and build/skill costs: only the client pre-checks exist; `prop1..4` meanings are unverified (member cap +20..70?).
2. How `guild.exp` was meant to grow (client has type 4 `GUILD_EXP` in `onUpdateNumProp`, Go never emits it, yet buildings cost 192,000+ exp).
3. Material donation: with `color = -1` seeds the feature is dead for both client and server; decide whether to relax the `color >= 2` gate (e.g. use item quality) or keep it dead.
4. Guild skill effect on members (`use_env 4`, `buff_id` 1316...): not implemented in Go; client RPCs `addGuildSkill/improveGuildSkill` expect a member-side learn flow that costs `cost_guild_contrib`. Needs its own design if wanted.
5. Is the PvP `guest` result value flipped for the target in the final `onBattlePlayList` end marker (Go sends `result` from the attacker's perspective to both)? **unverified** in `BattleStage.as`.
6. PK map semantics: should `data_tbl_map.pk > 0` (client "forced PVP zone") bypass the target's `apvp` opt-in as the client text says? Go never does.
7. Whether any creature id collides with a character id for the PvP loot lookup (`rewards.go:189-193`); H5 should skip loot for PvP anyway.
