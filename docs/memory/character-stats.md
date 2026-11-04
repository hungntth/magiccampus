# Character stats, equipment, item use, buffs (M1 character core)

Plan: `docs/plans/2026-11-04_02_CHARACTER_CORE.md` (see its Implementation notes). Implemented 2026-11-04.
Research: `docs/research/2026-11-04_01_CHARACTER_CORE_CLIENT_RESEARCH.md`, `..._02_CHARACTER_CORE_SERVER_RESEARCH.md`.
Bag operations are in `inventory.md`.

## Contract (shared `character.ts`, `inventory.ts`)
- `CharProperty` (final* keys, `lastPoint`, distributed `apt*`) is carried as `PlayerData.property` and in every stat-refresh `onUPP`
  `{level, exp, attrPoints, currentHp, currentMp, maxHp, maxMp, att*, property}`. `exp` stays cumulative (no `expSkill`).
- `LEVEL_EXP` (161 cumulative entries from Go `player_level_exp.go`), `AUTO_LEVEL_CAP 20`, `MAX_LEVEL 160`, `ATTR_POINTS_PER_LEVEL 5`.
- RPCs (none quiet yet):
  - `getCharAttributes` returns the stat payload and pushes it.
  - `getCharDetailData` returns the 26 legacy rate keys.
  - `changeProperty({addX: string})`.
  - `lvUp(level, pass)` returns a boolean. Allowed only when level ≥ 20; the password is ignored.
  - `equipOn(itemId)`, `equipOff(itemId, toSid|-1)`.
  - `useItem(1, -1, itemId)`; equipment goes through the equip path.
  - `fullHpRecoverByItem` / `fullMpRecoverByItem(1, -1, [{sid: itemId, priority}])`.
  - `delBuffClient(rowId)`, `gmAddBuff(buffId, seconds)` (dev, chat `/buff`).
- Pushes:
  - `onSystemMidMsgOrNote(msg)`: all gate and failure messages; the client shows a toast.
  - `onMoveItem(fromSid, toSid, id)` for equip moves.
  - `initLongBuff({rowId: LongBuff})` from `sceneLogin`, `upLongBuff`, `delBuff(rowId)`.

## Rules
- Formula: `modules/character/character-stats.ts`. Constants are from Go `profile.go`; `docs/memory/unified-stat-formula.md` in the legacy repo is stale.
  - Attribute = base `strength..energy` (class `att_*` + 1 per level) + distributed `apt*`.
  - Class `apt_*` per-mille comes from `data_tbl_class`.
  - Assembly: gear and buff attributes go through the formula, then other flats, then percents. Equipment prop 21 = Stamina; only 24/25 are percent.
    `bind_prop_num` is always added (legacy).
- `maxHp/maxMp` on the character doc are only a cache. `CharacterStatsService` (`modules/stats/`) recomputes them from the doc, the class,
  equipped templates and active buffs. Current HP/MP is clamped to the effective max on login and after gear or buff changes.
- Level-up: +5 points, +1 to each base attribute; HP/MP are not restored. Below 20 it is automatic (quest exp); from 20 on it needs `lvUp`.
- Equip: `slotType 1`, `slotIndex = position-1`, `sid = position` (1..22); positions above 22 (pet gear) are refused.
  - H5 enforces `req_level` and `req_class` on the server.
  - An occupant goes to the first free bag slot. Durability ≤ 0 blocks equipping.
- Potions are type 501 with hardcoded heal amounts per template id (`inventory/potion.ts`); `i1/i2` are not amounts. Food (502) heals `i1/i2`.
  - Spend first, then credit.
  - When already full, H5 shows "HP đã đầy!" and consumes nothing (legacy consumed it).
- Buffs live in `character_buffs` (unique per character + buffId). Expiry is lazy.
  - The client's 10 s timer sends `delBuffClient` for expired buffs.
  - Template `buff == 0` cannot be removed.
- Equip, use and bag ops are serialised per character by `inventory/char-lock.ts` (in process only).
- Existing characters were fixed by `pnpm --filter @mc/server fix:char-attributes` (idempotent).

## Client
- `game/CharacterController.ts` owns `player.property`; `ui/characterPanel.ts` + `.css` opens with C or the HUD button.
  - 22-slot grid; double-click unequips, drag to the bag unequips into that slot.
  - + / − buttons with an x10 step, OK sends `changeProperty`.
- `ui/hud/portrait.ts`: clicking the HP/MP bar sends recover with potions from the bag; it shows a level-up button from level 20.
- `ui/hud/buffBar.ts`: 16 px icons at 2,115, with tooltips; click to remove.
- Shared helpers: `ui/itemCell.ts` (slot render, tooltip, drag payload), `ui/confirmDialog.ts`, `net/throttle.ts` (legacy `RPC_DELAY`).
- Client gates check only the level and the equip position (`BagItem` has no `req_class`/`use_type`); the server enforces the rest.

## Deferred
- Avatar appearance for weapon, dress, wing and flyer (`onEquipOn`/`onWingOn` broadcast).
- Stars, gems, soul, suits, random properties, element `ee/en/ef`.
- `getFinalPraDef` / `finalPraMagDef`, `useMultiItem`.
- Pet targets and other item types.
- NPC healer.
- Secondary password.

Not verified in the browser:
- The `lvUp` flow, since the test character is Lv1.
- `initLongBuff` after relog with an active buff.
- The x10 step.

Quiet the new RPCs only after the user confirms.

## Stat providers (M7)
Bonuses now come from the `STAT_BONUS_PROVIDERS` registry (gear, buffs, guild skills, titles, stat features); BUFF_PROP 59/60 = finalPraDef/finalPraMagDef. See `progression.md`.
