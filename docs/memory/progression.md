# Progression foundation (M7): stat providers, currencies, feature store, gmGrant, titles, achievements

Plan: `docs/plans/2026-11-04_08_PROGRESSION.md` (phases A and B; see the implementation notes). Implemented 2026-11-04.
Research: `docs/research/2026-11-04_13_PROGRESSION_CLIENT_RESEARCH.md`, `..._14_PROGRESSION_SERVER_RESEARCH.md`.
The stat-feature panels are in `stat-features.md`; the magic weapon is in `magic-weapon.md`.

## Foundation
- **Stat providers**: `stats/stat-provider.ts` defines the `STAT_BONUS_PROVIDERS` token, a factory array in `StatsModule`.
  - Gear, buffs and guild skills live in `core-providers.ts`, and each later system adds its own provider (titles, features).
  - A parity test pins the old single-pass result.
- **Assembly**: fractional flats are summed as floats and truncated once (with an epsilon) before percents.
- **BUFF_PROP**: 59/60 now map to `finalPraDef` / `finalPraMagDef` (Go dictionary). Go ids 32 and 58 have no H5 key and stay unmapped.
  The research's rate normalisation (`0 < v < 1` → `v*100`) was **not** applied.
- **Currencies**: `Character.currencies` with a capped credit and a conditional-`$inc` spend. Sent at login (`PlayerData.currencies`); `CharProperty.spirituality` is set from it.
- **Feature store**: the `character_features` collection and `FeatureStoreService`, keyed by (characterId, featureKey).
- **`gmGrant`**: chat `/grant <currency|item|equip|title> <id> <n> [bound]`.
  - **It is open to every player (dev only, like `/go` and `/buff`), so gate the GM commands before any public use.**
  - For titles, n = seconds (0 = permanent).

## Titles (`modules/title/`, shared `progression.ts`)
- RPCs: `gtl()` → `{ct, cts}`; `setTitle(id|-1)` → `{f, t, bd?}`; `setActTitle(id|-1)` → `{f, t?}`.
- Owned titles are persisted, and timed grants hide once expired. `ct` lists every owned title, special titles included (Go).
- Buff: from `data_tbl_title.b` (Go read the NULL `buff_id`). It sits on long-buff row 0. Both active titles add stats, but only the normal title's buff shows in the bar.
- Pushes: `onTitleUpdate` / `onActTitleUpdate` broadcast to the map, `onAddTitle` / `onAddActTitle` on grants.
  `Entity.setTitles` draws `t` above the name and `actT` below.
- Client: the title panel (260×385, two tabs) opens from the "Danh hiệu" button on the character panel.

## Achievements (`modules/achievement/`, shared `achievement.ts`)
- Tracking: `AchievementEvents.record(...)` hooks in quest, combat, pet, title, guild, social and lvUp; a failing hook only logs.
  - 42 of 566 enabled achievements are supported: level, silver, gold, quests, boss kills by creature name, pets owned / caught, titles, login days, guild, friends, heiyaoshi figures (type 57).
  - The rest show "Chưa hỗ trợ", either because they have several requirements with NULL names or because there is no H5 source.
- Login snapshot: `achPnt`, `achieveLog` (ms timestamp when finished), `achieveReqLog` keyed by **requirement id**, `takeAchieveAwardLog`.
  Absolute requirements (level, money, pets, titles, guild, friends) are backfilled.
- `getAchieveAward(aid)` grants the title (for `is_award=2`, the name comes from `desc`) and the items, matched by name. Many medal and fashion rewards have no template; a claim with nothing resolvable is refused.
- Push names come from Go (hidden in Flash): `onUpdateAchieve(type, id, obj)`, `updateAchieveAwardLog`, `onAchieveTitle`.
  `getAchieveList` is an H5 catalog RPC. `rankGet('achPoint')` is live.
- Client: the achievement panel opens from the HUD button or R.
