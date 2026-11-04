# M2 Combat - legacy Go server research

Date: 2026-11-04. Scope: solo character vs creatures (random encounter, quest-battle NPC, boss click), no pets, no PvP, no group
(those paths are only mentioned). Reference: `D:\mcgame` (read-only). Paths below are relative to `D:\mcgame\internal\` unless noted.
Mongo samples were read with `docker exec mcgame-mongo mongosh mcgame` (`data_tbl_*`). All claims were checked against code; where the
legacy memory docs (`docs/memory/battle-combat.md`, `quest-battle-rules.md`, `exp-leveling.md`, `npc-quest-system.md`) disagree with code,
**code wins** and the disagreement is listed in section 8.

## 1. Summary

The Go server resolves a battle as **server-authoritative whole rounds**. The client collects one command per own character
(`battleUpdateCmd([{tid, action, id, level}])`), the server fills in NPC commands (always basic attack), orders actors by speed, executes
every action in one pass, builds an action list (`TurnTo/Move/Attack/Hurt/Idle|Die/Back/TurnBack` per attack) and pushes it as one
`onBattlePlayList` (array of groups). When one side is dead (or the 30th round ends) the server **settles the battle immediately**
(exp, money, loot, HP/MP persisted) and appends `{end:true,type:0,result}` to the playlist. The client plays the animation, then calls
`battlePlayEnd`, and only then does the server push the quest-kill, progress, item and state-reset callbacks.

Three entry points start a PvE battle: `cbom(x,y)` (random encounter while walking), `clickNpc(npcId)` on quest-battle NPCs (type 20/10/19),
and `hitNpc/clickBoss(npcId)` (direct creature/boss start). Death has **no penalty and no map move** in Go; revive RPCs are thin HP restores.
The combat numbers (damage, exp, encounter rate, creature scaling) are **a Go-port construction, not recovered original rules**
(see 3.5). There is no `onEndBattle` push in Go (negative, confirmed by grep over `D:\mcgame\internal`).

## 2. Entry points

Registration is last-write-wins (`infrastructure/rtmp/dispatcher.go:208-212`); module order in `D:\mcgame\cmd\gameserver\main.go`:
scene (451) -> combat (539) -> npc (552).

| RPC | Live Go handler | Notes |
|---|---|---|
| `cbom(x, y)` | `presentation/rtmp/handlers/combat/encounters.go:24` `CheckBattleOnMove` (registered `handler.go:101`) | rate limit 1000 ms (`dispatcher.go:110`); client sends it when it moved >= 100 px since the last check (`docs/client/view/view/compGameStage/PlayerView.as:23,108-114`), client `RPC_DELAY` 1000 ms |
| `hitNpc(npcId)` | `combat/battle.go:26` `HitNpc` (`handler.go:98`) | rate limit 2100 ms (`dispatcher.go:174`). Fired by the client when it touches an attackable NPC view (`NPCView.as:365`) |
| `clickBoss(npcId)` | `combat/battle.go:26` `HitNpc` (`handler.go:99`) | overrides scene `ClickBoss` (`scene/handler.go:143`, registered earlier at main.go:451) |
| `clickNpc(npcId)` | **`npc/npc_click.go:108` `ClickNpc`** (`npc/handler.go:129`, last writer; combat's `handler.go:100` is dead) | quest-battle branch at `npc_click.go:131` -> `npc/quest_battle.go:19` `tryHandleQuestBattleNPCClick` |
| `battleUpdateCmd([cmd])` | `combat/commands.go:31` `BattleUpdateCmd` | rate limit 200 ms (`dispatcher.go:181`) |
| `battlePlayEnd()` | `combat/battle.go:274` `EndBattle` | client-driven end; also the settle fallback |
| `battleFieldGetInfo` | `combat/battle.go:195` | returns `{ "<position>": {keepRound: {}} }` per participant, `{}` when none |
| `freeRelive(type)`, `reliveUseItem`, `bbGoldRelive`, `bbNormalRelive`, `reliveSwitch` | `combat/recovery.go:176,217,98,143,272` | see section 7 |
| `toSafe` | `scene/movement.go:301` | see section 7 |
| `setBp(bool)` | `auth/handler.go:251` | front/back row (default `false`, `infrastructure/rtmp/connection.go:91`) |
| `skillLearnByClient(skillId[, position])` | `combat/battle.go:556` `LearnSkill` -> `application/skill/service.go:166` `UpgradeSkill` | returns Boolean |
| `initLearnedSkill()` | `item/life_skill.go:35` -> `application/skill/service.go:58` | returns array of skill DTOs |
| `skillSetBattle(skillId, tbl, slot, isPet)` | `auth/interface_settings.go:144` | returns `true`; stores `bt<slot>=52`, `bs<slot>=skillId` in interface settings |

Dead / not registered: `CombatAction` (`combat/battle.go:90`), `ProcessNPCTurn`/`ExecuteAction` (`application/combat/service.go:364,445`),
`TurnProcessor.ProcessNextActor` (never called by the handler), `finalizeTimedOutBattle` (`application/battle/service.go:271`, never called).

Quiet methods: none of the battle RPCs are quiet in the Go dispatcher (`dispatcher.go:50+`).

## 3. Rules

### 3.1 Random encounter (`cbom`)

1. Args `x,y` (numbers) are only logged; position is not used (`encounters.go:29-46`). Missing/invalid -> invalid args.
2. If the character already has an active battle: if the player participant is dead the old battle is force-ended (winner enemy); else
   reply `{success:true,inBattle:true}` and stop (`encounters.go:58-72`).
3. Safe map (`data_tbl_map.safe_flag > 0`) -> reply `{success,inBattle:false,encountered:false}` (`encounters.go:79-93`).
4. Cooldown: per connection `randomEncounterUntil`; `now < until` -> no encounter (`encounters.go:95`, `connection.go:368`). Set to
   `now + 4 s` (`combat/battle.go:24`) when a battle starts (`encounters.go:215`) and again at `battlePlayEnd` (`battle.go:478`).
5. Rate: `normalizeEncounterRate(map.basic_battle_rate)` (`encounters.go:246-260`):
   `raw <= 0 -> 0 (never)`; `raw > 1 -> raw/1000`; then **clamp to [0.30, 0.75]**. Seeds only contain `0` (53 maps) and `50` (156 maps)
   (Mongo aggregate), so every encounter map is a flat **30 % per `cbom` call**. Tests pin this (`combat/battle_test.go:442-458`).
   (Legacy memory says "50 -> 5 % / ~6 %": stale.)
6. `roll = Math.random(); roll < rate` -> encounter (`encounters.go:118-128`). If the map has no creature rows with `boss_flag == 0` -> no battle.
7. Enemy count by roster size: 1 player -> `1 + rand(2)` = 1..2 (2 -> 2..4, 3 -> 3..5, 4-5 -> 4..5); then capped by the number of **distinct normal map-creature
   rows** (`encounters.go:137-146,262-278`). Solo = 1 or 2 enemies.
8. Each enemy slot rolls `r = rand()*100`; first row with `start_rate <= r < end_rate` wins; no match -> uniformly random row. Duplicates allowed
   (`encounters.go:280-302`). The Go cache iterates a Go map (random order) so overlapping ranges are order-undefined.
9. Per picked row: `level = row.level; if <=0 use creature.use_lv; if <=0 map.level (else map.lv); if <=0 10` (`encounters.go:157-171`);
   `template = CalculateCreatureStats(creature, level)`, then `NormalizeEncounterTemplateForPlayer(template, playerLevel)` (3.3),
   `template.Exp = row.exp`, `ExpMulti = row.exp_multi`, `BossFlag = row.boss_flag`, `WithCloud = row.with_cloud`.
   Boss rows (`boss_flag != 0`, e.g. map 3 creature 181, flag 2) are **excluded from random encounters**.
10. `onBattleStart` goes out inside the handler (before the RPC reply); reply `{success,inBattle:true,encountered:true,battleId,npcId:firstCreatureId}`.
11. **No HP gate**: nothing rejects a character with `currentHp <= 0` (solo path), and `NewParticipant` sets `IsAlive=true` regardless of HP
    (`domain/combat/battle.go:133-141`; group roster does filter `CurrentHP <= 0`, `group_battle.go:39`). H5 should gate on `hp > 0` (deviation, list in 8).
12. **No in-battle gating elsewhere** (movement, shop, bag are not rejected while `GetBattleID() != ""`: grep over scene/npc/item/quest handlers is empty).

### 3.2 Quest-battle / boss starts

13. `clickNpc` -> `tryHandleQuestBattleNPCClick` (`quest_battle.go:19-74`): NPC type in {10 Battle, 19 StoryBattle, 20 QuestBattle}
    (`domain/creature/npc.go:18,27,28`; `quest_battle.go:154`). `npc.sub_type` is a pipe list of quest ids (`quest_battle.go:30`).
14. Find the first **active** quest of the character whose id is in `sub_type` (or, when the list is empty, the loop-boss pairing, then quest
    `start_npc`/`finish_npc == npcId`) (`quest_battle.go:76-117,158-172`). Targets = creature ids of that quest's **incomplete** kill objectives, one enemy per
    objective (NOT multiplied by `num`). If the quest has kill objectives but all are complete -> fall through to normal NPC dialog (so turn-in
    does not re-open the fight). If no kill objective data at all -> fallback to `data_tbl_quest_require` rows with `kind == 2` (`quest_battle.go:100-114`).
15. Enemy level = `max(1, quest.min_level / 2)` when `min_level > 0` (`quest_battle.go:119-136`), built by
    `BuildCreatureTemplateAtLevel` (`application/combat/encounter.go:315-347`): no map-creature lookup, no `exp`, no `boss_flag`. Otherwise
    `BuildCreatureTemplateForCharacter` (`encounter.go:256-313`: map row level, else `use_lv`, else map level, else 10).
16. Flow identical to a random start: `StartPVEBattleWithMultipleEnemies` -> `notifyQuestBattleStarted` (`quest_battle.go:174-184`):
    `AddWatcher(conn)`, `SetBattleID`, `onSetCharState{cid,state:5}`, scene broadcast of state 5, `onBattleStart`; RPC reply
    `{success,battleId,battleData}`. If the NPC is not a quest-battle NPC / no matching quest -> returns not handled and normal NPC dialog continues.
17. `hitNpc/clickBoss(npcId)` (`combat/battle.go:26-88`): `npcRepo.FindByID` must succeed (legacy runtime NPC row; H5 would use `data_tbl_npc`),
    then `BuildNPCTemplateForCharacter` (`encounter.go:197-254`) treats `npcId` as a **creature id** found in the character's current map creature rows
    (`mc.cid == npcId`); if not found the template is just `{ID,Name,Level:10}` and `applyTemplateStats` falls back to defaults (3.3). This path is
    weak/ambiguous (npc id vs creature id) - H5 should use the quest/NPC-creature mapping instead (open question 8.4).
18. No start gating on safe maps, level, HP, or distance. Already in battle -> `ErrInBattle` unless the old battle's player is dead (`encounter.go:355-361`).

### 3.3 Creature -> participant (`application/combat/npc_stats.go`, `domain/stats/profile.go`)

19. `CalculateCreatureStats(creature, level)` (`npc_stats.go:111-165`) uses `stats.BuildBaseStats` (`profile.go:74-113`) with seeds
    `HP 50, MP 20, Hit 100, Speed 100`, `GrowthScale = max(1.0, creature.grow_base)` (all seeds have 0.8 -> 1.0), attributes `att_*` and aptitudes
    `apt_*` (per-mille, NOT pet-quality):
    `eff_x = (att_x + att_x * apt_x / 1000) * scale`;
    `maxHp = 50 + floor(effSta*8.5)`; `maxMp = 20 + floor(effInt*4.07) + floor(effEng*5.75)`;
    `atk = floor(effStr*1.9) + floor(effAgi*0.5)`; `def = floor(effSta*2.57) + floor(effAgi*0.85)`;
    `magAtk = floor(effInt*2.0) + floor(effEng*0.6)`; `magDef = floor(effInt*2.71) + floor(effEng*4.6)`;
    `hit = 100 + floor(effStr*0.08) + floor(effAgi*0.05) + prop_hit`; `dodge = floor(effAgi*0.11) + prop_dodge`;
    `speed = 100 + floor(effAgi*1.7) + prop_speed`; `crit = floor(effAgi*0.1) + prop_critical`.
20. Level scaling (`profile.go:33-53`): `hpMult = max(1, level^3 / 1000)`, `dmgMult = max(1, level / 10)`;
    `maxHp, maxMp *= hpMult`; `atk, def, magAtk, magDef *= dmgMult` (each `floor`). Then `maxHp = max(1, floor(maxHp * creature.life / 10000))`
    (`ApplyLifePercent`, `profile.go:115-127`; `life = 3500` in every sampled row = 35 %).
    `prop_combo, prop_counter, prop_defy, resi_defy, prop_reborn` are **not used** for creatures; element = `NormalizeClientElementValue(creature.element)`.
21. Level cap (`npc_stats.go:39-66`): not for bosses (`boss_flag > 0`). `maxLevel = playerLevel + 5`; if template level > max, **scale down** to
    `ratio = lvl/templateLvl`: `life = max(100+lvl*20, life*ratio)`, `atk = max(20+lvl*3, ...)`, `def = max(10+lvl*2, ...)`, `magAtk = max(15+lvl*2, ...)`,
    `magDef = max(10+lvl, ...)`, `speed = 100 + max(lvl, scaled(speed-100))`... (see `scaleTemplateToLevel` `npc_stats.go:68-91`; speed/hit use `100 + scaled(x-100)`;
    dodge/crit `max(1, scaled)` only if > 0). Applied again in `StartPVEBattleWithRoster` (`encounter.go:390`) with `partyReferenceLevel` (first player character level) - idempotent.
22. Participant fill (`applyTemplateStats`, `npc_stats.go:167-229`): each field takes the template value if `> 0`, else fallback:
    `maxHp 100+lvl*20`, `maxMp 50+lvl*10`, `atk 20+lvl*3`, `def 10+lvl*2`, `magAtk 15+lvl*2`, `magDef 10+lvl`, `speed 100+lvl`, `hit 100`,
    `dodge 5`, `crit 5`; `criticalDmg = 150` always; `expReward = floor(row.exp * (row.exp_multi > 0 ? row.exp_multi : 1))` only if `row.exp > 0`.
    No pra/resi/reduce/enh/combo/counter for creatures (all 0).
23. Participant identity: `id = "npc_<slot>"` internally, DTO `id = creatureId` string, `type 12`, `entityId = creatureId`, `resCode = creature.res_code`,
    `iconCode`, `colorCode`, `bossFlag`, `withCloud` (`encounter.go:396-412`, `battle.go:166-228`).
24. Enemy slots: first enemy -> position 0, then `0,2,1,4,3` (character row), overflow `5,7,6,9,8` (`encounter.go:380-389`, `position.go:44-49`).
25. Player participant (`encounter.go:431-483`): base stats from the character after class aptitudes + equipment bonuses
    (`RecalculateStats` + `ApplyEquipmentBonuses`): `maxHp/maxMp/maxSp, hp, mp, sp, atk, def, magAtk, magDef, speed, hit, dodge, critical, criticalDmg(150 base),
    counter, combo, praDef, praMagDef, reduceHurt1/2, resiCritical, resiDefy, enhPhyHurt, enhMagicHurt` (`encounter.go:42-72`), `resCode/iconCode` from
    `data_tbl_class.res_code_male/icon_code_male` if `gender == 1` else `*_female` (`encounter.go:463-474`), `wp` weapon res code, `star`.
    Solo position: **10** when `playerInFront == false` (default), **15** when `setBp(true)` (`encounter.go:35-40,366`).

### 3.4 Battle model and turn flow

26. Constants: `BattleType` PVE 1 / PVP 2 / Arena 3 / Boss 4 / Star 5 (`domain/combat/battle.go:21-27`; random and quest battles are always type 1);
    `Side` player 0 / enemy 1; participant types character 2, creature 12, pet 39 (`:72-76`); `MaxRounds = 30` (`:65`, `NextRound` at `:798`);
    `MaxParticipants = 10` (`:67`). Battle starts at round 1.
27. Positions 0..19: enemy 0-9, player 10-19; character rows `[0,2,1,4,3]` / `[10,11,12,13,14]`, pet rows `[5,7,6,9,8]` / `[15..19]` (`position.go`). Grid `x,y`
    per position `position.go:56-77`.
28. Action constants sent by the client (`GamePredef.as:963-973`, `turn_processor.go:17-29`): ATTACK -10, DEFENCE -20, ESCAPE -30, TIMEOUT -40, SKILL -50,
    ITEM -60, CATCH -70, POSITION -80, RETURN -90, PET -100, AUTO -110. The client builds
    `{tid, action, id, level}` (`docs/client/logic/Battle.as:1126-1131`): attack `tid = target battleId (position), id 0`; defence `tid -1, id -1`; skill
    `id = skillId`; item `id = bag item row id` (`slot.id`). Solo without pet sends the single command immediately; with a pet it batches 2 (`Battle.as:1132-1160`).
29. `BattleUpdateCmd` (`commands.go:31-271`): no active battle -> `{success:false,error:"Battle is not active"}` (not an RPC error);
    accepts array / indexed map; index 0 is the character, index 1 the pet (`parseCommands`, `commands.go:273-386`). Per command: `tid` string/number -> string,
    `action` number, `id` number -> `SkillID=ItemSlot=SelectedPetID`, `level`. Skill commands for skills the character does not own (`skillRepo.HasSkill`) are **dropped**
    (`commands.go:363-380`); then the round waits for every alive player-side *character* (`MissingPlayerCommandActors`). Missing -> reply
    `{success,battleId,round,waitingForCommands:true,missingActorIds}`.
30. Empty-payload ping: round 1 and `BootstrapAutoDefendFired == false`, or no pending commands with a live player -> server fabricates **ATTACK** commands
    (named "auto defend" but `ClientActionAttack` at the front-line/random enemy; `commands.go:453-505`). Pending commands -> processes them. Else "stale empty ping" -> waiting reply.
    H5 solo: not needed unless the client pings (open question 8.6).
31. Round (`turn_processor.go:200-349` `ProcessRound`): `GenerateNPCCommands` (every alive `IsNPC` enemy without command; **always basic attack**:
    `npc_ai.go:27-29` `SelectCommand -> buildAttackCommand`, target `SelectFrontlineTarget(player side)` -> random alive); decrement skill cooldowns; mark
    `defendingIDs` for commands with action `-20` **only** (a `-40` timeout does not defend); order actors = those having a command, by
    `speed * statusSpeedModifier` descending (`:517-533`, `sort.Slice`, unstable, map-order input -> ties random). For each actor: skip if gone/dead (no output);
    status ticks (none in M2); execute; after each actor `if playerFled -> end (winner enemy)`; `CheckVictory -> end`. After the loop `NextRound()`, round 30 exhausted ->
    ended, winner enemy.
32. Victory (`battle.go:853-882`): any alive on a side; both dead -> enemy wins; enemies all dead -> player wins; players all dead -> enemy wins.
33. Target resolution (`turn_executor.go:45-69`): `tid` is tried as participant id first, then as **battle position**, must be an alive opponent. If the target is
    gone/dead when the actor's turn comes, the attack becomes a miss action `{tid:-1}` (`executeAttack`, `:76-89`) - **no retarget** (retarget only inside multi-hit skills).
34. Defend: one action `{bid 0}` (self-target), actor id in `defendingIDs`; incoming damage on it is `trunc(damage / 2)` and the hurt action uses behaviour 6 (3.5).
35. Escape (`turn_executor.go:258-295`): **always succeeds, no chance formula** (confirmed negative). Player-side non-queued escape -> `SetPlayerFled`, battle ends with
    winner enemy, `result=2`; no exp/loot; HP/MP kept. Queued leave (group disconnect) kills only that actor.
36. Timeout (`application/battle/service.go:19-22`, `timeout_handler.go:30-65`): deadline = 30 s (PVP 25 s) set per alive player character when the battle starts and after
    each processed round (`group_battle.go:100-120,142`); checker ticks every 5 s (so 30-35 s). On expiry: missing commands -> `-40` -> a **defend animation without damage
    reduction**, round processed, `onBattlePlayList` pushed (`service.go:291-342`). Gaps: deadlines are **not re-armed** after a timeout round; `finalizeTimedOutBattle`
    is never called, so a battle ended by timeout only settles when the client sends `battlePlayEnd`; the timeout playlist's end marker uses `result 1` even on a loss
    (`service.go:299`) while the normal path uses 0/1/2. Stale battles (> 10 min) are cancelled (`service.go:344-377`). Cleaning up on disconnect: persist HP/MP
    and `EndBattle` (`application/combat/service.go:235-287`).
37. Items in battle (`turn_executor.go:297-333`, `battle_item.go:41-128`): `id` = bag item row id; consumable required; heal amounts from template `i1/i2` first, else the
    potion table (`GetPotionHealAmount`); consumed first, then `Heal`; action has `damage = -hpRestored` -> `tSObj.rHp`, `rMp`. (H5 `inventory/potion.ts` already has the
    amounts; note `i1/i2` are not amounts for type 501.)
38. Skills: see section 3.7.

### 3.5 Damage (live V1 formula) - Go-invented

`COMBAT_PERMILLE_V2` env gate: `usePermilleV2 = os.Getenv("COMBAT_PERMILLE_V2") == "1"` (`domain/combat/resolve.go:15`); not set in the repo (grep), so the **V1 path is live**
(`turn_builder.go:22`). V2 (per-mille, 11-hit combos, `PropFinalPhysDmgUp` ...) is opt-in and out of scope. No source for the original formula exists in the repo; the
memory file says the skill-damage mapping is "provisional rather than a proven original-game damage contract" (`docs/memory/battle-combat.md:72`) and
`skill_adapter.go:217-232` calls its mapping a heuristic. Treat everything in this section as a **rule we choose to copy**, not an original rule.

```ts
const C = { MAX_DODGE: .5, MAX_CRIT: .5, MAX_REDUCE: .75, MAX_RESI_DEFY: .8, MAX_COMBO: .25, MAX_COUNTER: .30,
            COMBO_MULT: .6, COUNTER_MULT: .5, BASE_CRIT_DMG: 150 };
