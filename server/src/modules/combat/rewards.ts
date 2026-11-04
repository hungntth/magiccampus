// Battle rewards (legacy damage.go CalculateExpReward / CalculateMoneyReward; Go constructions we adopt).
// Pure: the service credits the result. Loot (phase B) will be rolled next to these from the same dead-enemy list.

export interface DeadEnemy {
  level: number;
  expBase: number; // map-row exp override (> 0), else level * 10
}

/** Exp multiplier by level difference: stronger enemies pay up to x1.5, weaker ones down to x0.1. */
export function expModifier(enemyLevel: number, playerLevel: number): number {
  const diff = enemyLevel - playerLevel;
  if (diff > 0) return Math.min(1.5, 1 + 0.05 * diff);
  if (diff < 0) return Math.max(0.1, 1 + 0.1 * diff);
  return 1;
}

/** Sum over dead enemies of trunc(base * modifier). */
export function expReward(playerLevel: number, dead: readonly DeadEnemy[]): number {
  let total = 0;
  for (const e of dead) {
    const base = e.expBase > 0 ? e.expBase : e.level * 10;
    total += Math.trunc(base * expModifier(e.level, playerLevel));
  }
  return total;
}

/** Bạc khóa (moneyBind): level * 5 per dead enemy. */
export function moneyReward(dead: readonly DeadEnemy[]): number {
  return dead.reduce((sum, e) => sum + e.level * 5, 0);
}
