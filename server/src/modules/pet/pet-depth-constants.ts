// Assumed constants of the M12 pet depth rules that have no source in the Flash client or the seed data (kept verbatim from the
// Go port, plan 3.6): tune them here. Values that ARE in GamePredef / the seeds live in @mc/shared instead.

/** Khe Uoc: gold paid per missing Da Khe Uoc when autoBuy is on (Go petcontract.StoneGoldPrice). */
export const CONTRACT_STONE_GOLD_PRICE = 10;
/** Khe Uoc: chance (percent) of x2 / x3 exp per attempt (Go DoubleExpPercent / TripleExpPercent). */
export const CONTRACT_DOUBLE_EXP_PERCENT = 15;
export const CONTRACT_TRIPLE_EXP_PERCENT = 5;
/** Khe Uoc: base exp of one attempt (rule text "Moi lan tang nhan 20 diem exp"). */
export const CONTRACT_EXP_PER_ATTEMPT = 20;
/** Khe Uoc: attempts of contractPetTen. */
export const CONTRACT_TEN_ATTEMPTS = 10;
/** Class id of a Tho San (hunter): its contract bonus adds `extra_numN`. */
export const CONTRACT_HUNTER_CLASS = 5;

// --- PPVE floor scaling (Go application/combat/ppve_scaling.go, owner rule 2026-10-31); invented numbers, tune here ---
/** The enemy pool: creatures of qLevel 1..3 whose res_code starts with this prefix. */
export const PPVE_ENEMY_RES_PREFIX = '2060';
export const PPVE_ENEMY_COUNT = 5;
export const PPVE_BASE_LEVEL = 18;
/** Enemy level = BASE + floor, pulled toward (best pet level - SLACK) by at most MAX_ABOVE levels; cap 200. */
export const PPVE_PET_BAND_SLACK = 10;
export const PPVE_PET_BAND_MAX_ABOVE = 10;
export const PPVE_MAX_ENEMY_LEVEL = 200;
export const PPVE_HP_PER_FLOOR = 0.01;
export const PPVE_ATK_PER_FLOOR = 0.01;
export const PPVE_DEF_PER_FLOOR = 0.004;
/** Team anchors: an enemy hit deals >= (SHARE_BASE + SHARE_PER_FLOOR * floor) of the team's average max HP, and an enemy survives >= (HITS_BASE + floor / 20) basic hits. */
export const PPVE_HIT_SHARE_BASE = 0.015;
export const PPVE_HIT_SHARE_PER_FLOOR = 0.0003;
export const PPVE_HITS_TO_KILL_BASE = 3;
export const PPVE_HITS_TO_KILL_PER_FLOOR = 1 / 20;
export const PPVE_LEADER_HP_MULT = 1.5;
export const PPVE_LEADER_ATK_MULT = 1.2;
/** Minions: 0.5 + 0.004 * floor, capped at 1.0 (reached at floor 125). */
export const PPVE_MINION_MULT_BASE = 0.5;
export const PPVE_MINION_MULT_PER_FLOOR = 0.004;
export const PPVE_MINION_MULT_CAP = 1;
/** Seed multiplier of the floor line-up (a floor always shows the same creatures). */
export const PPVE_FLOOR_SEED = 7919;

// --- Pet arena (Go domain/petarena limits.go / points.go / arena.go; Flash PET_ARENA_U) ---
/** Daily challenge turns (user decision: the Go 20, not the Flash "10 co hoi" text); addPetFightNum buys up to the cap. */
export const ARENA_DAILY_FIGHTS = 20;
export const ARENA_MAX_DAILY_FIGHTS = 30;
/** Cooldown a challenge starts (the panel caps its countdown at 600 s). */
export const ARENA_COOLDOWN_MS = 10 * 60 * 1000;
/** addPetFightNum costs (max - BASE_MAX) * STEP gold; clearArenaCD costs ceil(seconds left / SECONDS_PER_GOLD) gold. */
export const ARENA_ADD_FIGHT_BASE_MAX = 19;
export const ARENA_ADD_FIGHT_GOLD_STEP = 5;
export const ARENA_CLEAR_CD_SECONDS_PER_GOLD = 30;
/** Weekly rank award: rank <= MAX_RANK pays round(coef[group] * 1.02^(MAX_RANK - rank)) points (AI_CONF_PANEL_U[16..19] tooltips). */
export const ARENA_RANK_AWARD_MAX_RANK = 200;
export const ARENA_RANK_AWARD_COEF: readonly number[] = [40, 60, 80, 100, 120, 140];
/** Points paid to the attacker by level group (A..F); a loss pays half rounded down (owner rule 2026-11-02 in Go). */
export const ARENA_WIN_POINTS: readonly number[] = [6, 12, 16, 20, 24, 28];
/** Elo: start rating, K factor, the attacker's rating gain floor on a win and its flat gain on a loss. */
export const ARENA_BASE_RATING = 1000;
export const ARENA_ELO_K = 32;
export const ARENA_WIN_RATING_MIN = 10;
export const ARENA_LOSS_RATING = 5;
/** Rows of the enemy list and the rank panel; entries read for one ladder; fight-log lines kept per character. */
export const ARENA_LIST_LIMIT = 50;
export const ARENA_LADDER_LIMIT = 2000;
export const ARENA_LOG_KEEP = 20;
/** A win into rank 1..TOP_RANK is announced; a weekly win streak report every STREAK_STEP wins; one-day climbs announced at these steps. */
export const ARENA_TOP_ANNOUNCE_RANK = 3;
export const ARENA_STREAK_STEP = 5;
export const ARENA_CLIMB_STEPS: readonly number[] = [200, 100];
