# Guild, PK and rankings (M6) — Implementation Plan

**Date**: 2026-11-04 · **Status**: Approved (2026-11-04; the user pre-approved M5–M8 plans and asked for autonomous execution with one commit per milestone)
**Goal**:
- **Guilds**: players found a guild (Lv ≥ 50, 1 000 000 silver), search and apply, approve or refuse applicants, manage ranks and permissions, kick, quit, transfer
  leadership, disband, edit the notice, rename, and talk on the guild channel. Members donate silver/gold/materials to raise guild funds and their own contribution.
  The guild levels up, extends members and bank pages, uses a shared guild bank, builds and upgrades guild buildings on the guild map, and members learn guild skills.
- **PK**: players can PK others on the map: the opt-in toggle, forced-PvP maps, safe areas.
- **Rankings**: players see real ranking lists.

Today there are no guilds, the guild chat channel is refused, PvP does not exist and rankings are absent.

Delivered in **four phases**, each implemented, lint/test-verified and browser-checked before the next:
- **A**: guild core, contribution and guild chat.
- **B**: guild bank, buildings, skills.
- **C**: PK.
- **D**: rankings.

Research base (the implementer reads both):
- `docs/research/2026-11-04_11_GUILD_PK_CLIENT_RESEARCH.md`: Flash contract (guild pushes are `GuildPanel.as` methods, payload keys §5, arg shapes, ranks, create gates, donate formulas, buildings and skills args, PK `PVPStartClient` and `uif apvp`, `guest` slot swap, `rankGet` categories), proposed types §6.
- `docs/research/2026-11-04_12_GUILD_PK_SERVER_RESEARCH.md`: Go rules (live vs dead, the 22-key guild wire object, leader-only checks, costs Go skips, PvP battle build, stub rankings, Go bugs to avoid §8).
- `docs/memory/chat.md`, `social.md`, `party.md`, `combat.md`, `economy.md`.

## 1. Decisions (H5) on the open questions
1. **Permissions**: the rank flags the leader edits in `updateGuildRank` (`canAdd2..5`, `canQuest`, `canSlot`, `canInfo`, `canDel`, `canDuty`) **are enforced** for ranks 2–5.
   The leader (rank 1) can do everything. Go only stored them; the Flash UI presents them as real permissions.
2. **Costs and progression**, since Go grants guild growth for free:
   - `contribMoney` adds the donated silver/gold to guild funds (`money`, `gold`).
     It gives the member `floor((silver + gold*2000)/8)` contribution (client formula) and adds the same amount to guild exp.
   - `contribMaterial` moves the material into the guild bank. The Go `color >= 2` gate is dropped because every seed has `color -1`.
     The material contribution uses the client formula (`color^5`, with color clamped to ≥ 1).
   - Buildings and the guild level use the `data_tbl_building` costs (guild money, exp, items 2026/2027/2039 from the guild bank) and prerequisites (pre/post building, level chain).
     The guild level = the main hall building level. There is no timer: a build completes on `finishCreate`/`finishUpgrade` when the costs are met.
   - `addMaxGuildMemberNum` (+10 members) and `addGuildBankSlotNum` (+1 page, max 4) cost guild funds.
     The implementer takes the prices from the client text/tables if present, else uses a documented H5 price and records it.
   - `developSkill` (leader) costs guild funds and exp per the skill row if the data has a cost, else an H5 price.
     Members learn guild skills (`addGuildSkill`/`improveGuildSkill`) with their own contribution, up to the guild-developed level.
     Skills are `TBL_SKILL` rows with `useEnv == 4`, max level 10. Their passive props apply to the member stats (buff props like pet passives).
