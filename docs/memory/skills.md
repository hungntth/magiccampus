# Skills: window, learning, training, class rank (M9 phase B)

Plan: `docs/plans/2026-11-04_12_CORE_LOOP.md` §2.2 / phase B. Legacy: `training-skills.md`, `class-rank-promotion.md`.

## Contract
- `getSkillLearnList() -> SkillLearnView[]` (H5 helper: window rows), `skillLearnByClient(nextSid, position?) -> boolean`,
  `addTrainingSkill(sid) -> null`, skill books through `useItem(1, -1, bookItemId)` (item type 505). All un-quieted.
- Success pushes: `onUPP {expSkill, exp, money, moneyBind}` (books: no wallet), `onSkillUpdate(list)`, `onMWeaponSkillUpdate(list, true)`,
  stat-refresh `onUPP` for passives (type 11). Failures: `onSystemSay(msg)` (+ the skill lists for addTrainingSkill), reply false/null.
- `PlayerData.expSkill`, `PlayerData.cl`; `PlayerUpdate` gains `expSkill`, `cl`. Promotion pushes `onUPP {cl}` after the quest rewards.

## Files
- Shared `skillLearn.ts` (+test): `SkillUseEnv`, `SKILL_TABS`, `CLASS_RANK_NAMES`, `CLASS_NAMES`, `classRankText`, `SKILL_ERR`,
  `TRAINING_SKILL_ORDER`, `SkillLearnView`, `skillPool`, `levelFloor`, `canLearn`.
- Server `skill/skill-learn.rules.ts` (+test, pure), `skill-learn.view.ts` (rows), `skill-learn.service.ts` (spend + row change, pushes,
  `ownsFamilyAtLeast` for the hotbar), `skill.rpc.ts`, `skill.module.ts` (now imports StatsModule + Character model, exports SkillLearnService).
  `gamedata/skill-data.ts`: `useEnv`, `reqClass[]`, `reqCl`, `expSkill`, `price`; `buildSkillIndex` → `GameDataService.skillIndex()`.
  `stats/training-bonus.provider.ts` (registered in StatsModule, reads `character_skills`). `inventory/use-item.service.ts` type 505.
  `quest/class-rank.ts` (+test) wired in `quest.service.ts finishLocked` (gate before anything is spent, rank raised before save) and
  `quest.rpc.ts`. `Character.cl`. Tool `server/tools/backfill-class-rank.ts` (idempotent, from `quest_history`).
- Client `ui/skillPanel.ts`, `skillRow.ts`, `skillPanel.css` (owned by `MainHud`, key S / system-bar button); `SystemBar` now takes a
  key→action map. The class-rank toast is shown by SkillPanel's onUPP listener.

## Decisions
- expSkill pool = `exp − LEVEL_EXP[level−1]` (no new counter). Spending is one conditional `$inc` with `level` and `exp >= floor + cost`
  in the filter, so the level never drops; the price is taken whole from moneyBind if it covers it, else money.
- Damage base still reads `exp_skill` (user decision): upgraded rows have huge `exp_skill`, so upgraded skill damage must be checked
  in the browser before quieting (open risk 1).
- Books: validated first, consumed only when learnable, no exp/silver cost; message `Đã học kỹ năng từ <book>.` via mid note.
- Class rank uses the plan's final-quest id table (Go matched `a_script_text`; same quests).
- Exp pushes outside skill learning do not carry `expSkill`; the client derives it from `exp`/`level` (`skillPool`).

## Deferred
- Tabs Hôn nhân / Bang hội / T khí / KN sống, rebirth rows, awakened exSid variants, in-battle cast from the window.
- Not browser-verified (Mongo down in the session).
