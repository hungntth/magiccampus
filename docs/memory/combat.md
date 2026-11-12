# Combat (M2): solo PvE battles, loot, kill/collect quests, skills

Plan: `docs/plans/2026-11-04_03_COMBAT.md`, with implementation notes for phases A, B and C at its end. Implemented 2026-11-04.
Research: `docs/research/2026-11-04_03_COMBAT_CLIENT_RESEARCH.md`, `..._04_COMBAT_SERVER_RESEARCH.md`.

## Contract (shared `battle.ts`, `skill.ts`, `questProgress.ts`)
- RPCs, none quiet yet:
  - `cbom(x, y)`;
  - `battleUpdateCmd([{tid, action, id, level}])`: -10 attack, -20 defend, -30 flee, -40 timeout, -50 skill, -60 item;
  - `battlePlayEnd()`;
  - `reliveSwitch()` returns `0 | 2`;
  - `freeRelive(1|2)`, `toSafe()`;
  - `initLearnedSkill()` returns `LearnedSkill[]`;
  - `clickNpc` on NPC types 10, 19 or 20 starts a quest battle.
- Pushes:
  - `onSetCharState({cid, state})`: 5 in battle, 1 normal; sent to self and broadcast to the map;
  - `onBattleStart`: `cList` keyed by slot; enemies at 0,2,1,4,3, the player at 10;
  - `onBattlePlayList(groups)`.
  - The ending round sends `onUPP{currentHp,currentMp}` before the playlist. Its last step is `{end, result, report}` (1 win, 0 loss, 2 fled; `report` is H5-only).
- `battlePlayEnd` push order:
  1. `onAddChaQuest` (with `questKill`, the remaining counts) and `onSetNpcState`;
  2. `onAddMoney`, which must come before `onUPP` because `QuestController` pairs them;
  3. `onUPP`, then `onPlayerLevelUp`;
  4. loot `onAddItem` + `onAddCharactorSlot`, or `onRedMsg` when the bag is full;
  5. `onSetCharState(1)`.

## Rules
- **Encounter**: map `basic_battle_rate` 0 means never; otherwise clamp to [0.30, 0.75] (seeds give a flat 30 %).
  - 4 s cooldown; no encounter on safe maps, in battle or at HP 0.
  - 1–2 enemies rolled from `data_tbl_map_creature` `[start_rate, end_rate)`, bosses excluded. The first monster map is 3 (Vân Đài); map 1 is safe.
- **Damage**: Go V1 formula (`combat/damage.ts`). It is a Go construction we adopted. Basic attack base 10, mult 1.0.
  - H5 sets the position modifier to 1.0. Defend halves the damage; timeout does not.
  - Escape always succeeds. Round cap 30, then the enemy wins.
- **Creature stats**: `combat/creature-stats.ts`. Test vectors: creature 56 Lv3 hp 51 / atk 3 / def 30; creature 157 Lv2 hp 374 / atk 64 / def 320.
- **Settle** (`battle-settle.service.ts`) runs once, inside the final `battleUpdateCmd`, on disconnect, or on a premature `battlePlayEnd` (counted as fled).
  - It persists HP/MP.
  - On a win it also credits exp (`level*10` × level-diff modifier), `moneyBind` (`sum(level*5)`), loot and kill credit.
  - The pushes are queued and sent at `battlePlayEnd`.
- **Loot** (`combat/loot.ts`): `data_tbl_creature_loot`; a `qid` row drops only while that quest is active.
  - x5 for an item still needed (cap 50000); roll `rand(50000)+1 <= rate`. Quantity is always 1, since the seeds have no quantity columns.
  - Quest items go into the normal bag.
- **Quests**:
  - `isSupported` accepts collect (kind 1 / type 29 / q < 0), kill (kind 2 / type 12) and grant-item objectives.
  - Kill counters are `character_quests.objectives[].current`.
  - Collect objectives are counted from the bag at finish, and the items are **consumed** (Go `CompleteQuest`). There is no push on drop; the client recounts the bag.
