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