3. **Line flag**: H5 has a single line with `guild = true`, so guild NPCs (type 17) are created.
4. **PK**:
   - `PVPStartClient(targetCid)` requires the **target's** `apvp` on (Go) **unless** the map has `pk > 0` (forced PvP, per the client text).
   - Both players must be on the same map within range (Go's 20 px; *(H5)*: 150 px, because client positions are coarser; record it), not in battle, not in the same party.
   - The target must be outside the map's safe area (client `sArea`) and the map must not be `safe_flag`. These are server-checked (Go only checked the client side).
   - No rewards or penalties (Go). A disconnecting player **loses** (Go's "disconnect wins" quirk is not copied).
   - `uif("apvp", bool, false)` persists the opt-in on the character, and the minimap button reflects it.
5. **Rankings**: `rankGet(category)` returns real top lists (top 100), computed on request and cached for 5 minutes, for categories with an H5 data source:
   - `exp` (by level then exp), `money` (moneyBind + money), `expBattle` (battle exp: the cumulative exp from battles if tracked, else empty).
   - The others (`pop`, `popMonth`, `popWeek`, `totalBp`, `lastWeekBp`, `achPoint`, `treasureHunt`) return the empty legacy shape until their systems exist (`achPoint` in M7).
   - Rows are `{id, name, guild, value}`.
6. **Guild push names**: use the client consumer names from `GuildPanel.as` (client research §5), not the Go names that have no client handler.
   Send `onUpdateGuildRank` with the 2 args the client handler takes.
7. **Guild state** is persisted in Mongo (`guilds`, `guild_members`, `guild_applications`, `guild_buildings`, `guild_skills`; the guild bank rows in `character_items` with a guild owner, or a `guild_items` collection; the implementer picks and records).
   On leaving, contribution resets and 90 % is parked to restore on the next join (Go).

## 2. Confirmed mechanics (summary; details with file:line in the research docs)
- Ranks: -1 applicant, 1 leader, 2–5 officers (configurable names and permissions), 6 member. A member `note` is `"name|classId|exp"`.
- Creation: `addGuild({name})`, name 2–10 chars, unique; level ≥ 50; 1 000 000 silver (bind first, one wallet must cover it).
  The guild starts at level 1, max members 50, bank 1 page.
- Snapshot `initViewGuildP()` → push `onInitViewGuildP {myGuild, memberList, guildRank, applyList, skillDevData}` (22-key guild object).
- Calls and their ids:
  - `initGuildList`;
  - `addGuildMember({gid})` (apply), `confirmGuildApply({tableId, newData: 6, updateType: "rank"})`, `refuseGuildMember(tableId)`;
  - `kickGuildMember(tableId)`, `quitGuild(memberTableId)`;
  - `demiseTo(characterId)`, `delGuild`;
  - `updateGuildRank(flat keys)`, `updateGuildNotice`, `changeGuildName`;
  - `guildLevelUp`, `contribMoney`, `contribMaterial`;
  - `getInitGuildSlot`, `moveGuildItem`, `dropGuildItem`, `addGuildBankSlotNum`, `addMaxGuildMemberNum`, `updateGuildMember`.
  - Pushes `onAddGuildMember`, `onConfirmGuildApply`, `onDelGuildMember`, `onUpdateGuildMember`, `onDemise`, `onUpdateNumProp`, … to online members.
- Guild chat `say(2, msg)` goes to online members (the `onSay` payload). `showChaInfo` carries `guild` (name). No guild tag over players (Flash never draws it).
- Buildings:
  - `createGuildBuildings` (list on the guild map 49);
  - `clickBuild(id, type)` → menu `{name, func, bid}`, then `execBuildFunc(func, bid, type)`;
  - `constructBuild(buildId, templateId, mode, mapId)`, `finishCreate`/`finishUpgrade`, `resetConstruction`.
- PvP battle: the attacker at 10/15 and the target at 0/5. The target's client receives `guest: true` (slot swap). 25 s rounds; both sides' commands are required.

## 3. Design
- Server modules:
  - `modules/guild/`: pure `guild-rules.ts` (permissions, create gates, contribution formulas, cost checks) with tests;
    schemas, `guild.service.ts`, `guild-member.service.ts`, `guild-bank.service.ts`, `guild-build.service.ts`, `guild-skill.service.ts`, rpc files; each < 300 lines.
  - `modules/pk/`: pure `pk-rules.ts` with tests (eligibility, forced map, safe area, party), `pk.service.ts`, `pk.rpc.ts`, plus `uif` in an appropriate module.
  - `modules/ranking/`: `rank-rules.ts` with tests, `ranking.service.ts`, `ranking.rpc.ts`.
- Combat: PvP battles reuse `BattleManager` with two player sides:
  - `round.ts` handles player-vs-player targets (enemy = the other side);
  - each side's client gets its own `guest` flag and its own perspective;
  - settle: no rewards, HP/MP persisted, the loser is left at 1 HP (*(H5)*: no death and revive for PK; record it) or per the research.
  - Existing PvE tests stay green.
- Client:
  - `ui/guild/*` panels: list/search/apply, my guild with tabs (members, ranks and permissions, notice, donate, bank, skills), create dialog;
  - guild map building menu (click building entities); guild channel in chat;
  - PK: minimap toggle and `ACTION_PK` click mode with the safe-area check, battle stage `guest` slot swap;
  - rank panel from the HUD `btnRank`.
  - Keep `GameScene.ts` / `BattleController.ts` from growing.
- Chat: channel 2 stops being refused.
- New RPCs are un-quieted and `forbidInBattle` where they change state.

## 4. Non-goals
- Guild war, guild quests (`canQuest` stored only), cross-server battles, PvP rooms (`PVPRoomList`, `PVPGroup`), `inviteToMyGuild` (no client receiver).
- Honor/wanted rewards or penalties (no source).
- Marriage, guild-war and boss ranks (other RPCs).
- Rank categories without a data source (empty until their systems exist).

## 5. Verification
1. Unit tests: permissions per rank flag; create gates; contribution formulas; building cost/prereq checks; skill learn caps; PK eligibility (apvp, forced map, safe area, distance, party, battle); PvP round targeting; rank ordering and cache.
2. `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test` (record the baseline first; last known shared 50, swf 4, server 379).
3. Browser with two players (scripted ws for the second is fine):
   - **A**: create a guild (Lv 50 + silver set via mongosh), the second applies, approve, set a rank permission and see it enforced, kick, rejoin, demise, donate, guild chat.
   - **B**: deposit to the bank, move items; extend bank pages and members; build or upgrade a building on map 49; develop and learn a guild skill (stats change).
   - **C**: toggle apvp, PK the other in a normal map (refused when the target is off, allowed on a `pk > 0` map, refused in a safe area); the battle shows the correct sides for both; the result is persisted.
   - **D**: the rank panel shows the exp and money lists.
4. Docs: new `docs/memory/guild.md`, `pk.md`, `ranking.md` (+ index lines); update `chat.md` and `combat.md`.

## Implementation notes (phase A)

Implemented 2026-11-04: guild core, contribution and guild chat. Phases B-D are not started.

- **Files**: shared `guild.ts` (+test, wired into the shared `test` script); server `modules/guild/` (`guild.schema`, `guild-rules` (+test), `guild-view`, `guild`, `guild-member`, `guild-contrib` services, `guild.rpc`, `guild.module`); chat channel 2 (`chat-rules` route `guild`, `ChatService.sayGuild`); `showChaInfo.guild`; client `ui/guild/*`, `game/GuildController.ts`, HUD union button / E key, chat "Bang" send channel and the Bang Hội tab.
- **Login payload**: `PlayerData.guild / gData / gi` (optional). `CharacterModule` cannot import `GuildModule` (cycle), so `CharacterService.addLoginExtra(fn)` is the hook; `gi` is `{}` until the bank exists.
- **Persistence**: Mongo `guilds`, `guild_members`, `guild_applications`, `guild_restores` (parked 90 % contribution, keyed by character id; Go kept it on `characters`). Members and applications share the counter `guild_rows`; an approved application keeps its id as the member id, so the client's `quitGuild(id)` ambiguity does not exist. Guild ids use counter `guilds`.
- **contribMaterial decision (bank is phase B)**: the donated guild material (2026 / 2027 / 2039) is stored as `guilds.bankItems [{tid, count}]` and shown in the donate tab through the H5-only push `onUpdateGuildBankStock` and `InitViewGuildP.bankStock`. Phase B converts it into bank slots. Contribution formulas are the client ones (`color` clamped to 1..8, because every seed has `color -1`); the Go `color >= 2` gate is dropped. Only bag items of kind ITEM with tid in the common / rare / 2039 sets are accepted. Materials do not give guild exp (only `contribMoney` does).
- **contribMoney**: silver is taken from unbound `money`, gold from `gold` (client checks `player.money`); `s` must be a multiple of 1000. Guild `money` rises by `s + g * 2000` (one number; no separate guild gold), member `donateContrib` and guild `exp` by `floor((s + g * 2000) / 8)`. Pushes `onUpdateNumProp` types 3 / 4 / 1 to online members (client applies contribution only for `cid == self`).
- **Permissions enforced** (decision 1): `canAdd` (approve / refuse, applicants list), `canDel` (kick, strictly lower rank, never leader), `canDuty` (appoint 2..6, target below the actor, no rank above the actor's own), `canInfo` (notice). Leader only: `updateGuildRank`, `changeGuildName`, `delGuild`, `demiseTo`. `canQuest` / `canSlot` are stored for later. Rank 1 always has all flags and rank 6 none (not editable). Rank names are capped at 14 chars (the default "Thành viên cũ" has 13).
- **Create**: gates in Go order (level 50, one wallet with 1 000 000 (bound first), already member or applicant, name taken); name 2..10 chars and the client special-character list; the cost is spent first and refunded when the guild or leader row cannot be created. Silver cost is not taken from two wallets.
- **Wire shape**: the guild object has the 22 Go keys, but ids / level / counters are numbers (Go sent strings) and `members` is `[]` (the member list is a separate key). `onUpdateGuildRank(gid, obj)` has two args. Notice change pushes `onUpdateGuildProperty {guildInfo, announcement}`; rename pushes `onChangeGuildName` to members and `onUpdateGuild(gid, 'name', name)` to everyone.
- **Refusals** throw `RpcException.forbidden` (the client turns them into toasts) instead of Go's `a` note + null result.
- **Line / NPCs**: nothing to change: H5 has no line concept and the server never filters type 17 NPCs (1 guild NPC row exists); donate / bank menus are not gated by a line flag.
- **Not in phase A**: `guildLevelUp`, `addMaxGuildMemberNum`, `addGuildBankSlotNum`, bank, buildings, skills (`skillDevData` is `{}`), `inviteToMyGuild`, member login / logout presence push (the panel refreshes on open; `status` is online-at-snapshot).
- **RPCs un-quieted** (as required): all 17 new methods; `forbidInBattle` on `addGuild`, `contribMoney`, `contribMaterial`. `say` stays quiet as before.
- **Verification**: shared 56 / swf 4 / server 385 tests, lint clean. Scripted three-player flow (create gates, apply, approve, refuse, rank enforcement, kick, donate, guild chat, demise, rename, quit, parked restore 90 %, disband) and a browser run (create dialog rules, applicant approval, appoint, rank checkbox, notice, donate, chat both ways, kick) passed.

## Implementation notes (phase B)

Implemented 2026-11-04: guild bank, extensions, buildings, guild level chain and guild skills. Phases C-D are not started.

- **Files**: shared `guildBank.ts`, `guildBuild.ts`, `guildSkill.ts` (+ `guildEstate.test.ts`, wired into the shared `test` script); server `gamedata/guild-data.ts` (+ `GameDataService` accessors `guildBuildingRows/Row`, `guildLots`, `guildSkillRow`, `guildSkillChains`), `guild/` `guild-bank`, `guild-extend`, `guild-build`, `guild-skill` services, `guild-lock.ts`, `guild-estate.rpc.ts`, `stats/guild-skill-bonus.service.ts` + `guild-skill-buffs.ts` (+ test); client `game/GuildEstateController.ts`, `game/GuildBuildingLayer.ts`, `ui/guild/guildBankTab.ts`, `guildSkillsTab.ts`, `guildBuildDialog.ts`, `guildEstate.css`. `GameScene.ts` stays at 424 lines: the building layer rides on `PortalLayer`'s lifecycle (new optional `SceneCompanion` constructor arg) and `GuildController` gets the entity layer through its host.
- **Schemas**: `guild_bank_slots` (one row per used slot, unique (guild, slotIndex), id from counter `guild_slots`), `guild_buildings` ((guild, lot id) -> `tid`, `buildState`), `guilds.skills` (developed `{chain, sid, level}`), `guild_members.skills` (learned), `guild_restores.skills`. The phase A `guilds.bankItems` stock is moved into slots by an idempotent `bank.migrateAll()` at module init (no tool script needed); `contribMaterial` now deposits into slots (refused with "Kho bang đã đầy" before anything is consumed). `onUpdateGuildBankStock` stays (totals per template, derived from the slots) for the donate tab.
- **Bank**: sid = 500 + slotIndex + 1, 30 per page, `bagSlotNum` pages (max 4), stack cap 99 999. `getInitGuildSlot` reply and login `gi` = `{slotId: {id, sid, type, itemId, stackNum, tid, name, iconCode}}` (name / icon are H5 extras). Pushes `onAddGuildSlot(slot)` (add or replace) / `onDelGuildSlot(slotId)` (Go-observed names, H5 payloads). `moveGuildItem` needs `canSlot`: empty target moves, same template merges, other template **swaps** (Go refused). `dropGuildItem` is **leader only** (client text), destroys the whole stack. **Withdraw** (the client has no path): H5-only RPC `withdrawGuildItem(slotId, num)` for ranks with `canSlot`; the stack leaves the bank first, then lands in the bag **bound**; bound 2039 can no longer be donated (closes the withdraw / re-donate contribution loop). Locks: character lock, then a per-guild lock.
- **Extensions** (leader only, paid with guild money; the client text has no price, so these are H5 prices recorded in `GuildExtend`): `addMaxGuildMemberNum` +10 members for `memLimit * 10 000` (cap 200); `addGuildBankSlotNum` +1 page: page 2 = 500 000, page 3 = 1 500 000, page 4 = 3 000 000 (max 4). Push `onUpdateGuildProperty {memLimit | bagSlotNum}` and a negative `onUpdateNumProp` (type 3). `data_tbl_building` house / hall `prop1` (member limit) is not applied.
- **Buildings**: 11 lots (`data_tbl_extend_position`, map 49), wire id = lot id (Go's `160+id` / `1346+id` split is dropped). The main hall (template 2, free) stands on lot 10 and is created on first use. `createGuildBuildings` returns `[]` off map 49 or without a guild. `clickBuild(id, type)` replies `[{name, func, bid}]`; `execBuildFunc(func, bid, type)` pushes `onShowExtInfo(BuildExtInfo)` (empty lot = create list, building = next level), `onShowBuildProcess(BuildProcess)`, `onShowGuildWarehouse(bid)`, `onShowDonatePanel(bid)`, `onShowGuildSkillPanel(GuildSkillState)`. `constructBuild(buildId, templateId, mode, mapId)` (leader, map 49) only marks the lot (create: tid 10 + `buildState` = target; upgrade: `buildState` = target); `finishCreate` / `finishUpgrade` (leader) re-check prerequisites and spend guild money + exp (one conditional update) then the 2026 / 2027 / 2039 stock (refunds money / exp if the stock spend fails). `resetConstruction` spends nothing and frees an unfinished lot. Prerequisite rule: each id in `pre_building` needs a completed building of the same chain at that level or higher (this makes "house L2 needs house L1" and "hall L2 needs house + treasury" fall out of the data); per-chain `num_limit` is enforced; hall chain is never created, only upgraded. Pushes: `onCreateBuild(obj)` on start, `reloadBuild(obj)` on finish / reset (+ `onCancelUpgrade{bid}` on reset), `onUpdateGuildProperty {level}`.
- **Guild level** = hall level: `guildLevelUp(gid)` (leader) starts and finishes the hall upgrade in one step (undone if refused), so it costs the next hall row and needs its prerequisites. Max 6.
- **Skills**: guild skill = `data_tbl_skill` rows with `use_env 4` and a develop cost (13 chains; chain key = `code_name` without a trailing `NO`; effective max 6 because developing level L needs guild level >= L). `developSkill({gid, sid})` (leader; sid = next level) pays `guild_dev_exp` from guild exp and `guild_dev_money` from guild money, push `onGuildSkillDeveloped {gid, sid, skillDevData}`. `addGuildSkill` / `improveGuildSkill` (same handler) need level = learned + 1, level <= developed level and <= guild level, player level / class gates and `cost_guild_contrib` paid from normal then donate contribution. `getGuildPrivateSkillData` replies the H5 shape `{gid, skillDevData, learned, catalog}` (the Flash reply was only the developed map). `skillDevData` (snapshot, guild `skillData`) = `{templateId of the highest developed level: level}`. The Academy building is not required (it only opens the panel in H5).
- **Stat effect**: the skill row's `buff_id` runs through the existing buff pipeline (`buffBonuses`): `CharacterStatsService.compute` adds the templates from `GuildSkillBonusService` (member row + guild via models, no feature services). The effect level is `min(learned, developed)` so a fresh guild gives nothing. Learned skills are lost on leaving but parked (with the 90 % contribution) and restored on the next join; stats are refreshed (onUPP) on learn, join, leave, kick, disband and develop.
- **Art**: building templates' `res_code`s 100-108 are not in the asset cache; the server sends the chain's level-1 art (hall 98, house 97, treasury 96, academy 95; lot / in progress 99), which exist as sheets and render through `Entity`. No new sheets generated.
- **RPCs**: 18 new methods (164 total), none quiet; `forbidInBattle` on all state-changing ones.
- **Verification**: shared 69 / swf 4 / server 390 tests, lint clean. Scripted two-player run (bank deposit / move / swap / merge / permissions / withdraw / drop, extensions and caps, construct / finish / reset / limits / prerequisites, hall level-up, develop / learn with +100 / +150 attack, leave and rejoin restore) all passed. Browser: create guild, extension buttons, donate, bank drag and withdraw, skill develop + learn (character panel attack 87 -> 187), map 49 buildings (lot menu, build dialog, house built and drawn, treasury menu opens the bank tab).
- **Open**: a first click on a treasury right after a scene reload once opened the hall's menu; not reproduced in three retries.

## Implementation notes (phase C)

Implemented 2026-11-04: PK (opt-in, `PVPStartClient`, PvP battle, client click mode and `guest` view). Phase D is not started.

- **Files**: shared `pk.ts` (+ `pk.test.ts`, wired into the shared `test` script; `PK_*` constants, `parseSafeAreas` / `inSafeArea`, `viewSlot`), `PlayerData.apvp?`, `MapInfo.pk? / sArea?` (from `data_tbl_map.pk / s_area`); server `modules/pk/` (`pk-rules` (+test), `pk.service`, `pk.rpc`, `pk.module`), `combat/pvp-rules` (+test), `combat/pvp.service.ts`, `Character.apvp`; client `game/PkController.ts`, `BattleUnit` / `BattleStage` / `playback` view slot, HUD PK wiring.
- **uif**: `uif(key, value, petFlag)` persists only `apvp` (boolean required); other keys are accepted and ignored (client-side only). `apvp` rides the login payload through `CharacterService.addLoginExtra` (PkModule). The minimap PK button starts as "closed" (selected) and takes `p.apvp` on the first `MainHud.setPlayer`; a click sends `uif('apvp', !closed, false)`.
- **Eligibility** (`pk-rules.ts`, first failing gate wins, refusals are `RpcException.forbidden(note)` which the client toasts): self / offline target, either side in battle, other map, either at 0 HP, attacker a non-leader party member ("Đã ở trong nhóm thì cần nghe lời nhóm trưởng!"), same party, distance > 150 px (persisted `posX/posY`), map `safe_flag > 0`, target inside `s_area`, then target `apvp` off unless `map.pk > 0`. The attacker's own `apvp` is not checked (Go). `s_area` format `x1,y1-x2,y2|...` (`0` / null = none; only map 2000 has real rectangles). Safe area is tested on the TARGET position (client does the same); `safe_flag` maps refuse even when `pk > 0`.
- **Battle**: `Battle.pvp`, attacker `'player'` at 10 (pet 15), target `'enemy'` at 0 (pet 5), `Fighter.kind 'character'` on both sides. `round.ts`: every non-creature fighter acts on commands (creatures keep the enemy AI), pet fallback targets the other side, `missingCommands` waits for both sides' living characters, `battle-command.service` targets "the other side" instead of `enemy`. Round 25 s (`roundMs`, `PK_ROUND_MS`). The stored result is the attacker's view; the target's end marker is swapped (`endStepFor`, unverified in Flash, see research open question 5), no `report` is sent in PvP. `onCmdReady` is not pushed in PvP. Pushes in order: pet `onUpdatePet`, `onSetCharState 5` (self + map), `onBattleStart` (target gets `guest: true`).
- **Settle** (`BattleSettleService.settlePvp`): no exp, money, loot, quest credit, pet exp or pet life drain. HP/MP are persisted. *(H5)* no death or revive for PK: every character ends with at least 1 HP (the loser at 1 HP; the winner keeps its HP). `battlePlayEnd` is the unchanged PvE path (onUPP, `onSetCharState 1`).
- **Leaving / fleeing**: a disconnect loses (`PvpService.onLeave`: vitals saved, settle as the leaver's loss, the other client gets `onUPP` + end marker). *(H5)* ESCAPE in PvP loses too (PvE flee ends the battle for all) and the 30-round cap is a draw (FLED, nobody loses).
- **Party**: solo vs solo. If either is in a party only that character fights; the other party members stay on the map; a party follower cannot attack, a follower can be attacked.
- **Client**: `PkController` (A key / system-bar PK button arms the click mode, Esc or 10 s disarms), `SocialController.bindPlayer` routes the click to it, safe-area test with the client string, then `PVPStartClient`. Party-follower refusal is server-side only. Forced-PvP entry notice: `MiniMapCanvas.setMap(name, info)` toasts "Đây là khu vực bắt buộc PVP..." when `map.pk > 0`. `BattleUnit.viewSlot = viewSlot(slot, guest)` drives position, facing and side colour, commands keep the real slot. `GameScene.ts` (424) and `BattleController.ts` (299) did not grow (inline edits only). `reportText` shows "Chiến thắng!" when the end marker has no report.
- **RPCs**: `PVPStartClient` (forbidInBattle) and `uif`, 166 total, none quiet.
- **Verification**: shared 73 / swf 4 / server 419 tests, lint clean. Scripted two-bot run: apvp off, offline, far, safe_flag map, safe area on map 2000, forced map 5 duel (guest flags, slots 0/10, mirrored results, no report, loser 1 HP, exp / money unchanged), second PK while fighting refused, own-side target refused, disconnect = loss. Browser (one tab + one bot): login `apvp` reflected on the PK button, toggle persists, forced-PvP toast, armed click on the bot starts the duel with self at the bottom right; reversed run with the browser as the guest target shows itself at the bottom right; both ended with "Bạn đã bị đánh bại", the loser at 1 HP, no revive dialog. Client safe-area refusal is covered by the pure tests only (not clicked in the browser).

## Implementation notes (phase D)

Implemented 2026-11-04: rankings. All phases done.

- **Files**: shared `ranking.ts` (+ `ranking.test.ts`, wired into the shared `test` script; `RANK_CATEGORIES`, `RANK_TABS`, `RankRow`, `RankGetReply`, `RANK_TOP` 100, `RANK_CACHE_MS` 5 min); server `modules/ranking/` (`rank-rules` (+test: ordering, tie-break, empty categories, guild join, cache with injected clock), `ranking.service`, `ranking.rpc`, `ranking.module`, registered in `app.module.ts`); client `ui/rankingPanel.ts` + `.css`, `HudActions.onRank`, `MiniMapCanvas` optional `onRank` (the existing "Xếp hạng" tray button, which only toasted before), `GameScene` wiring (4 lines).
- **RPC**: `rankGet(category)` (167 methods total), `requireCharacter`, not quiet. Unknown category -> `invalidArgs('category')` (Go rejected only 4 of the 10 client categories; H5 accepts all 10 and answers the empty shape for those without data).
- **Decisions** (client open question): `exp` reply `name` is `"exp"` (no `levelGrid` exists, the `level` branch is dead) and `value` is the **level** (column header "Cấp độ"); order is level desc, exp desc, id asc. `money` value = `moneyBind + money`, order by that total desc, id asc. `expBattle` has no counter in H5 -> empty `data: []`; `pop`, `popMonth`, `popWeek`, `totalBp`, `lastWeekBp`, `achPoint`, `treasureHunt` -> empty `data: []` (an array, not Go's stub object). All characters with `deleted != true` are ranked (test accounts included).
- **Guild name**: `guild_members.cid` -> `guilds._id` -> `name`, joined only for the picked top 100 (two small queries); `""` without a guild. The ranking module reads models only (no GuildModule import).
- **Compute / cache**: lean projection of all non-deleted characters, sorted in memory (fine at this scale; switch to an indexed query if the table grows large). `RankCache` is per category, 5 minutes, shares concurrent misses and drops failed loads. It is not invalidated on level-up or guild rename (up to 5 minutes stale, as decided).
- **Client**: tabs follow `RANK_TABS` (Ch.tích, Cấp, Tài sản, Nhân khí, Nhân khí tháng, Nhân khí tuần, Đấu trường giác đấu, Thành tựu); one `rankGet` per category per opening (legacy `flag[category]`), default tab `exp` (the legacy panel opened on `expBattle`, which is empty here). `lastWeekBp` and `treasureHunt` have no tab. No row double-click menu (not in scope).
- **Verification**: shared 75 / swf 4 / server 425 tests, lint clean, shared built. Browser: HUD ranking button opens the panel; exp list shows level 50 characters with guild names, money list sorted by total (2 000 000 first) with guild names, Nhân khí shows "Chưa có dữ liệu".