- **Quest battle** (`combat/quest-battle.ts`): NPC `sub_type` is a quest list. One enemy per remaining kill objective, enemy level `max(1, min_level/2)`.
  With no list (`sub_type` null / `"-1"`) the active quests the NPC gives or takes are tried in order, skipping those with
  no kill left (Go `questBattleMatchesNPC`). Fix 2026-11-07: NPC 600 Khảo Quan Trung Cấp (Tiên Lạp Thành, type 19, no
  sub_type) never fought quest 645's six Khảo Quan (92/94/96/99/216/330, Lv 20); NPC 596 (sub_type 645) sits on map 900,
  which does not exist. The same path covers 2470 (Thiên Diện Ma Vương) and 2471 at NPC 600.
  Quest battles fill up to 10 enemy slots (front row `BATTLE_ENEMY_SLOTS`, then back row `ENEMY_PET_SLOTS`, Go
  `MaxEnemySlots`); with only the 5 front slots the sixth Khảo Quan (330 Lưu Hỏa) was dropped.
  Owner tuning (not legacy): `QUEST_BATTLE_WEAKEN` divides HP, attack, magic attack, defense and magic defense of a
  quest's enemies; 645 = /10 (e.g. Bàn Địa 47740 HP / 5330 atk / 10620 def -> 4774 / 533 / 1062). Speed, hit, dodge,
  crit, exp and loot unchanged.
  NPC 475 (map 3) fights creature 157 for quest 50. It is killable at Lv5 with full HP.
- **Potion in battle**: consumed when the command is accepted; the heal is persisted at settle.
- **Revive**: free. `freeRelive(1)` gives full HP/MP in place; `freeRelive(2)` and `toSafe` go to the safe point with half HP/MP (scene reload through `onSceneEnter`). They act only at HP 0.
- **Gating**: `@Rpc({forbidInBattle: true})` covers scene change, NPC, shop, bag, equip and use-item RPCs. `udcp`/`udcr` are ignored while `session.battleId` is set.
- **Battle state**: in memory only (`BattleManager`, deadline 30 s re-armed every round). A restart loses running battles.
- **Skills** (`modules/skill/`, `character_skills`):
  - Class start skills are learned at creation; `pnpm --filter @mc/server learn:start-skills` (idempotent) does it for existing characters.
  - `skillCategory`: type 1 melee; 2/8 physical in place; 3/4 magic; 5/9 heal on self; 11 passive (refused).
  - Types 6, 7 and 10 (buff/debuff) are refused and hidden.
  - MP cost: `useMp < 1` means `ceil(fraction × max MP)`, otherwise absolute. With too little MP the server turns the skill into a basic attack. Base 10, mult 1.0.

## Client
- `game/BattleController.ts` (state machine, the `cbom` trigger every 100 px, 1 s throttle), `game/battle/` (`slots`, `BattleUnit`, `BattleStage`, `playback`),
  `ui/battleMenu.ts` (25 s timer, Kỹ năng submenu), `ui/reviveDialog.ts`.
