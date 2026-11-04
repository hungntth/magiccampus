// Unit tests for resolveHit: dodge clamp, min damage, defend halving, crit and the combo / counter chances.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CombatStats } from './battle.types';
import { BASIC_ATTACK, comboChance, counterChance, healAmount, resolveHit, type HitActor } from './damage';

const base: CombatStats = {
  attack: 20, magicAttack: 0, defense: 0, magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 150, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0,
};
const actor = (o: Partial<HitActor> = {}): HitActor => ({ ...base, level: 5, ...o });
const fixed = (v: number) => (): number => v;

describe('resolveHit', () => {
  it('basic attack: (20 + 10) * 1.1 * 325/(325+100) with a neutral spread', () => {
    const r = resolveHit(actor(), actor({ defense: 100 }), BASIC_ATTACK, false, fixed(0.5));
    assert.equal(r.miss, false);
    assert.equal(r.crit, false);
    assert.equal(r.damage, Math.round(30 * 1.1 * (325 / 425)));
  });

  it('never deals less than 1 unless defending', () => {
    const r = resolveHit(actor({ attack: 0 }), actor({ defense: 100000 }), BASIC_ATTACK, false, fixed(0.5));
    assert.equal(r.damage, 1);
  });

  it('defending halves (truncated) and can reach 0 on a 1 damage hit', () => {
    const normal = resolveHit(actor(), actor({ defense: 50 }), BASIC_ATTACK, false, fixed(0.5)).damage;
    const half = resolveHit(actor(), actor({ defense: 50 }), BASIC_ATTACK, true, fixed(0.5)).damage;
    assert.equal(half, Math.trunc(normal / 2));
    assert.equal(resolveHit(actor({ attack: 0 }), actor({ defense: 100000 }), BASIC_ATTACK, true, fixed(0.5)).damage, 0);
  });

  it('dodge is (dodge - hit) / 100 clamped to 0..0.5', () => {
    const d = actor({ dodge: 900 }); // clamp 0.5
    assert.equal(resolveHit(actor(), d, BASIC_ATTACK, false, fixed(0.49)).miss, true);
    assert.equal(resolveHit(actor(), d, BASIC_ATTACK, false, fixed(0.5)).miss, false);
    // dodge below the attacker's hit never misses, even with rng 0
    assert.equal(resolveHit(actor(), actor({ dodge: 50 }), BASIC_ATTACK, false, fixed(0)).miss, false);
  });

  it('crit multiplies by 1.5 and is capped at a 50 % chance', () => {
    const seq = [0.1, 0.5]; // crit roll (< 0.5 cap), then the damage spread
    let i = 0;
    const rng = (): number => seq[i++] ?? 0.5;
    const crit = resolveHit(actor({ critical: 90 }), actor(), BASIC_ATTACK, false, rng);
    assert.equal(crit.crit, true);
    const plain = resolveHit(actor(), actor(), BASIC_ATTACK, false, fixed(0.5));
    assert.equal(crit.damage, Math.round(plain.damage * 1.5));
    assert.equal(resolveHit(actor({ critical: 90 }), actor(), BASIC_ATTACK, false, fixed(0.6)).crit, false);
  });

  it('combo / counter chances are capped at 25 % / 30 %', () => {
    assert.equal(comboChance({ ...base, combo: 100 }), 0.25);
    assert.equal(comboChance({ ...base, combo: 10 }), 0.1);
    assert.equal(counterChance({ ...base, counter: 100 }), 0.3);
    assert.equal(counterChance(base), 0);
  });
});

describe('healAmount', () => {
  const a = actor({ level: 10, magicAttack: 100 });
  it('trunc((base + magAtk * mult) * (1 + level * 0.01) * roll)', () => {
    assert.equal(healAmount(a, { magic: true, mult: 1, base: 10 }, () => 0.5), 121); // 110 * 1.1 * 1.0
    assert.equal(healAmount(a, { magic: true, mult: 1, base: 10 }, () => 0), 108); // 110 * 1.1 * 0.9 = 108.9
  });
});
