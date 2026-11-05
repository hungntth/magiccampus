# Training + instance maps (M10 phase H)

Plan `docs/plans/2026-11-04_13_DUNGEONS.md` §2.6, notes "phases E, G, H". Legacy `hmtxl-training-room.md`,
`txkc-special-training.md`, `vo-danh-cave.md`, `secret-passage.md`.

- `modules/training/`: one `character_training` doc (hmtxl + tower + txkc, rev CAS + per-character lock; hand-written upserts need
  `rev: 1`). HMTXL room (getHMTXLSData, enterPubRoom, endHMTXLRoom, getHMTAward; no entry 03:00-08:00 UTC+7), Ảo Ma Tháp (NPCs 1135 map
  38 / 1136 map 515, menus `hmtw_*_<npc>`, own guardian line-up, ctx source `hmt`, weekly reset 999 gold resetHMTAlert →
  onResetHMTProgress), TXKC (getTXKCData + 7 RPCs; season = month, tasks read `character_daily`; awards in shared `txkc.ts`).
- `modules/instance-maps/`: Vô Danh Động (NPC 1172 map 55, book 2352 carried; 2200 on 577), Mật Đạo (books 128 / 2137 via
  `UseItemService.addUseHook`; encounters on 140104-6 at the player's level, exp × exp_multi × 2, elite life × 0.5).
- Client `ui/hmtxlPanel.ts`, `ui/txkcPanel.ts`, `game/TrainingController.ts`, strips 80 / 81. Not done: advanced room, TXKC shop
  (no credit shop), opening Bút Chì / Hoàn Trả (M11). All RPCs not quiet.