- While the stage is up, map entities are hidden and the world is tinted.
- Sheet actions: 0 stand, 1 run, 3 attack, 4 DEAD, 5 HURT, 6 defence, 7 magic. Enemies face dir 1, players dir 5.
- No hit or cast effects: `EFF_PLAYER_010008` is missing from the asset cache.
- Tracker and panel show kill counts from `questKill`, collect counts from the bag (`BagController.countOf`), and "(Hoàn thành)".
- **Battle look** (matches the Flash screenshot, browser-checked 2026-11-04):
  - Arena: `BattleStage` draws sheet `ui/UI_LOADING_BACK` (legacy `DEFAULT_IMG_BATTLE`, greek-key ring) at alpha 0.6 at its sheet offset over the tinted map; no black overlay.
    Regenerate with `swfanim -cache D:/mcgame/frontend/s/res -out client/public/sheets/ui -name UI_LOADING_BACK -hide 1 -manifest client/public/sheets/manifest.json -key resource/ui/UI_LOADING_BACK.swf 38a9d7ea5a2e2ac769acf89e18e475a1`.
    `-hide 1` drops the SWF's opaque 900x570 backdrop shape, which would otherwise dim the whole box.
  - Units (`BattleUnit`): legacy `PropBar` bars (50x4, #333 back, #ddd frame with a black line) from `headY - 10` downward; enemies HP only, own character HP / MP (0x3333AA) / SP (yellow, only when `spMax > 0`).
    Name (Tahoma 12, black stroke) under the feet at y 10: enemies white, own side yellow, boss red/green.
  - Command column (`ui/battleMenu.ts` + `battle.css`, `.battle-side` anchored right 36 / top 100 on `#stage`): "Nhân vật" title tab, the 9 `PLAYERCMDCANVAS_U` buttons in Flash order
    (Tấn công, Phòng ngự, Kỹ năng, Bắt, Pet, Vị trí, Vật phẩm, Bỏ chạy, Auto) as CSS CrystalBlueButtons (73 px, selected = orange), "Thông tin" (`BATTLESTAGE_S[17]`) below.
    **Disabled** (no H5 feature yet): Bắt, Pet, Vị trí, Auto, Thông tin. Kỹ năng / Vật phẩm lists open to the left.
  - Timer: `TimeCountCanvas` values (horizontalCenter 15, bottom 318, yellow 75 px, red 85 px from 9 s), black text stroke.

## Pets in battle (M4)
The battle pet sits at owner slot + 5. `battleUpdateCmd([owner, pet?])`. There is pet AI, catch `-70`, pet exp and life at settle. See `pets.md`.

## Group battles (M3 phase C)
Party battles (roster, `onCmdReady`, readiness, reward split, round-robin loot, disconnect) are documented in `party.md`.
Solo behaviour is unchanged.

## Deferred
- Pets, PvP, auto-battle, statuses and buffs in battle, elements.
- Hit effects, `hitNpc`/`clickBoss` visible monsters.
- Paid revive, quest bag, money/exp loot rows, skill learning/upgrade and skill bar, AoE.
- `GameScene.ts` is about 427 lines, over the cap; split it in a follow-up.
- Not browser-tested: boss tint, crit shake, round cap, disconnect mid-battle, bag-full loot, the magic/heal/5 % skills.
- Quiet the new RPCs only after the user confirms.

## PvP (M6)
PvP battles reuse BattleManager with two player sides; see `pk.md`.
- Enemy hover card (2026-11-04, `client/src/game/battle/unitTip.ts`): hovering any living unit (enemy, self, ally, pet) at any time (not only while
  picking a target) shows under its feet "Cấp: N" (+ red "Boss" for bossFlag 1) and HP / MP bars with current/max; refreshed every
  tick by BattleStage. Picking tint / click-to-target still only while picking.

## M9 phase A (auto battle)
- PvE has no round cap any more (`round.ts`: cap 30 only when the enemy side has characters, a draw). AUTO -110 = basic attack on a
  random living enemy; pets accept ITEM (owner's bag) and AUTO. Client auto chain: see `auto-battle.md`.
- M9 phase D: relive modes and the blood bag replaced the free-only revive; see `blood-bag.md`. Battle settle stores `deathAt`.

## M9 phase E (NPC battles)
- `hitNpc(npcId)` / `clickBoss(npcId)` (`npc-battle.service.ts`, rules `npc-battle.ts`): NPC on the caller's map within 300 px,
  leader only, line-up from `data_tbl_npc_creature` (`GameDataService.npcCreatures`, cached per nid; level row -> use_lv -> 10, boss_flag,
  exp × exp_multi), else the map's first spawn row. Party roster via `CombatService.roster`. No H5 content sends it yet (type-25 walkers are M10).
- Loop bosses go through `QuestBattleService` (fallback to the paired round, `bossFlag 1`); see `loop-quest.md`.
- The hotbar stays visible in battle (`battle.css` exception `.hud-userbar`).

## Spectate (M9 phase H)
- RPCs (un-quieted): `startWatch(targetCid)` -> `{success[, error]}` (+ `onWatch(start + watch:true)` / `onSystemSay`), `quitWatch()`.
  `spectate.service.ts` (in-memory watcher map), gates `spectate.ts` (WATCH_ERR, Go order), `spectate.rpc.ts`.
- Watchers get every `onBattlePlayList` (no per-member end report), then `onWatchEnd()` 5 s after the end; released on quit, new
  watch, disconnect, own battle start. Client `game/battle/watchMode.ts` ("Thoát"). M12 C6: the same stage also plays pet replays (`onBattleReplay` + one `onBattlePlayList`, closes on the bare end marker, no `quitWatch`).
- `onSessionClosed` ignores a session whose `battleId` is not the battle (re-login kick race).

## M10 E2.-1: current Go damage formula (2026-11-05)
- `combat/damage.ts` now ports current Go `damage.go` (replaces the V1 notes above): proportional melee dodge, NPC-only level
  bonus, XPN, Miễn Giảm 100 % resist ("Kháng cự"), defence `atk/(atk+def/4)`, defender Giảm ST Cuối (75 % cap), crit × (200 |
  250 Xạ Thủ + bonus)/100, element table, 10-level gap × 0.2, position modifier on main hits (melee × 0.7 at the Flash slots),
  Miễn Tử. `criticalDmg` is Go's (200 + bonus). Skill base stays exp_skill (CORE_LOOP decision 4).
- `combat/strike.ts`: combo chain (≤ 10, retarget), skill single combo, counter in place + chains (≤ 5), miss/resist status texts.
- Details and the not-ported list: plan `2026-11-04_13_DUNGEONS.md` "Implementation notes (phase E2.-1)".

## M10 E2: NPC skills and boss mechanics (2026-11-05)
- Every creature with data_tbl_creature_skill rows casts (Go AI order, 30 % roll × NpcKit.chanceScale) in every PvE battle.
  Engine = `combat/mechanics/` (npc-skills, skill-text, targets, battle-buffs, npc-ai, npc-cast, turn-start, summon, revive,
  split, death-mark, doomsday, boss-floors); env = `NpcSkillCatalog`. `resolveRound(…, roundCap, env, deathRule)`.
- Feature builders set `Fighter.npc` (pool, chanceScale, opener, rotation, immunities, controlResist), `summon` (SummonPlan
  with pending Fighters), `roundRevives`, `doomsday`, `Battle.deathRule`; corpses removed by refill / split go to
  `Battle.fallen` and are rewarded at settle. Boss rows get the Go defence floors in `fighters.ts` (praDef / praMagDef 30,
  resiDefy 30, resiCritical 100).
- NPC damage = Go description ratio; player skills stay exp_skill. Buff icons: buffAdd {id, round, icon} (icon = TBL_BUFF icon_code).
- Not ported: shields, reflect, life steal, damage-taken / heal-cut, cleanse / guard / type 13 skills, revive skills, cooldowns,
  confusion retargeting. Full list: plan 2026-11-04_13 "Implementation notes (phase E2)".
- M10 phase B (2026-11-05): NPC line-ups (`npc-battle.service.ts npcLineup`) fill both enemy rows, `LINEUP_SLOTS` 0,2,1,4,3,5,7,6,9,8
  (boss_flag 1 in the centre, then row id order; was 5 slots, which dropped units and sometimes the boss row). Random encounters live in
  `encounter.service.ts` (`EncounterService.tryRandomEncounter`, `addTuner(mapId, enemies)`). A won battle credits quest kills to every
  connected member, dead ones too (Go quest_kill_party.go); loot stays survivors-only. `startNpcFight(..., { tune })` applies feature kits.

- 2026-11-05 fix: `playback.ts` skips destroyed units / stage (BH_RETURNED removal, summon replacement or a teardown mid-list left `t.x` on a destroyed Pixi container -> "Cannot read properties of null (reading 'x')"); `BattleStage.popup` and `unitTip.refresh` guard `destroyed` too.

- 2026-11-05 (M12 slice 7): `combat/fighters.ts` gained `petFighterAt`, `scaledCreatureFighter` and `buildBattleStart` (the live `startGroup` uses it); `PetBattleService.battlePetsOf` builds pet battle views for any pets under a stat context. The simulated pet fights (PPVE, later the arena) run `resolveRound` headless in `modules/pet-battle/pet-sim.ts` with no sessions; live behaviour is unchanged.
- 2026-11-05 (M12 client slice C6): `WatchMode` (`game/battle/watchMode.ts`) is also the pet replay stage: `onBattleReplay(start, bid)` opens it (ignored while `host.inBattle()`), the bare end marker of the single `onBattlePlayList` closes it after a short hold, `Thoát` skips `quitWatch` for replays. Live `BattleController` flow is unchanged (it now passes its own `inBattle` into the watch host).

- 2026-11-07 (item use D / E): battle consumers of item buffs. `combat/exp-rate.ts` (pure, Go exp_rate_buffs.go) turns the active long buffs' props 24 / 25 into a character / pet exp rate; `BattleSettleService` applies it per surviving winner (character exp, and the half-exp pet share through `petExp`) before the boss level-gap clamp. `encounter.ts encounterMods` + `rollEncounter(..., mods)`: buff 313 = no encounter, 314 = rate 100 %, 1365 = all 5 enemy slots filled (`EncounterService` reads the buffs). Luyen Thu Don buff 565: `PetCatchService.bonusPoints` -> `PlayerCommand.catch.bonusPoints` -> shared `catchRate({ bonusPoints })` (gate `catchable <= 1 + bonus`). Details: `docs/memory/item-use.md`.

## M13 G2: guarding fairy active skills (2026-11-12)
- `FairyBattleKits` (`combat/fairy-kits.service.ts`, CombatModule imports FairyModule, no cycle): `CombatService.loadPets` (awaited by every
  PvE / PvP start) also preloads each character's rotation from `FairySkillService.battleSkills`; `startGroup` / `PvpService.start` take it
  (15 s TTL) and set `Fighter.fairy` (fresh `FairyKit` per battle). Rotation re-read at every battle start, no relog.
- Pure kit: `mechanics/fairy-battle-rules.ts` (`buildFairyKit`, `fairySkillForRound`, text stats 58 / 32 / 903 / 901 / 941, Cổ Vũ rage, procs
  `<code_name>_b2s1` same level, Độc Đao poison 2/3/5 % max HP in code, Bí Diệm `mpBurn`). Engine: `mechanics/fairy-battle.ts`
  (`fairyTurnStart` in `resolveRound` before `turnStart`: MP burn, then the cast as an idle `sSObj.buffAdd` step on the owner;
  `fairyProcSteps`), `mechanics/hit-reactions.ts` (life steal `sSObj.rHp` on the hit step, procs, reflect self-hurt + die).
- Generic engine additions (no-ops without fairy buffs): `CombatStats.damageTaken / reflectAll / lifeSteal` (props 901 / 903 / H5 941),
  `BuffDef.mpBurn` -> `ActiveBuff.mpBurn`, `LandedHit.src / after` (pushed by `strike()` and `clusterDamage`), `StrikeCtx.round`.
  Seed prop 41 rows are NOT life steal (Chiến Phách, Niết Bàn, …): life steal uses pseudo prop 941.
- Tests `mechanics/fairy-battle-rules.test.ts` (7, real rows). Live ws smoke (scratchpad `g2_smoke.mjs`): casts at rounds 1 / 2 / 4 / 6, nothing
  on empty slots, Thánh Ca rHp tick. Classification table: research `2026-11-12_02_FAIRY_PRS_RESEARCH.md` § "G2 fairy battle skills".
