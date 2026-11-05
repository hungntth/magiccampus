// Unit tests for the current Go damage formula (M10 E2.-1): defence curve, proportional dodge (Go dodge_chance_test.go
// vectors), XPN, Miễn Giảm resist, Giảm ST Cuối, crit bases, element / level-gap / position modifiers, combo chain, heal, Miễn Tử.
// RNG order inside resolveHit: [dodge (melee only), defy, crit, variance].
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CombatStats } from './battle.types';
import {
  BASIC_ATTACK, comboChance, comboExtraHits, counterChance, critMultiplier, deathImmune, dodgeChance, elementModifier,
  healAmount, levelGapScale, positionModifier, resolveHit, rowOf, type HitActor,
} from './damage';

const base: CombatStats = {
  attack: 20, magicAttack: 0, defense: 0, magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 200, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0,
};
const actor = (o: Partial<HitActor> = {}): HitActor => ({ ...base, level: 5, ...o });
const fixed = (v: number) => (): number => v;
const seq = (...v: number[]) => {
  let i = 0;
  return (): number => v[i++] ?? 0.5;
};

describe('resolveHit', () => {
  it('basic attack: (20 + 10) × atk / (atk + def / 4) with a neutral spread', () => {
    const r = resolveHit(actor(), actor({ defense: 100 }), BASIC_ATTACK, false, fixed(0.5));
    assert.deepEqual([r.miss, r.crit], [false, false]);
    assert.equal(r.damage, Math.round(30 * (20 / (20 + 25))));
  });

  it('NPC attackers get + 2 % per level; characters do not', () => {
    assert.equal(resolveHit(actor({ kind: 'creature', level: 50 }), actor(), BASIC_ATTACK, false, fixed(0.5)).damage, 60);
    assert.equal(resolveHit(actor({ level: 50 }), actor(), BASIC_ATTACK, false, fixed(0.5)).damage, 30);
  });

  it('dodge is proportional (Go vectors) and only for melee', () => {
    assert.equal(dodgeChance(300, 300), 0.05);
    assert.ok(Math.abs(dodgeChance(2000, 1000) - (0.5 * 2) / 11) < 1e-12);
    assert.equal(dodgeChance(100000, 0), 0.5);
    assert.equal(dodgeChance(0, 100), 0);
    const d = actor({ dodge: 2000 });
    const a = actor({ hit: 1000 });
    assert.equal(resolveHit(a, d, BASIC_ATTACK, false, fixed(0.09)).miss, true);
    assert.equal(resolveHit(a, d, BASIC_ATTACK, false, fixed(0.1)).miss, false);
    assert.equal(resolveHit(a, d, { ...BASIC_ATTACK, ranged: true }, false, fixed(0)).miss, false);
  });

  it('XPN ignores defence and Miễn Giảm but not Giảm ST Cuối; Miễn Giảm 100 % resists without XPN', () => {
    const d = actor({ defense: 100, reduceHurt1: 50, praDef: 20 });
    const xpn = resolveHit(actor({ defy: 100 }), d, BASIC_ATTACK, false, fixed(0.5));
    assert.deepEqual([xpn.defy, xpn.damage], [true, 24]); // 30 × 0.8
    const plain = resolveHit(actor(), d, BASIC_ATTACK, false, fixed(0.5));
    assert.equal(plain.damage, Math.round(30 * (20 / 45) * 0.5 * 0.8));
    const wall = actor({ reduceHurt1: 100 });
    assert.deepEqual(resolveHit(actor(), wall, BASIC_ATTACK, false, fixed(0.5)), { miss: true, resisted: true, damage: 0, crit: false });
    assert.equal(resolveHit(actor({ defy: 100 }), wall, BASIC_ATTACK, false, fixed(0.5)).miss, false);
  });

  it('crit: × (200 | 250 Xạ Thủ + bonus) / 100, chance = (Bạo − Kháng bạo) / 100 uncapped below 100 %', () => {
    const crit = resolveHit(actor({ critical: 90 }), actor(), BASIC_ATTACK, false, seq(0.5, 0.5, 0.89, 0.5));
    assert.deepEqual([crit.crit, crit.damage], [true, 60]);
    assert.equal(resolveHit(actor({ critical: 90 }), actor({ resiCritical: 50 }), BASIC_ATTACK, false, seq(0.5, 0.5, 0.45)).crit, false);
    assert.equal(critMultiplier({ criticalDmg: 200, classId: 1 }), 2);
    assert.equal(critMultiplier({ criticalDmg: 200, classId: 4 }), 2.5);
    assert.equal(critMultiplier({ criticalDmg: 250, classId: 1 }), 2.5);
    assert.equal(critMultiplier({ criticalDmg: 30 }), 2.3); // pets carry the bonus only
  });

  it('defending halves (truncated); 1 damage floor before defend', () => {
    assert.equal(resolveHit(actor({ attack: 0 }), actor({ defense: 1e9 }), BASIC_ATTACK, false, fixed(0.5)).damage, 1);
    assert.equal(resolveHit(actor({ attack: 0 }), actor({ defense: 1e9 }), BASIC_ATTACK, true, fixed(0.5)).damage, 0);
  });

  it('main hits take the position modifier: Flash slots 10 / 0 are both "back" rows -> melee × 0.7', () => {
    const a = actor({ slot: 10, side: 'player' });
    const d = actor({ slot: 0, side: 'enemy' });
    assert.equal(rowOf(10, 'player'), 2);
    assert.equal(rowOf(0, 'enemy'), 2);
    assert.equal(rowOf(15, 'player'), 1);
    assert.equal(positionModifier(a, d, BASIC_ATTACK), 0.7);
    assert.equal(positionModifier(a, d, { ...BASIC_ATTACK, ranged: true }), 0.9);
    assert.equal(resolveHit(a, d, BASIC_ATTACK, false, fixed(0.5), { position: true }).damage, 21); // trunc(30 × 0.7)
    assert.equal(resolveHit(a, d, BASIC_ATTACK, false, fixed(0.5)).damage, 30);
  });
});