// damage.go:59-143 + 273-294 (CalculateDamageWithPosition) + turn_builder.go:12-227
function hit(a: P, d: P, sk: {magic: boolean; mult: number; base: number; range: number}, defending: boolean) {
  const dodge = clamp((d.dodge - a.hit) / 100, 0, .5);              // Hit seed is 100, so misses are almost never
  if (rand() < dodge) return { miss: true, dmg: 0 };
  let atk = (sk.magic ? a.magicAttack : a.attack) * sk.mult + sk.base;
  atk *= 1 + a.level * 0.02;
  const pen = ((sk.magic ? a.praMagDef : a.praDef) / 100) * (1 - clamp(d.resiDefy / 100, 0, .8));
  const def = Math.max(0, (sk.magic ? d.magicDefense : d.defense) * (1 - pen));
  const c = 300 + a.level * 5;                                       // NOTE: attacker level
  let dmg = atk * (c / (c + def));
  dmg *= 1 + (sk.magic ? a.enhMagicHurt : a.enhPhyHurt) / 100;
  dmg *= 1 - clamp((sk.magic ? d.reduceHurt2 : d.reduceHurt1) / 100, 0, .75);
  const crit = clamp(a.critical / 100 - d.resiCritical / 100, 0, .5);
  const isCrit = rand() < crit;
  if (isCrit) dmg *= 1.5 * (1 + Math.max(0, a.criticalDmg >= 150 ? a.criticalDmg - 150 : a.criticalDmg) / 100);
  dmg = Math.max(1, dmg);
  dmg *= elementMod(a.element, d.element);                           // 1.25 / 0.75 cycle 1>4>5>2>3>1; 0 = neutral
  dmg *= 0.9 + rand() * 0.2;
  let out = Math.round(dmg);                                         // Go math.Round
  out = Math.max(1, Math.trunc(out * positionMod(a, d, sk)));        // see below, min 1
  if (defending) out = Math.trunc(out / 2);                          // after position mod; can reach 0
  return { miss: false, dmg: out, crit: isCrit };
}
```

39. Basic attack = skill 1001 resolved through the gamedata adapter: `data_tbl_skill` row 1001 exists ("Trang Thai Phong Ngu", `type 1`, `exp_skill 0`, `dex_skill -1`),
    so `baseDamage = 0, multiplier = 0` -> adapter forces **`base 10, mult 1.0`** (`skill_adapter.go:76-79`), `range = 1` (type 1 = close), physical, 1 hit.
    Same numbers as the built-in default (`domain/skill/skill.go:177-190`).
40. Position modifier (`damage.go:385-441`): `attackerRow == Front -> *1.1`; defender `Back` row: melee (`range <= 1`) `*0.7`, ranged `*0.9`; ranged vs `Front` `*0.9`.
    `GetRowForSide` maps player side `y==0` front / `y>=3` back and enemy side `y==3` front / `y==0` back, but the grid puts enemy characters at `y=0` and player characters
    at `y=3`, so in practice **every character-row defender is "Back" -> melee x0.7 in both directions** (player at 10, enemies at 0/2/1/4/3), and the 1.1 bonus never applies.
    A player at 15 (`setBp(true)`, y=2, "Middle") takes x1.0. Replicate as-is (it is what the Go port ships) or simplify; decide in the plan (open question 8.3).
41. Combo (`damage.go:158-166`, `turn_builder.go:192-197,302-393`): only after a successful hit that leaves the target alive, `rand() < clamp(combo/100, 0, .25)`, second strike
    `base*0.6`, `mult*0.6` via plain `CalculateDamage` (no position mod, defend halves), cannot chain. Counter (`:199-204,395-496`): only basic/skill single-target hit, target alive,
    `rand() < clamp(counter/100, 0, .30)`, counter damage = skill 1001-like (`base 5, mult 0.5, range 1`) from the original defender; cannot chain. `combo`/`counter` come from
    equipment (`FinalCombo/FinalCounter`) so both are 0 in M2 until gear stats exist. Creatures have 0.
42. Kill / overkill: `target.TakeDamage` clamps HP to 0; the playlist `hHp` carries the **unclamped** value `preHp - damage` (`turn_builder.go:135-139`) because the Flash client shows
    `oldHp - hHp` as the popup.
43. Elements: `{1>4, 4>5, 5>2, 2>3, 3>1}` x1.25, reverses x0.75, equal/0 neutral (`damage.go:486-508`). Characters have `ee/ef/en`; creatures `element` (all sampled = 0).

### 3.6 End of battle, rewards (settled at the moment the battle ends)

44. `CombatService.EndBattle` (`application/combat/service.go:470-517`) runs inside the final `battleUpdateCmd` (or the disconnect / `battlePlayEnd` fallback): winner player ->
    `exp = CalculateExpReward(players[0].level, enemies)`, `money = CalculateMoneyReward(enemies)`; then in order: character rewards, pet rewards, pet life drain
    (pets only), item drops, boss loot (`BossCtx` only), caught pets; `battle.End(result)`; battle log saved; battle removed; ended battle cached until every player calls `battlePlayEnd`
    (`:519-541`, `AckBattleCleanup :201`).
45. Exp (`damage.go:186-217`) - Go-invented: per **dead NPC** enemy `base = enemy.expReward > 0 ? expReward : enemy.level * 10`; `diff = enemy.level - playerLevel`;
    `diff > 0 -> min(1.5, 1 + 0.05*diff)`; `diff < 0 -> max(0.1, 1 + 0.1*diff)`; sum `trunc(base * mod)`. `map.exp_multi` and `map_creature.exp_set` are unused (grep). In seeds the
    normal rows have `exp = -1`, so exp = `level*10` x modifier; boss row 181 has `exp = 638`. Quest-battle creatures have no row -> `level*10`.
46. Money (`damage.go:219-229`): `sum(enemy.level * 5)` over dead NPCs, credited to **`moneyBind`** (`rewards.go:58-60`). Recipients = alive player characters (`rewards.go:484-504`), each gets
    `total / n` (integer). Dead players get nothing; if nobody alive -> 0.
47. Level-up (`character.go:545-568`): `GainExperience` loops while `level < 20` (`AutoLevelCap`) and exp >= next threshold: `+5 attrPoints`, `+1` each of str/agi/sta/int/spirit,
    `RecalculateStats` (current HP/MP not restored). From 20 on the client sends `lvUp` (already in H5 M1). H5 `applyExp` (`quest.rules.ts:83`) is the same rule.
48. Loot (`rewards.go:155-344`): for each dead enemy, `data_tbl_creature_loot` rows by `cid`; `rate <= 0` skipped; row with `qid > 0` only if some recipient has that quest **active**
    (`filterEligibleLootRecipients`); `effectiveRate = rate`, `*5` (cap 50000) when it is an item row and a recipient has an active collect objective for that item and `current < required`
    (`questItemDropRateMultiplier = 5`, `rewards.go:20,209-214`); success when `rand.Intn(50000)+1 <= effectiveRate`. Item types 508/509 -> quest item (`SlotTypeQuestBag`), 550 -> pet item bag
    (`rewards.go:407-446`); `qty = qtyMin + rand(qtyMax-qtyMin+1)` (min 1); persisted into inventory immediately (`AddItemWithBindAndColor`, bound = `b == 1`). Types 30/31/35 are currency/exp/game-KV
    rows (`currency_drops.go`): 30 basic money/gold (bound variants), 31 exp, 35 game currency. Observation: quest-bound rows have `rate 10000`; with the x5 hack that is exactly 100 %, which
    suggests the original denominator was 10000 (Go picked 50000; open question 8.7). `qid -1` rows (bag drops) use the same roll.
49. HP/MP/SP persistence: only at `battlePlayEnd` (`battle.go:408-416`): `char.CurrentHP/MP/SP = participant values`, `charService.Save`. Disconnect persists too (`service.go:251`). A lost battle persists HP `0`.
50. Kill-quest counters (`battle.go:496-554`, called inside `battlePlayEnd`, before the reward callbacks): only when the battle winner is the player; for **every enemy participant of type creature**
    (dead by definition) `questKill[creatureId] += 1` and `questService.OnMonsterKilled(charId, creatureId)` = `UpdateObjectiveProgress(KillMonster, creatureId, 1)` (`application/quest/service.go:984-1016`):
    for each active quest, the first incomplete objective with `type == kill && target == creatureId` gets `+1` (`domain/quest/quest.go:45-54`). Kills are credited regardless of how the battle started
    (random encounter, quest NPC, boss). If the client never sends `battlePlayEnd` (disconnect), kill credit is lost (rewards are not).
51. Kill objective source: `data_tbl_quest_require` row `kind == 2, type == 12` -> `ObjectiveKillMonster {target = item_id (creature id), required = num}` (`docs/memory/npc-quest-system.md:68-77`).
    `onAddChaQuest` carries `questKill: [{cid, creatureId, num}]` where `num` is the **remaining** count `required - current` (`application/quest/service.go:296-363`);
    TBL_CHARACTOR_QUEST_KILL has no static rows (`D:\mcgame\docs\database\details\TBL_CHARACTOR_QUEST_KILL.md`), the server keeps the counters inside the quest progress row.
    Collect objectives (`kind == 1`) have **no push on drop**: the server only sends `onAddItem` + `onAddCharactorSlot`; the client counts the bag, and `finishQuest` re-syncs from the bag.

### 3.7 Skills

52. Class starter skills: `data_tbl_class.start_skill` pipe list, learned right after character creation ignoring the level requirement
    (`application/character/service.go:118`, `LearnStarterSkill`). Seeds: class 1 `1010|1086`, 2 `2002|2012`, 3 `1892|1903`, 4 `1789|1819`, 5 `2114|2134`, 6 `2215|2225`.
53. Learn/upgrade (`UpgradeSkill`, `application/skill/service.go:166-205`): needs a template; `char.level >= req_level` (the `skillLearnByClient` path), `req_class` pipe list contains the class (empty = any),
    `req_c_l` class-rank gate (value 10 = rebirth sentinel); existing exact id -> no-op; same `code_name` family at lower level -> **replaces the row's skill id in place**; else creates the row.
    `skillLearnByClient` returns `true`/`false` (Boolean responder), optional 2nd arg `position` (<= 0 or null clears) -> `ApplySkillPosition` (unique per position); on success pushes
    `onSkillUpdate(skills)` and `onMWeaponSkillUpdate(skills, true)` (`combat/skill_callbacks.go:38-44`). Skill DTO: `{id, entryId, skillId, sid, level, exp, isAuto, cooldown, slot?, position, kind}`
    (`domain/skill/skill.go:130-142`, `skill/service.go:73-85`). `initLearnedSkill()` returns the same array.
54. `skillSetBattle(skillId, tbl, slot, isPet)`: character slots 1,3,5,7 (pet 2,4,6,8), requires `HasSkill`, stores interface keys `bt<slot> = 52` and `bs<slot> = skillId`; returns `true`
    (`interface_settings.go:144-206`). Auto-battle slots `bs1..bs8` are read by the client only; server auto-battle is not implemented (the client re-sends `_lastCmd` for `-110`).
55. Skill execution (`turn_executor.go:100-164`): unknown id -> basic attack; on cooldown / not enough MP (`use_mp`, fractional values floor to 0) / silenced -> **falls back to basic attack**; MP is spent
    before the hit; `skill level` command arg > 1 scales `base` and `mult` by `1 + 0.1*(level-1)` (`applySkillLevelScaling :477`).
    Mapping from `data_tbl_skill` (`skill_adapter.go:51-90`): `type` 1/2 -> physical, 3/4 -> magic, 5/9 -> heal, 6 buff, 7 debuff, 8 physical, 10 buff, other (including 11 passive) -> physical;
    `range`: type 1 = 1 (melee, approach), others 2 (stay); `target_type` -> combat target type (4 enemy single, 8 team single, 11 all, 2 self-player ...); `area_attack` 1 V / 2 H / 3 C / 4 R +
    `target_num` = area size; `attack_num` = number of hit repetitions (min 1); `use_mp/use_sp`; `buff_id/buff_rate/buff_round` -> status (ids 1..10 mapped to status effects, others ignored);
    `base = int(exp_skill)`, `mult = dex_skill` (`> 10 -> /100`), **both 0/-1 in every starter skill, so every damage skill ends up with base 10 / mult 1.0** (`skill_adapter.go:76-79`).
    The percentages in skill descriptions ("110 % physical damage") are never parsed -> Go skill damage is a placeholder. `data_tbl_skill_effect` is **empty in Mongo** (0 docs, no seed file) and
    has no Go reader; the `front_eff_id/attack_eff_id/skill_eff_id/bullet_id` columns referenced by the model do not exist in `data_tbl_skill` -> effect ids are always the defaults (3.8).
56. Heal skills (`executeHealSkill :166-197`): `heal = trunc((base + magAtk*mult) * (1 + level*0.01) * [0.9,1.1])`, `Heal` clamps to max; action `damage = -heal`, `tSObj.rHp`. AoE target groups and status
    buffs exist in code (`target_resolver.go`, `status_effect.go`) but are out of M2 scope for a solo basic-attack slice. NPC skills (`creature_skill`, e.g. creature 157 has sids 2743/2736/3695) are never used by NPC AI.

### 3.8 Death and revive (section 7 in the template) - rules

57. A defeated player: no exp/money/loot, HP persisted as `0`, **no teleport, no durability loss, no money loss** (grep of the combat/scene handlers). At the end of playback the client sees
    `currentHp <= 0` and calls `reliveSwitch` (`BattleStage.as:1593-1595`).
58. `reliveSwitch` returns the constant `1` (`recovery.go:272-277`) -> client shows `_RELIVE_NORMAL` dialog (`BattleStage.as:1974-2110`, text `Language.as:736`): OK -> if the bag has item
    721 (`ITEM_STAND_IN_BABY`, "Hinh Nhan") `reliveUseItem()` else a second confirm (18 gold) then `reliveUseItem()` / `toSafe()`; Cancel / 20 s timer -> `toSafe()`. Result `2` (free) and `3` (boss, 30 s
    gold countdown) trigger `freeRelive(1|2)` and `bbGoldRelive/bbNormalRelive` instead; Go never returns them.
59. `reliveUseItem(itemId?)` (`recovery.go:217-270`): the client sends **no argument**; Go consumes the item only if `itemId > 0` (never in practice), then sets `hp = maxHp, mp = maxMp`, saves, pushes
    `onUPP{currentHp, currentMp}`, returns `{success:true}`. **No stand-in item check, no gold charge** (the client prompt promises 721 or 18 gold).
60. `freeRelive(type)` (`:176-215`): full HP/MP regardless of `type` (1 = revive here, 2 = go home), `onUPP{currentHp,currentMp}`. `bbGoldRelive`: cost **100 moneyBind** (not gold; the client says 6 gold),
    full HP/MP, `onUPP{currentHp,currentMp,moneyBind}`, `{success:false,error:"insufficient_gold"}` if short. `bbNormalRelive`: HP/MP = `max/2` (min 1), `onUPP{currentHp,currentMp}`.
    `toSafe` (`scene/movement.go:301-356`): **same map**, position = `data_tbl_map.safe_x/safe_y` (fallback table, else 100,100); if `hp <= 0` then `hp = max(1, maxHp/2)`, `mp = maxMp/2`
    + `onUPP{currentHp,currentMp}`; broadcast `onCharTeleport{cid,posX,posY}`; reply `{success,mapId,posX,posY,sceneReady}`. Rate limit 1100 ms.
    These handlers do not check that the character is dead or out of battle.

## 4. State

| State | Where in Go | H5 proposal |
|---|---|---|
| Active battle (participants, round, pending commands, deadlines, watchers) | **in-memory** `battleRepo` (`domain/combat/repository.go`), `BattleService` maps; ended-battle cache 1 per battle until acked | in-memory `Map<charId, Battle>` in `server/src/modules/battle/battle.service.ts`; lost on restart (character HP is only written at settle -> on restart the character keeps pre-battle HP/MP; acceptable) |
| Battle log (`CreateInitial` / `Save`), `battleFieldId = "<logId>_<charId>"` | Postgres battle log (`application/combat/encounter.go:20-33`) | skip; `battleFieldId = "<Date.now()>_<charId>"` (Go fallback form, `encounter.go:25,32`) |
| Character HP/MP/exp/level/moneyBind | `player.characters` | existing `Character` schema (`currentHp`, `currentMp`, `exp`, `level`, `attrPoints`, `moneyBind`) |
| Quest kill counters | inside quest progress objectives (`current`) | `character_quests.objectives[].current` (existing schema; objectives of kill type must be added to `quest.rules.ts`) |
| Learned skills | `player.character_skills` (`skillRepo`): `character_id, skill_id, level, exp, slot_position, is_auto, cooldown_end` | new `character_skills` schema `{characterId, skillId, level, exp, position?}`, unique `(characterId, skillId)` |
| Hotbar / battle slots (`bt/bs`) | `player.characters.pm_process_data["interfaceData"]` | defer (client-only auto-battle) |
| Random encounter cooldown | connection field | `Session` field `encounterUntil` |
| Loot | direct inventory insert | existing inventory service; quest-bag slot for item types 508/509 |

Restart story: Go also loses active battles on restart (in-memory); `battleRepo.GetAllActive` stale cleanup is only a timer.

## 5. Data tables

All `data_tbl_*` in Mongo, snake_case.

| Collection | Columns used | Meaning |
|---|---|---|
| `data_tbl_map` | `id, safe_flag, basic_battle_rate, level, lv, safe_x, safe_y, exp_multi(unused)` | map 1: `safe_flag 1, rate 0, level 1`; map 3 (Van Dai): `safe_flag 0, rate 50, level 2` |
| `data_tbl_map_creature` | `mid` (map), `cid` (creature), `start_rate`, `end_rate` (0..100 band), `level`, `boss_flag` (0 normal, >0 boss), `exp` (-1 = none), `exp_multi`, `with_cloud`, `battle_mode, unique_flag, q_level, exp_set` (unused) | 1192 rows. **Map 1 has none** |
| `data_tbl_creature` | `id, name, use_lv, life (per-10000 hp percent), grow_base, att_{strength,agility,stamina,intelligence,energy}, apt_*, prop_{hit,dodge,speed,critical}, element, res_code, icon_code, color_code, skill` | creature template |
| `data_tbl_creature_skill` | `cid, sid, position` | only read by NPC AI plumbing (unused: AI = basic attack) |
| `data_tbl_creature_loot` | `cid, item_id, type (29 item / 19 equip / 30,31,35 currency), qid (-1 none / quest id), rate (x/50000 in Go), qty_min, qty_max, quality, b (bound)` | 1669 rows |
| `data_tbl_npc` | `id, type (10/19/20 battle), sub_type (quest id list for type 20/10), pos_map_id, pos_x, pos_y, lv, res_code` | NPC 475 = Ke Vuong, type 20, map 3, `sub_type '50|5418|5419'` |
| `data_tbl_quest` / `_quest_require` / `_quest_pre` | require: `qid, kind (1 item, 2 creature), type (29 item, 12 creature), item_id, num, q`; pre: `qid, kind 2 = quest, item_id = prereq quest` | kill requires = 1239 rows |
| `data_tbl_skill` | `id, type, kind, target_type, target_num, area_attack, attack_num, use_mp, use_sp, use_hp, exp_skill, dex_skill, buff_id, buff_rate, buff_round, req_level, req_class, req_c_l, level, code_name, name, description` | 4914 rows; skill ids >= 1000 are real, `1001` is the defend-state skill |
| `data_tbl_class` | `start_skill, res_code_male/female, icon_code_male/female` | |
| `data_tbl_skill_effect` | - | **0 documents** (negative) |

Pairing, newbie map 1 (Xuat Van Thon, `data_tbl_map` id 1): `safe_flag 1`, `basic_battle_rate 0`, **no** `data_tbl_map_creature` rows -> **no random encounters and no fights on map 1**. The first
map with encounters is **map 3 (Van Dai)** (`rate 50`, level 2), which is also where the main chain goes (NPC 430 Su Gia Vien is on map 3, `docs/memory/quest.md` in this repo):

| map_creature id | map 3 creature | band `[start,end)` | row level | creature | loot tied to the quest chain |
|---|---|---|---|---|---|
| 514-518 | 56 Nam Luc | 0-4, 4-9, 9-18, 18-23, 23-24 | 5,3,3,3,4 | `use_lv 1`, life 3500 | `qid 49 -> item 1684` (quest-bag 508), rate 10000 (`creature_loot` id 5120); `qid 161 -> item 40` |
| 519-523 | 4 Tieu Co Thu | 24-29 ... 48-49 | 4,3,3,3,4 | | `qid 47 -> item 516` rate 10000 |
| 524-528 | 14 Nam Dong Co | 49-54 ... 73-74 | 5,4,3,3,4 | | `qid 87 -> item 935`, `qid 299 -> item 603` |
| 529-533 | 2 That Vi Ke | 74-79 ... 97-99 | 4,3,3,3,4 | | `qid 48 -> item 30` rate 10000; `qid 161 -> item 512` |
| 471 | 181 Thu Linh That Vi Ke (boss, flag 2, exp 638) | 99.5-100 | 5 | | excluded from random; loot item 718 etc. |

Concrete creature (level 3, creature 56 = Nam Luc; computed with the formulas of 3.3, verified by a node re-implementation):
`hp 51, mp 101, atk 3, def 30, magAtk 17, magDef 62, hit 100, dodge 0, speed 103, crit 0`. Creature 2 (lv3): `hp 33, atk 25, def 21, speed 117, dodge 6, crit 6`.
Creature 157 (Ke Vuong) at the quest level 2: `hp 374, mp 924, atk 64, def 320, magAtk 264, magDef 664, hit 112, dodge 1, speed 135, crit 6`
(level multipliers are 1.0 below level 10; def 320 against attacker level 5 gives `c/(c+def) = 325/645 ~ 0.5`, so a Lv5 player with attack ~20 deals about
`(20+10)*1.1*0.5*0.7 ~ 11` per hit (rough, unverified estimate) vs 374 HP, i.e. ~30+ rounds, right at the 30-round cap; the quest text itself says "should party up". Open question 8.8).

First kill quest in the newbie/main chain: **quest 50 "Danh Bai Ke Vuong"** (`data_tbl_quest` id 50: type 1, `min_level 5`, `start_npc = finish_npc = 430`, `award_exp_re 4130`,
`money_num 2500 moneyBind`, `pre_quest_type 1`):

| Hop | Source |
|---|---|
| prerequisite chain | `quest_pre`: 47 <- 46 (item_id=46), 48 <- 47, 49 <- 48, 50 <- 49 (all `kind 2`, `type -1`); 46 <- 161 (`type 45`) |
| collect quests on the way | 47: item **516** x1 (`kind 1, type 29, q -1`) dropped by creature **4** (`qid 47`); 48: item **30** x1 dropped by creature **2** (`qid 48`); 49: item **1684** x1 dropped by creature **56** (`qid 49`) - all random encounters on map 3 |
| kill require | `data_tbl_quest_require` id 886: `qid 50, kind 2, type 12, item_id 157, num 1, q 1` -> creature 157 "Ke Vuong" |
| NPC | NPC **475** "Ke Vuong", `type 20`, `pos_map_id 3 (1762,1579)`, `sub_type '50|5418|5419'` |
| enemy level | `max(1, 5/2) = 2`; boss flag 0 so the player-level cap normalizer runs (no change at level 2) |
| creature | 157: `life 3500`, `use_lv 0`, att `10/5/40/40/30`, apt `2000/2000/2000/1700/1700`, `res_code 2060100200011` |
| loot | `data_tbl_creature_loot` has **no rows for creature 157** (no drops) |
| reward on turn-in | exp 4130 + 2500 moneyBind at NPC 430 (existing H5 `finishQuest`) |

Other kill examples: 3165 (type 10 NPC 143, creature 126 `use_lv 150`, quest level `min_level/2 = 2`), 168 (creature 1 x3, `min_level 6`), 53 (creature 154 x3, `min_level 7`, no NPC lists it).

## 6. Push sequence

Solo, no pet. Names are the Flash callback names; pushes go to the fighter's connection unless noted.

**Start (`cbom` or quest/boss start)** - all before the RPC reply:
1. `onSetCharState {cid, state: 5}` (self) (`battle_start_callback.go:78-107`; pet `onUpdatePet(petId,"currentHp",...)`/`"currentMp"` precede it only when a pet exists).
2. scene broadcast of `onSetCharState {cid, state: 5}` to others on the map (`broadcastSceneCharState`).
3. `onBattleStart { battleFieldId, cList, guest:false, sneakFlag:0, bossFlag:false, airBattle:false }` (`group_battle.go:58-68`). **There is no `battleType/nid/mapId/battleData` top level** (stale memory).
   `cList` keyed by position string. Entry (`domain/combat/battle.go:166-228`):
   - common: `id` (entity id string), `type` (2/12/39), `name`, `level`, `hpMax`, `hp`, `mpMax` (numbers), `battleId` (= position int), `resCode` (string), `iconCode` (string, only if > 0), `colorCode` (string)
   - creature: `mp` (number), `bossFlag` (string), `withCloud` (string, `"-1"` if 0)
   - character: `mp`, `sp` (strings), `spMax`, `star` (string), `ee`, `ef`, `en`, `wp` (string, only if > 0)
   - (the `attack/defense/speed/isAlive` fields in the memory doc do not exist)
4. RPC reply: cbom `{success,inBattle:true,encountered:true,battleId,npcId}`; clickNpc quest battle `{success,battleId,battleData}`; hitNpc same.
   No encounter: `{success:true,inBattle:false,encountered:false}`; already fighting: `{success:true,inBattle:true}`.

**Per round (`battleUpdateCmd`)**:
- waiting for more commands -> reply only (no push).
- round resolved (battle continues): `onCmdReady(position)` then `onBattlePlayList(groups)`; reply `{success,battleId,round,actions(flat),cList,[moreTurns]}` (`commands.go:217-261`).
- round resolved (battle ended): `onUPP {currentHp, currentMp}` (`group_battle.go:175-190`, **before** the playlist), then `onBattlePlayList` whose last group is `[{end:true,type:0,result}]`
  (`result` 1 win / 0 loss / 2 fled; `type` always 0 from the handler). Rewards are already persisted here.
- timeout round: only `onBattlePlayList` (+ `onSetCharState{state:1}` on end) (`battle/service.go:291-342`).

**Playlist shape** (`domain/combat/battle.go:263-335`, `playback_rounds.go`): `onBattlePlayList(groups: Action[][])`; each action
`{sid: actorPosition, tid: targetPosition, bid, sSObj, tSObj, delay}` (+ `effects` for dot/skip, never sent for skip). `BuildPlaybackRounds` makes one group per action except that an action with `bid 3|7`
followed by `bid 5|6` is paired into one group `[attack, hurt]`; multi-target skills are re-clustered into cast / projectile (`bid 11500`) / hurt / follow groups.

| action | bid | delay ms | notes |
|---|---|---|---|
| TurnTo | 10110 | 100 | `sSObj.skill`, `frontEff` on first of a skill |
| MoveToTarget | 1 | 200 | |
| Attack (basic) | 3 | 400 | `tSObj {hHp, cri?, attackEff: 2080130010008, skillEff: 2080130010008}`; miss: `tSObj {}` |
| Skill | 3 if physical else 7 | 400 / 500 (magic, debuff) | `sSObj {uMp, skill}`; `tSObj {hHp, skillEff}`; heal `tSObj.rHp` |
| Hurt | 5 | 100 | actor = target, tid = attacker |
| Defended (hurt while defending) | 6 | 0 | |
| Idle (target survives) | 0 | 0 | |
| Die | 10120 (NPC) / 4 (player) | 200 | after the hurt |
| Back | 10080 | 0 | |
| TurnBack | 10100 | 300 | |
| Defend / timeout | 0 | 300 | self target |
| Escape (Flee) | 10130 | 300 | |
| Item | 7 | 300 | `tSObj {rHp, rMp}` |
| Summon etc. (pet) | 14000-18000 | | out of scope |

Melee attack sequence: `TurnTo, MoveToTarget, [Attack+Hurt], (Idle | Die), [combo..], [counter..], Back, TurnBack`; stationary magic/heal skills add a trailing `TurnBack` (`turn_builder.go:253-258`).
Dead/absent actors produce no output. Effect ids: only the observed constant `2080130010008` (`turn_builder.go:278-286`, `skill_adapter.go:27`); no default `frontEff/bullet` (Go stopped inventing them).
Effects are skipped client-side when the player setting `he` is on.

**After the animation: `battlePlayEnd` handling** (`combat/battle.go:274-494`), in order:
1. (fallback) if the battle is still active -> `CheckVictory`, else `winner = enemy`, `EndBattle`.
2. if the player won: for each updated quest `onAddChaQuest(questDTO)`; if the quest is now complete and has a finish NPC `onSetNpcState(npcId, state)` for that NPC (`quest/notify.go`); then
   `onUpdateQuestKill { "<creatureId>": count }` (number killed in this battle).
3. `char.hp/mp/sp = participant`, save; `onUPP { <full char DTO incl. property>, expSkill: exp }` (always, even on loss/flee), then if leveled `onPlayerLevelUp {id, exp, lp, maxMovePnt, maxAct, maxVigor, level}`,
   `lvUp({}, 1, null)`, `onSkillUpdate(skills)`, `onMWeaponSkillUpdate(skills, true)` (`utils/exp_helper.go:17-52`, `combat/skill_callbacks.go:22-36`).
4. loot: per item `onAddItem {i,q,s,c,t,n,tt}` + `onAddCharactorSlot(itemDto)`; per currency drop `onAddExp(cid, delta, total)` / `onAddMoney(cid, key, delta, total)`; per caught pet `onAddPet`;
   bag-full warning. Note the **base money/exp reward is not pushed as `onAddMoney`/`onAddExp`**; the client learns it through `onUPP` (money fields are inside the character DTO).
5. `onSetCharState {cid, state: 1}` self + scene broadcast; connection `ClearBattle`; encounter cooldown +4 s; ack cleanup.
6. reply `{success:true, rewards:{winner, exp, money, items, currencies, pets, battleTime}}`; with no/unknown battle id `{success:true, rewards:{exp:0,money:0,items:[]}}` (after `onSetCharState{1}`).

Error paths: unknown battle at `battlePlayEnd` -> clears the connection state, `onSetCharState{1}`, empty rewards reply (no error). `battleUpdateCmd` without a battle -> `ErrorToResponse(not found)` object, not a thrown RPC error.

## 7. Port notes (H5)

Proposed layout (each file < 300 lines):

- `server/src/modules/battle/battle.service.ts` (in-memory battles, start/settle/timeout), `battle.rpc.ts` (`cbom`, `battleUpdateCmd`, `battlePlayEnd`, `battleFieldGetInfo`, relive RPCs + `hitNpc`),
  `battle.model.ts` (Participant/Battle/Action types), `combat-formulas.ts` (pure, unit-tested: creature stats, damage, exp, rate), `playback.ts` (action builder + grouping), `loot.ts`, `battle.module.ts`.
- `server/src/modules/skill/skill.service.ts` + `character-skill.schema.ts` (starter skills at create, `initLearnedSkill`, `skillLearnByClient`, `skillSetBattle`).
- `GameDataService` accessors to add (cached at startup like quests): `mapCreaturesByMap(mapId)`, `creature(id)`, `creatureLoot(cid)`, `skill(id)`, `npcType 10/19/20` helper via existing `getNpc`.
- Shared types in `packages/shared/src/battle.ts`: `BattleStart`, `BattleParticipant`, `BattleAction`, `BattleCommand`, `BattleEnd`, constants `BATTLE_ACTION`, `BEHAVIOR`, `CHAR_STATE {NORMAL:1, BATTLE:5}`, `BATTLE_POS`.
- Quest: extend `quest.rules.ts` (`isSupported`, objectives) with kill (`kind 2/type 12`) and collect-from-bag (`kind 1`), `onMonsterKilled`; `QuestService` pushes `onAddChaQuest` + `onUpdateQuestKill` from `battlePlayEnd`.
- Session needs `inBattle` + `encounterUntil`; guard `scene` movement/NPC/shop RPCs with it (Go does not, deviation but cheap).

```ts
// cbom(x, y) -> CbomResult
cbom(session, x, y) {
  const b = battles.get(session.charId); if (b?.active) return { success: true, inBattle: true };
  const map = gd.getMap(session.mapId); if (!map || map.safe_flag > 0) return NONE;
  if (Date.now() < session.encounterUntil) return NONE;
  let rate = map.basic_battle_rate; if (rate <= 0) return NONE;
  if (rate > 1) rate /= 1000; rate = clamp(rate, 0.3, 0.75);
  if (Math.random() >= rate) return NONE;
  const rows = gd.mapCreatures(map.id).filter((r) => r.boss_flag === 0); if (!rows.length) return NONE;
  const n = Math.min(1 + Math.floor(Math.random() * 2), rows.length);               // solo
  const enemies = Array.from({ length: n }, () => {
    const roll = Math.random() * 100;
    const row = rows.find((r) => roll >= r.start_rate && roll < r.end_rate) ?? rows[rand(rows.length)];
    const cr = gd.creature(row.cid); if (!cr) return null;
    const lvl = row.level > 0 ? row.level : cr.use_lv > 0 ? cr.use_lv : map.level > 0 ? map.level : 10;
    return withExp(capToPlayer(creatureStats(cr, lvl), char.level), row);            // exp only if row.exp > 0
  }).filter(Boolean);
  return battles.start(session, char, enemies, { kind: 'random' }); // pushes 5, 5(broadcast), onBattleStart
}
// creatureStats(cr, lvl) = section 3.3 (19-20); capToPlayer = 21 (skip boss_flag>0); applyDefaults = 22.
// quest start: clickNpc type in {10,19,20}: active quest in npc.sub_type, targets = incomplete kill objectives, level = max(1, floor(min_level/2)).
```

Round and settle sketch:

```ts
battleUpdateCmd(session, cmds: unknown) {           // 200 ms limit
  const b = battles.byChar(session.charId); if (!b?.active) return { success: false, error: 'Battle is not active' };
  const cmd = parse(cmds[0]);                       // { tid:number, action:number, id:number, level:number }; reject unknown skill ids (HasSkill)
  const order = [player, ...enemies].filter(alive).sort((a, b) => b.speed - a.speed || coin());
  const actions: Action[] = [];
  for (const actor of order) {
    if (!actor.alive) continue;
    const c = actor.isPlayer ? cmd : { action: ATTACK, tid: pickRandomAlive(player side) };
    actions.push(...execute(actor, c));           // 3.4-3.5; target gone -> miss with tid -1
    if (fled || victory()) break;
  }
  if (!ended && ++b.round > 30) ended = true, winner = 'enemy';
  if (ended) { settle(b); session.callback('onUPP', { currentHp, currentMp }); }  // before the playlist
  else session.callback('onCmdReady', player.position);
  session.callback('onBattlePlayList', group(actions).concat(ended ? [[{ end: true, type: 0, result }]] : []));
  return { success: true, battleId: b.id, round, actions: flat, cList };
}
// settle(b): exp = sum(per dead enemy), money = sum(level*5) -> char.moneyBind, applyExp (quest.rules.ts), loot roll, write HP/MP only at battlePlayEnd.
```

Settlement ordering to keep (consume-then-credit): at `settle` the battle is flagged ended first (idempotent guard), then exp/money/loot are credited once; `battlePlayEnd` only persists HP/MP, runs kill-quest credit
(`once` flag on the battle), and sends callbacks. For H5, credit kills at settle time (not at `battlePlayEnd`) so a disconnect cannot lose quest progress, but push the quest callbacks at `battlePlayEnd` to keep the Go order.

Where the existing code plugs in: `CharacterStatsService` (effective hp/mp/atk/def/speed/hit/dodge/crit), `inventory/potion.ts` (item action), `quest.rules.ts applyExp`, `Session.callback`, `SceneManager.broadcast`
(`onSetCharState`). Needed new class fields: none for solo (`currentHp/currentMp/exp/level/moneyBind` exist).

## 8. Unverified / open questions / confirmed negatives / memory-doc disagreements

Confirmed negatives (Go has none of these):
- No `onEndBattle` push; end = `{end:true,...}` in the playlist + `battlePlayEnd`.
- No escape chance (always succeeds), no defend damage bonus beyond halving, no NPC skill use, no NPC defend/escape/heal (AI is basic attack only; `SelectCommand` short-circuits, `npc_ai.go:27`).
- No death penalty (durability, money, exp), no map move on defeat, no gating of revive RPCs, no 721 / 18-gold / 6-gold handling.
- No use of `map.exp_multi`, `map_creature.exp_set`, creature `prop_combo/prop_counter/prop_defy/resi_defy` for creatures; `data_tbl_skill_effect` is empty and unread.
- No server-side auto-battle; no HP gate on battle start; no in-battle gating of other RPCs.

Memory docs that are stale vs code (use the code): `basicBattleRate 50 -> 5 %` (code: 30 % floor, `encounters.go:253-255`); `onBattleStart` fields `battleType/nid/mapId/battleData` (code: `group_battle.go:58-68`);
cList `attack/defense/speed/isAlive` and numeric `resCode` (code: strings, `battle.go:166-228`); end marker `type = winner` (handler sends `0`, only the timeout path sends the winner);
NPC types "1 normal, 4 boss" (`creature/npc.go`: 1 quest, 10 battle, 15 boss, 19 story battle, 20 quest battle); timeout "finalizes via the same end path" (never called);
behavior ids "Defend 6 / Die 4 / Back 10080": defend is `0`, hurt-while-defending is `6`, NPC death is `10120`.

Open questions:
1. Original rules: no original server source -> damage/exp/rates are Go constructions. Decide in the plan whether to copy them verbatim (recommended for parity of tests) or tune.
2. `reliveSwitch` returns `1` always: the client path that results (721 item or buy prompt) never charges anything. H5 plan must decide: keep free (Go parity) vs implement item 721 / 18 gold.
3. Position modifier quirk (3.5 #40): every melee hit x0.7 at default positions. Replicate or drop; either way keep `setBp` out of M2 (player stays at 10).
4. `hitNpc` / `clickBoss` for plain creature NPCs: Go resolves `npcId` as a creature id in current-map rows or falls back to defaults. H5 needs a decided source (`data_tbl_npc_creature`? not researched: 1 file in seeds).
5. Whether the Flash client needs `onCmdReady` for solo (Go sends it) - client side not traced here (`flash-client-researcher`).
6. Empty-ping behaviour is only needed with pets; unverified for solo.
7. Loot denominator: Go uses `rand(50000)+1 <= rate` and x5 for needed quest items; original likely 10000 (quest rows = 10000 = 100 %). Using 10000 would make plain drops (`rate 200`) 2 % instead of 0.4 %.
8. Quest 50 boss (def 320 at level 2) is borderline/unkillable solo with the Go formula (base 10 skill damage, 30-round cap, ~11 dmg per hit estimate). Quest-boss tuning needs a decision (e.g. cap creature defence, or lower `life`).
9. `applySkillLevelScaling` uses the *client-sent* `level` (unvalidated against the learned level) - H5 should read the level from the character skill row.
10. Skill damage columns: real multipliers exist only in `description` text; no `skill_eff` data. Starter skills in M2 should be limited to basic attack + maybe a single magic skill with fixed 1.0 / base 10, or parse descriptions in a later milestone.
11. Passive skills (type 11, e.g. 1086) fall into the "physical" default of `mapSkillType`; H5 must refuse them as battle commands.
12. Cannot confirm what happens on the Flash side when `onUPP` arrives before `onBattlePlayList` at battle end (HP bar changes early); kept as Go order.
