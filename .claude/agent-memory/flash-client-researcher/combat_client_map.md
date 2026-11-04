---
name: combat-client-map
description: Feature -> file cluster for battle/combat in the legacy client, plus non-obvious facts (star report, cbom throttle)
metadata:
  type: reference
---

Cluster: `logic/Battle.as` (cmd queue, start/end), `view/view/compBattle/{BattleStage,PlayerCmdCanvas,TimeCountCanvas,
SkillCanvas}.as`, `view/view/compGameStage/BattleCreatureView.as` (+ `CreatureView.as`), `view/view/comp/StarBattleReport.as`,
`SkillManager.as`, `TipSkill.as`. Full findings: `docs/research/2026-11-04_03_COMBAT_CLIENT_RESEARCH.md`.

Non-obvious: (1) end action `{end,type,result==1}` opens the STAR-instance report, not a generic PvE reward window;
(2) `cbom` is throttled client-side (1000 ms, 24 deny max) and `lastCheckPoint` only resets at battle start;
(3) hHp/rHp are NEW hp values, popup = old - new; (4) `BattleCreatureView.leftSide == true` means ENEMY;
(5) `Battle.currentRound` is the command index inside a batch, not the battle round; (6) kill quest `questKill[].num`
is REMAINING kills.
