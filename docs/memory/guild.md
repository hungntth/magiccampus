# Guild (M6): core, contribution, chat, bank, buildings, skills

Plan: `docs/plans/2026-11-04_07_GUILD_PK_RANKING.md` (phases A and B; see the implementation notes). Implemented 2026-11-04.
Research: `docs/research/2026-11-04_11_GUILD_PK_CLIENT_RESEARCH.md`, `..._12_GUILD_PK_SERVER_RESEARCH.md`.
Shared `guild.ts`, `guildBank.ts`, `guildBuild.ts`, `guildSkill.ts`; server `modules/guild/`; client `game/GuildController.ts`, `ui/guild/*` (E key or the union button).

## Core (phase A)
- Mongo collections: `guilds`, `guild_members`, `guild_applications`, `guild_restores` (90 % of the contribution parked on leaving, restored on rejoin).
- Ranks: -1 applicant, 1 leader, 2–5 officers, 6 member.
  - **H5**: the rank permission flags set in `updateGuildRank` (`canAdd`, `canSlot`, `canInfo`, `canDel`, `canDuty`...) are enforced for ranks 2–5. Go stored them and allowed only the leader.
  - Rank names are capped at 14 characters.
- Creation: `addGuild({name})`, name 2–10 chars, Lv ≥ 50, 1 000 000 silver (bind first, one wallet must cover it). The guild starts at level 1, 50 members, 1 bank page.
- Snapshot `initViewGuildP()` → push `onInitViewGuildP {myGuild (22 keys), memberList, guildRank, applyList, skillDevData}`. Push names are the client consumers in `GuildPanel.as`.
- Members:
  - Apply/approve: `addGuildMember({gid})`, `confirmGuildApply({tableId, newData:6, updateType:'rank'})`. An approved application keeps its id as the member id.
  - `refuseGuildMember`, `kickGuildMember(tableId)`, `quitGuild`, `delGuild`, `demiseTo(cid)`.
  - Guild settings: `updateGuildNotice`, `changeGuildName`, `updateGuildMember`.
- `contribMoney`: unbound money/gold → guild funds. Member contribution and guild exp each get `floor((silver + gold*2000)/8)` (H5: guild exp grows; Go never raised it).
- Guild chat: channel 2 goes to online members. `showChaInfo.guild` carries the name. The login payload has `guild/gData/gi`. There is no guild tag over players (Flash never draws one).
- Refusals throw `forbidden` (shown as a toast). There is no member online/offline push.

## Bank, extensions, buildings, skills (phase B)
- Bank: `guild_bank_slots`. Deposits go through `contribMaterial`; there is no colour gate, and the material contribution is `color^5`.
  - `moveGuildItem` needs `canSlot` (empty slot, merge, or swap). `dropGuildItem` is leader only.
  - **H5** `withdrawGuildItem(slotId, num)` for `canSlot` ranks: the item lands in the bag bound, and bound 2039 cannot be donated back.
- Extensions (H5 prices; the client has none): `addMaxGuildMemberNum` costs memLimit × 10 000 (+10 members, cap 200). `addGuildBankSlotNum` costs 500k / 1.5M / 3M for pages 2 / 3 / 4.
- Level and buildings:
  - `guildLevelUp` = main hall upgrade with the `data_tbl_building` costs and prerequisites.
  - Buildings on map 49: `createGuildBuildings`, `clickBuild` → menu, `execBuildFunc`, `constructBuild` + `finishCreate`/`finishUpgrade` (no timer), `resetConstruction`. Leader only.
  - Level 2+ building art (100–108) is missing from the cache, so level-1 art is used. The building layer rides on `PortalLayer` (`SceneCompanion`).
- Skills: `developSkill` (leader; guild exp and money from the data), `getGuildPrivateSkillData`, `addGuildSkill`/`improveGuildSkill` (personal contribution, capped by the developed and guild level).
  - The effect level is min(learned, developed). It applies through the buff stat pipeline (verified: attack 87 → 187). Learned skills are parked and restored like the contribution.

## Deferred
Guild war, guild quests, `inviteToMyGuild`, building prop grants, the Academy prerequisite, a presence push. Quiet the new RPCs after the user confirms.
