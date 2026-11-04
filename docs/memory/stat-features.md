# Stat-feature panels (M7 phases C and D): train soul, awakening, war sprite, magic crystal, heiyaoshi, zodiac stars

Plan: `docs/plans/2026-11-04_08_PROGRESSION.md` (phases C and D notes). Server `modules/feature/`; one provider each in `stats/feature-providers.ts`;
client `ui/feature/*`, `game/FeatureController.ts`, `game/FeatureStarController.ts`. The "Tu luyện" window opens from the character panel header (C key).
State is kept in `character_features`; costs use `currencies` (see `progression.md`).

- **Train soul** (`trainSoul`, `getTrainSoulInfo`):
  - `require_num` is the exp needed inside one level; the bar resets on level-up.
  - At most 10 000 mysteryCrystal per call; Lv 50 is required.
- **Awakening** (`addAwakenPoint`, `reduceAwakenPoint`, `ensureBuyAwaken`, `getAwakenInfo`):
  - Stats are the **sum of rows 1..L** (Go used only row L).
  - Go-invented and kept: pity +1 % per miss; auto-buy at 10 gold per missing item (it charges and grants nothing).
  - Silver is paid by the selected money type. Talent points are validated (Go) but have no stat effect.
- **War sprite** (`getSpWarData`, `getWSPBuffList`, `addWarSprite(Gold)`, `addBattleSprite(Gold)`, push `updateWSPPanel`):
  - Scaling follows the client display: 13/14/31/61 ÷ 10000, 59/60/62/63 ÷ 100. Props 5/7 count as magic attack and defence.
- **Magic crystal** (`initMagicCrystalData`, `MagicCrystalActive`, `MagicCrystalAddPower`, `MagicCrystalRecovery`, `MagicCrystalUp`):
  - The 16-pool catalog lives in shared, checked against Go `catalog.go`. Pools 14/15 (types 32/58) have no H5 stat key.
  - `onInitMagicCrystalData` is pushed after every mutation. No Sunday wipe.
- **Heiyaoshi** (`initHeiyaoshiPanelData`, `lightHeiyaoshiPoint`, `activateHeiyaoshiPoint`, `resetHeiyaoshi`):
  - `typeNum` 2 = unbound gold on the current figure, else stones. When stones are short and the point has a gold price, the server pushes `goldBuyHeiyaoshi`.
  - Stage-2 multipliers are Go-invented, kept, and apply to stage-2 triangle values only.
  - Figures 11–20 use their own `full_buff` rows (Go scaled the stage-1 rows instead).
  - The tab is a list (the data has no point coordinates). Reset applies to the own board only.
- **Zodiac stars** (`beginStarLvUp(nextTplId)`, `finishStarLvUp`, `cancelStarLvUp`, `speedUpStarLvUp` → `{d, n}`, `addStarAddition`, `pmStarExchage`, H5 `getStarsData` with the server clock):
  - 12×12 levels; begin needs Lv 80 and unbound gold.
  - Timers are stored as end timestamps, so they survive a restart. Speed-up is refused when the timer is idle or already due.
  - Stat = `add_value × addition`. The exchange swaps star shards only; it has no UI yet.
  - Shards come from `/grant item 3316..3327`.
- **Not done**: the soul pet bonus, awakening talent effects, the activity-bar entries.
- **Deferred systems**: astrology, star instance, monster heart, mystery treasure, soul gem, stone seal, PRS, fairy, prabuff, medals.