describe('modifiers', () => {
  it('element table (owner 2026-10-30)', () => {
    assert.equal(elementModifier(3, 4), 1.25);
    assert.equal(elementModifier(4, 3), 0.8);
    assert.equal(elementModifier(1, 2), 1.5);
    assert.equal(elementModifier(2, 1), 0.5);
    assert.equal(elementModifier(0, 3), 0.9);
    assert.equal(elementModifier(3, 0), 1.1);
    assert.equal(elementModifier(5, 5), 1);
  });

  it('10-level gap: player side vs enemy NPC only, more than 10 levels', () => {
    const npc = (level: number): HitActor => actor({ kind: 'creature', side: 'enemy', level });
    assert.equal(levelGapScale(actor({ side: 'player', level: 5 }), npc(15)), 1);
    assert.equal(levelGapScale(actor({ side: 'player', level: 5 }), npc(16)), 0.2);
    assert.equal(levelGapScale(actor({ side: 'player', kind: 'pet', level: 5 }), npc(16)), 0.2);
    assert.equal(levelGapScale(npc(50), actor({ side: 'player', level: 5 })), 1);
  });

  it('combo chain and caps', () => {
    assert.equal(comboExtraHits({ ...base, combo: 100 }, fixed(0.99)), 10);
    assert.equal(comboExtraHits({ ...base, combo: 50 }, seq(0.1, 0.2, 0.9)), 2);
    assert.equal(comboExtraHits(base, fixed(0)), 0);
    assert.equal(comboChance({ ...base, combo: 150 }), 1);
    assert.equal(counterChance({ ...base, counter: 100 }), 1);
  });

  it('heal: NPC level bonus only, 1.5 + bonus crit', () => {
    const p = actor({ level: 10, magicAttack: 100 });
    assert.equal(healAmount(p, { magic: true, mult: 1, base: 10 }, fixed(0.5)), 110);
    assert.equal(healAmount({ ...p, kind: 'creature' }, { magic: true, mult: 1, base: 10 }, fixed(0.5)), 121);
    assert.equal(healAmount({ ...p, critical: 100 }, { magic: true, mult: 1, base: 10 }, fixed(0.5)), 165);
  });

  it('Miễn Tử: once per battle, leaves 1 HP', () => {
    const d = { ...actor({ rebornRate: 100 }), hp: 50, deathImmuneUsed: false };
    assert.equal(deathImmune(actor(), d, 60, fixed(0.5)), 49);
    assert.equal(deathImmune(actor(), d, 60, fixed(0.5)), null);
    assert.equal(deathImmune(actor({ breakReborn: 100 }), { ...d, deathImmuneUsed: false }, 60, fixed(0)), null);
  });
});
