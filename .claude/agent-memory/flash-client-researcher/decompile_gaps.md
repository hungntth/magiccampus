---
name: decompile-gaps
description: Classes missing/aborted in the decompiled Flash client and where the real data lives instead
metadata:
  type: reference
---

- `system/CallBack.as` is an empty stub (decompile aborted, trait limit): every `on*` push body is invisible. Derive
  payloads from consumers (`Battle.battleOnStart`, `BattleStage.startSequence`, `QuestManager.onAddChaQuest`, ...); push
  names only come from the Go notes in `D:\mcgame\docs\memory\*.md`. `CallBackGlobal.as` has only guild/shop/misc pushes.
- `AbstractGameRes` (`BH_*` behavior ids), `ResManager`, `BagPanel` are not decompiled. Behavior id numbers: get them from
  `BattleCreatureView.as:46-54` + Go `internal/domain/combat/battle.go` (`ActionTypeToBehavior`), and verify 0-7 by
  rendering `client/public/sheets/**.png` frames (label `dir-behavior` = `_cg.play(dir + "-" + behavior)`).
- Verified sheet behaviors: 3 attack, 4 DEAD (lying), 5 HURT, 6 DEFENCE, 7 magic (contradicts the older note in
  `docs/assets-pipeline.md` that says 4 HURT / 5 DEAD).
- Flex MXML descriptors (`_documentDescriptor_`) hold layout numbers (Localizer left/top/right/bottom, widths); `Language.as`
  arrays are indexed `CONST[n]` (n matters, some indexes are skipped).
