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
- **`gmGrant`**: chat `/grant <currency|item|equip|title> <id> <n> [bound]` (titles: n = seconds, 0 = permanent). Like `gmGoMap` (/go) and `gmAddBuff` (/buff) it is a
  `requireGm` RPC: see **GM gate** below.

## GM gate (2026-11-04)
- `@Rpc(..., { requireGm: true })` (`gateway/gm-gate.ts`, checked in `RpcRegistry.dispatch`): allowed only when the account has `gmLevel > 0`
  (`accounts.gmLevel`, default 0, copied to `session.gmLevel` at login) or the server runs with `DEV_COMMANDS=1` (`loadConfig().devCommands`).
  Refusal: FORBIDDEN "Lệnh chỉ dành cho GM". The boot log says which mode is active.
- Gated today: `gmGoMap`, `gmAddBuff`, `gmGrant`. New dev/GM RPCs must use `requireGm`.
- Make an account GM: `docker exec mcgame-mongo mongosh mcgame --quiet --eval "db.accounts.updateOne({username:'<name>'},{\$set:{gmLevel:1}})"` then relog.

## Titles (`modules/title/`, shared `progression.ts`)
- RPCs: `gtl()` → `{ct, cts}`; `setTitle(id|-1)` → `{f, t, bd?}`; `setActTitle(id|-1)` → `{f, t?}`.
- Owned titles are persisted, and timed grants hide once expired. `ct` lists every owned title, special titles included (Go).
- Buff: from `data_tbl_title.b` (Go read the NULL `buff_id`). It sits on long-buff row 0. Both active titles add stats, but only the normal title's buff shows in the bar.
- Pushes: `onTitleUpdate` / `onActTitleUpdate` broadcast to the map, `onAddTitle` / `onAddActTitle` on grants.
  `Entity.setTitles` draws `t` above the name and `actT` below.
- Client: the title panel (260×385, two tabs) opens from the "Danh hiệu" button on the character panel.
- Grant expiry (Go `grant_character_title`, `title-medal.ts nextTitleExpiry`): a re-grant adds its time to what is left, an expired row restarts, a permanent grant makes a timed title permanent, an owned permanent title is unchanged (no push).
- Title medals (type 550 "Huy Chương …", `title-medal.service.ts`, a `UseItemService` use hook): the title comes from the teacher-rank map (749-794 → titles 1-6), else from the single `data_tbl_item_award` type 33 row (353 medals), else from the description "tặng / phong / nhận danh hiệu X" (e.g. 795 Xuất Vân Chi Hồng). Duration: "(N Ngày)" in the name, then "duy trì N ngày", then `t` minutes (not for forever titles, k = 1); a 12-digit `t` is the medal's own ICT deadline. Spend first, then grant. H5: a medal for an owned permanent title is kept, not consumed for nothing.
  - Not ported: title upgrade chains (`title/chains.go`), the world announce on first acquisition, the "Tự chọn 1 trong những danh hiệu" choice bags (4961-4963), and the medals whose title is missing from `data_tbl_title` (1820-1829, 2357, 960: unusable in Go too).

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

## M13 E2 additions
`mhjingshi` (Tâm Tinh Thạch, Go 232) joins `CURRENCY_IDS`; `GrantKind` gains `medal`, `medalexp`, `heart` (`/grant medal <id> <n>`, `/grant medalexp <n>`, `/grant heart <id> <n>`, `progression/grant-growth.ts`).
Three providers in `stats/growth-providers.ts` (`MedalBonusProvider`, `StoneSealBonusProvider`, `MonsterHeartBonusProvider`) read the feature keys `medal`, `stone_seal`, `monster_heart`; see `medal.md`, `stone-seal.md`, `monster-heart.md`.

## M13 E1 currencies
`decoSilver` (Bí Ngân, Go id 216) joins `CURRENCY_IDS`; `runeExp` (217) is the rune level-up exp. `/grant currency decoSilver|runeExp <n>`, `/grant rune <id> <n>`, `/grant runechip <id> <n>` fill them (no income source until the Mật Bảo phase).

## M13 phase F
No new currency keys: `mysteryCrystal` (215), `npPnt` (236) and every furnace score key already existed. `/grant item <id> <n> [colour]` takes the instance colour (Mật Bảo materials need colour 2); `ActivityId.ASTROLOGIC` (28) and `MYSTERY_FURNACE` (51) joined `ACTIVITY_PORTED_IDS`. Gold spends use the unbound `gold` wallet (`CharacterService.spendMoney`), npPnt / Bí Ngân credits go through `CurrencyService`. See `mystery-treasure.md`, `astrology.md`.
