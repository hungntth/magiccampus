# PK (M6 phase C)

Plan: `docs/plans/2026-11-04_07_GUILD_PK_RANKING.md` (phase C notes). Shared `pk.ts`; server `modules/pk/`, `combat/pvp.service.ts`, `combat/pvp-rules.ts`;
client `game/PkController.ts`.

- `uif("apvp", bool, false)` persists only `apvp`, which is sent at login. The minimap PK button reflects it (selected = PK closed).
  The system-bar PK button or the A key arms the PK click mode.
- `PVPStartClient(targetCid)` gates, first failure wins:
  1. target offline;
  2. either side in battle;
  3. other map;
  4. dead;
  5. party follower or same party;
  6. distance > 150 px (H5; Go used 20);
  7. map `safe_flag`;
  8. target in a safe area (`data_tbl_map.s_area`, only map 2000 has real rectangles);
  9. target `apvp` off, unless the map has `pk > 0` (forced PvP; an entry toast is shown).
- Battle (`BattleManager`):
  - Attacker at slot 10 (pet 15); the target at 0 (pet 5) on the `enemy` side, and its client gets `guest: true`.
  - `BattleUnit` draws at `viewSlot(slot, guest)`, so each player sees themselves at the bottom.
  - 25 s rounds; `round.ts` and `missingCommands` are side-agnostic; no `onCmdReady` in PvP.
- Settle:
  - No exp, money, loot or pet drain; HP/MP persisted; everyone ends with ≥ 1 HP (no revive). Fleeing or disconnecting **loses**.
  - The 30-round cap is a draw.
  - The target's result is mirrored, unverified against Flash.
- Not ported: honor, wanted rewards and penalties, PvP rooms, cross-server, the `pkInvite` family (no client caller).
