# Rankings (M6 phase D)

Plan: `docs/plans/2026-11-04_07_GUILD_PK_RANKING.md` (phase D notes). Shared `ranking.ts`; server `modules/ranking/`; client `ui/rankingPanel.ts`
(the HUD "Xếp hạng" tray button).

- `rankGet(category)` → `{name, data: [{id, name, guild, value}]}`: top 100, cached 5 minutes per category (not cleared on change).
  An unknown category → `invalidArgs`.
- Lists:
  - `exp`: `name` is "exp"; `value` = level, ordered by level, then exp, then lower id.
  - `money`: `value` = moneyBind + money.
- Empty for now (`data: []`): `expBattle`, `pop`, `popMonth`, `popWeek`, `totalBp`, `lastWeekBp`, `achPoint` (M7 achievements) and `treasureHunt`.
- All non-deleted characters are ranked, test accounts included. Guild names are joined for the top 100.
- The panel opens on the exp tab. There are no `lastWeekBp`/`treasureHunt` tabs and no row menu.
