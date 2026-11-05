// World boss pure rules (Go domain/worldboss rules.go): cheer table (the client constants), the attack multiplier, the damage booked
// by a battle against the shared pool, per-battle and settlement rewards, the battle Life cap. Numbers live in wb-config.ts / shared WB_CHEER.

import { WB_CHEER, WbCheerType } from '@mc/shared';
import { WB } from './wb-config';

/** Success rate (%) of a cheer purchase at the current level; gold always succeeds, past the max level nothing is bought. */
export function cheerRate(type: number, level: number): number {
  if (level < 0 || level >= WB_CHEER.MAX_LEVEL) return 0;
  return type === WbCheerType.GOLD ? 100 : WB_CHEER.SILVER_RATE[level];
}

export function cheerCost(type: number): number {
  return type === WbCheerType.GOLD ? WB_CHEER.GOLD : WB_CHEER.SILVER;
}

/** 1 + 0.2 x level (level clamped to 0..5). */
export function attackMultiplier(level: number): number {
  const l = Math.max(0, Math.min(WB_CHEER.MAX_LEVEL, Math.trunc(level)));
  return 1 + (l * WB.CHEER_STEP_PCT) / 100;
}

/** The Life of the battle Hydra: the remaining pool, never above the int32-safe cap. */
export function battleBossHp(pool: number): number {
  return Math.max(1, Math.min(pool, WB.BATTLE_HP_CAP));
}

/** Damage a battle books: the Hydra's lost Life clamped to what is left in the pool. */
export function bookedDamage(hpMax: number, hp: number, pool: number): number {
  if (pool <= 0) return 0;
  return Math.min(Math.max(0, hpMax - Math.max(0, hp)), pool);
}

/** Exp and bound silver of one finished battle. */
export function battleReward(level: number, damage: number): { exp: number; money: number } {
  const lv = Math.max(1, level);
  const exp = Math.min(lv * WB.BATTLE_EXP_PER_LEVEL + Math.floor(damage / WB.BATTLE_EXP_DIVISOR), lv * WB.BATTLE_EXP_CAP_PER_LEVEL);
  return { exp, money: Math.min(Math.floor(damage / WB.BATTLE_MONEY_DIVISOR), WB.BATTLE_MONEY_CAP) };
}

/** Chiến tích: a flat amount for every battle that dealt damage (no farming by an instant flee). */
export function battleHonor(damage: number): number {
  return damage > 0 ? WB.BATTLE_HONOR : 0;
}

/** End-of-event bonus by damage share. */
export function settlementBonus(level: number, damage: number, totalDamage: number): { exp: number; money: number } {
  if (damage <= 0 || totalDamage <= 0) return { exp: 0, money: 0 };
  const share = Math.min(1, damage / totalDamage);
  return { exp: Math.floor(share * Math.max(1, level) * WB.SETTLE_EXP_PER_LEVEL), money: Math.floor(share * WB.SETTLE_MONEY_POOL) };
}

/** Level of the battle Hydra: the player's level, at least 50. */
export function bossLevel(playerLevel: number): number {
  return Math.max(playerLevel, WB.MIN_LEVEL);
}
