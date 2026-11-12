// Unit tests for the guarding fairy in battle (M13 G2) with the stock skill_elf rows: kit building (text stats, rage, procs, poison
// rule, MP burn), the rotation through resolveRound (cast at round 1, re-cast at round 6, buffAdd idle steps), procs, reflect, life
// steal, damage taken and the MP burn tick.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, BattleBehavior, type BattleStep } from '@mc/shared';
import type { SkillTemplate } from '../../gamedata/skill-data';
import type { Fighter, PlayerCommand } from '../battle.types';
import { resolveRound } from '../round';
import { PROP_LIFE_STEAL } from './battle-buffs';
import { buildFairyKit, fairySkillForRound, rageMods, type FairyLookups } from './fairy-battle-rules';
import type { Row } from './npc-skills';
import { board, mk, tpl } from './test-kit';

// Real rows (data_tbl_skill / data_tbl_buff), trimmed to the columns the battle reads.
const SKILLS: SkillTemplate[] = [
  tpl({ id: 6227, name: 'Tinh Linh Thánh Ca', type: 6, level: 1, codeName: 'skill_elf_1', targetType: 2, buffId: 2721, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6238, name: 'Tinh Linh Chế Tài', type: 6, level: 3, codeName: 'skill_elf_3', targetType: 2, buffId: 2734, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6247, name: 'Tinh Linh Đề Phúc', type: 6, level: 3, codeName: 'skill_elf_6', targetType: 2, buffId: 2743, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6249, name: 'Tinh Linh Chú Phọc', type: 6, level: 2, codeName: 'skill_elf_7', targetType: 2, buffId: 2745, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6253, name: 'Tinh Linh Độc Đao', type: 6, level: 3, codeName: 'skill_elf_8', targetType: 2, buffId: 2749, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6256, name: 'Tinh Linh Bí Diệm', type: 6, level: 3, codeName: 'skill_elf_9', targetType: 2, buffId: 2752, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6257, name: 'Tinh Linh Lĩnh Vực', type: 6, level: 1, codeName: 'skill_elf_10', targetType: 2, buffId: 2753, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6262, name: 'Tinh Linh Ảo Ảnh', type: 6, level: 3, codeName: 'skill_elf_11', targetType: 2, buffId: 2758, buffRate: 100, buffRound: 3 }),
  tpl({ id: 6265, name: 'Tinh Linh Cổ Vũ', type: 6, level: 3, codeName: 'skill_elf_12', targetType: 2, buffId: 2761, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6266, name: 'Tinh Linh Chi Nộ', type: 6, level: 1, codeName: 'skill_elf_13', targetType: 2, buffId: 2762, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6271, name: 'Tinh Linh Chi Diệp', type: 6, level: 3, codeName: 'skill_elf_14', targetType: 2, buffId: 2767, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6277, name: 'Tinh Linh Chi Ngụy', type: 6, level: 3, codeName: 'skill_elf_16', targetType: 2, buffId: 2773, buffRate: 100, buffRound: 2 }),
  tpl({ id: 6280, name: 'Độc Đao', type: 2, level: 3, codeName: 'skill_elf_8_b2s1', targetType: 4, buffId: 2776, buffRate: 90, buffRound: 2 }),
  tpl({ id: 6285, name: 'Thất Phòng', type: 6, level: 2, codeName: 'skill_elf_7_b2s1', targetType: 4, buffId: 2778, buffRate: 70, buffRound: 2 }),
  tpl({ id: 6289, name: 'Bí Diệm', type: 6, level: 3, codeName: 'skill_elf_9_b2s1', targetType: 4, buffId: 2782, buffRate: 30, buffRound: 2 }),
];
const b = (id: number, kind: number, percent: number, description: string, props: Record<string, number> = {}): Row => ({
  id, kind, state: -1, percent_flag: percent, icon_code: `41402001${id}`, description, ...props,
});
const BUFFS: Row[] = [
  b(2721, 2, 0, '10% lực tấn công chuyển thành HP'),
  b(2734, 3, 1, 'Tăng 13% tấn công vật lý', { prop1: 4, prop_num1: 13 }),
  b(2743, 3, 0, 'Tăng 12 kháng debuff, tăng 30% \nhiệu quả khi sử dụng đối với Danh Y'),
  b(2745, 23, 0, 'Khi tấn công, có 70% giảm 15% phòng ngự của mục tiêu'),
  b(2749, 23, 0, 'Khi tấn công, có 90% làm mục tiêu \ntrúng độc, mỗi lượt tăng 20% sát thương.'),
  b(2752, 23, 0, 'Khi tấn công, có 30% làm mục tiêu \nrơi vào trạng thái đốt cháy pháp lực, \nmỗi lượt giảm 13% MP'),
  b(2753, 3, 0, 'Tăng 5% debuff chính xác'),
  b(2758, 3, 1, 'Tăng 15% tốc độ', { prop1: 11, prop_num1: 15 }),
  b(2761, 3, 0, 'Giảm 20% HP, tăng 5% tấn công'),
  b(2762, 20, 0, 'Chuyển 5% sát thương phản đòn \nlại đối phương khi bị tấn công'),
  b(2767, 22, 1, 'Giảm 13% sát thương cuối khi bị tấn công'),
  b(2773, 2, 0, 'Khi tấn công mục tiêu, có tỉ lệ chuyển \n30% sát thương chuyển hóa thành HP'),
  b(2776, 6, -1, 'Mỗi lượt tăng 20% sát thương trúng độc vào mục tiêu'),
  b(2778, 3, 1, 'Giảm 15% phòng ngự', { prop1: 6, prop_num1: -15, prop2: 7, prop_num2: -15 }),
  b(2782, 5, -1, 'Mỗi lượt giảm 20% MP hiện tại của mục tiêu'),
];
const LK: FairyLookups = {
  skill: (id) => SKILLS.find((s) => s.id === id),
  buffRow: (id) => BUFFS.find((r) => r.id === id),
  family: (code) => SKILLS.filter((s) => s.codeName === code),
};
const kit = (...rotation: number[]) => buildFairyKit([...rotation, 0, 0, 0, 0, 0].slice(0, 5), LK)!;
const buffAdds = (groups: BattleStep[][], slot: number): number[] =>
  groups.flat().filter((s) => s.sid === slot && s.sSObj?.buffAdd).map((s) => s.sSObj!.buffAdd!.id);
const defend: PlayerCommand = { action: BattleAction.DEFENCE, targetSlot: -1 };
const attack = (t: number): PlayerCommand => ({ action: BattleAction.ATTACK, targetSlot: t });
// A sturdy dummy: never dies, deals small hits.
const dummy = (o: Partial<Fighter> = {}): Fighter => mk(0, 'enemy', { hp: 1e9, hpMax: 1e9, attack: 50, speed: 1, ...o });

describe('fairy kit (stock rows)', () => {
  it('rotation slot (round - 1) % 5; text stats; HOT; rage; empty slots and unknown ids dropped', () => {
    assert.deepEqual([1, 5, 6, 11].map((r) => fairySkillForRound([1, 2, 3, 4, 5], r)), [1, 5, 1, 1]);
    const k = kit(6227, 9999, 6247, 6265, 6257);
    assert.deepEqual(k.rotation, [6227, 0, 6247, 6265, 6257]);
    assert.deepEqual(k.casts.get(6227)!.buff.hot, { kind: 'attack', value: 10 });
    assert.deepEqual(k.casts.get(6247)!.buff.mods, [{ prop: 58, value: 12, percent: false }]);
    assert.deepEqual(k.casts.get(6257)!.buff.mods, [{ prop: 32, value: 5, percent: false }]);
    assert.deepEqual(k.casts.get(6265)!.rage, { stepPct: 20, attackPct: 5 });
    assert.deepEqual(rageMods({ stepPct: 20, attackPct: 5 }, 590, 1000), [{ prop: 4, value: 10, percent: true }, { prop: 5, value: 10, percent: true }]);
    assert.deepEqual(rageMods({ stepPct: 20, attackPct: 5 }, 1000, 1000), []);
    assert.equal(buildFairyKit([0, 0, 0, 0, 0], LK), null);
  });
  it('reflect / damage taken / life steal from the text; procs from <code_name>_b2s1 of the same level', () => {
    const k = kit(6266, 6271, 6277, 6249, 6253);
    assert.deepEqual(k.casts.get(6266)!.buff.mods, [{ prop: 903, value: 5, percent: false }]);
    assert.deepEqual(k.casts.get(6271)!.buff.mods, [{ prop: 901, value: -13, percent: false }]);
    assert.deepEqual(k.casts.get(6277)!.buff.mods, [{ prop: PROP_LIFE_STEAL, value: 30, percent: false }]);
    assert.equal(k.casts.get(6277)!.buff.hot, undefined);
    assert.deepEqual([...k.procs.keys()], [2745, 2749]);
    assert.deepEqual([k.procs.get(2745)!.skillId, k.procs.get(2745)!.rate], [6285, 0.7]); // Thất Phòng lv2
    assert.deepEqual(k.procs.get(2749)!.buff.dot, { kind: 'maxHp', value: 5 }); // Độc Đao lv3, type 2 row, owner rule 5 %
    assert.equal(kit(6256).procs.get(2752)!.buff.mpBurn, 20);
  });
});

describe('fairy rotation in battle', () => {
  it('casts slot 1 on the owner at round 1 before it acts, slots 2-5 on rounds 2-5, slot 1 again at round 6', () => {
    const p = mk(10, 'player', { speed: 1, attack: 100 }); // acts after the enemy: the cast still opens its own turn
    p.fairy = kit(6238, 6262, 0, 6247, 6257);
    const e = dummy({ speed: 50 });
    const fs = board(p, e);
    const seen: number[][] = [];
    for (let r = 1; r <= 6; r++) seen.push(buffAdds(resolveRound(fs, defend, r, () => 0.5).groups, 10));
    assert.deepEqual(seen, [[2734], [2758], [], [2743], [2753], [2734]]);
    const r1 = resolveRound(board(mk(10, 'player', { fairy: kit(6238) }), dummy()), defend, 1, () => 0.5).groups.flat();
    const at = r1.findIndex((s) => s.sSObj?.buffAdd);
    assert.deepEqual(r1[at], { sid: 10, tid: -1, bid: BattleBehavior.STAND, delay: 0, sSObj: { buffAdd: { id: 2734, round: 3, icon: '414020012734' } } });
    assert.ok(r1.findIndex((s) => s.sid === 10 && s.bid === BattleBehavior.STAND && !s.sSObj) > at); // the defend step comes after
  });
  it('Chế Tài raises attack 13 % for rounds 1-3 and is reverted at round 4; Thánh Ca heals 10 % of attack from round 2', () => {
    const p = mk(10, 'player', { attack: 1000, hp: 500, fairy: kit(6238) });
    const fs = board(p, dummy({ attack: 1 }));
    resolveRound(fs, defend, 1, () => 0.5);
    assert.equal(p.attack, 1130);
    resolveRound(fs, defend, 4, () => 0.5);
    assert.equal(p.attack, 1000);
    const h = mk(10, 'player', { attack: 1000, hp: 500, speed: 200, fairy: kit(6227) });
    const hb = board(h, dummy({ attack: 1 }));
    const g1 = resolveRound(hb, defend, 1, () => 0.5).groups.flat();
    assert.ok(!g1.some((s) => s.sSObj?.rHp !== undefined)); // no tick the round it lands
    const hp1 = h.hp;
    const g2 = resolveRound(hb, defend, 2, () => 0.5).groups.flat();
    assert.ok(g2.some((s) => s.sid === 10 && s.sSObj?.rHp === hp1 + 100));
  });
  it('procs roll on the first landed hit of the round only while the owner holds the fairy buff', () => {
    const p = mk(10, 'player', { attack: 100, speed: 200, combo: 0, fairy: kit(6249) });
    const e = dummy({ defense: 1000, magicDefense: 1000 });
    const out = resolveRound(board(p, e), attack(0), 1, () => 0.1).groups;
    assert.deepEqual(buffAdds(out, 0), [2778]);
    assert.equal(e.defense, 850);
    const q = mk(10, 'player', { attack: 100, speed: 200, fairy: kit(0, 6249) }); // the Chú Phọc slot casts at round 2 only
    assert.deepEqual(buffAdds(resolveRound(board(q, dummy()), attack(0), 1, () => 0.1).groups, 0), []);
  });
  it('Độc Đao poisons 5 % max HP per turn; Bí Diệm burns 20 % of current MP from the next round', () => {
    const p = mk(10, 'player', { speed: 200, fairy: kit(6253, 0, 0, 0, 0) });
    const e = mk(0, 'enemy', { hp: 100000, hpMax: 100000, attack: 1 });
    const fs = board(p, e);
    resolveRound(fs, attack(0), 1, () => 0.1);
    const before = e.hp;
    resolveRound(fs, defend, 2, () => 0.9);
    assert.equal(before - e.hp, 5000);
    const m = mk(10, 'player', { speed: 200, fairy: kit(6256) });
    const t = mk(0, 'enemy', { hp: 100000, hpMax: 100000, mp: 1000, mpMax: 1000, attack: 1 });
    const mb = board(m, t);
    resolveRound(mb, attack(0), 1, () => 0.1);
    assert.deepEqual([t.mp, t.buffs?.some((x) => x.id === 2782)], [1000, true]);
    const g = resolveRound(mb, defend, 2, () => 0.9).groups.flat();
    assert.equal(t.mp, 800);
    assert.ok(g.some((s) => s.sid === 0 && s.sSObj?.uMp === 800));
  });
  it('Chi Nộ reflects 5 % of the hit; Chi Diệp cuts damage taken 13 %; Chi Ngụy heals 30 % of the damage dealt', () => {
    const run = (fairyKit: ReturnType<typeof kit>, cmd: PlayerCommand, o: Partial<Fighter> = {}) => {
      const p = mk(10, 'player', { speed: 300, hp: 100000, hpMax: 100000, fairy: fairyKit, ...o }); // casts before the enemy hits
      const e = mk(0, 'enemy', { speed: 200, hp: 100000, hpMax: 100000, attack: 1000 });
      const groups = resolveRound(board(p, e), cmd, 1, () => 0.9).groups;
      return { p, e, groups };
    };
    const base = run(kit(6238), defend);
    const taken = 100000 - base.p.hp;
    const nộ = run(kit(6266), defend);
    assert.equal(100000 - nộ.e.hp, Math.trunc(taken * 0.05));
    assert.ok(nộ.groups.flat().some((s) => s.sid === 0 && s.bid === BattleBehavior.HURT && s.sSObj?.hHp === nộ.e.hp));
    const diệp = run(kit(6271), defend);
    assert.equal(100000 - diệp.p.hp, Math.max(1, Math.trunc((taken * 87) / 100)));
    const ngụy = run(kit(6277), attack(0), { hp: 50000, attack: 1000 });
    const dealt = 100000 - ngụy.e.hp;
    const hitStep = lifeStealHit(ngụy.groups);
    assert.equal(hitStep?.sSObj?.rHp, 50000 + Math.trunc(dealt * 0.3));
  });
});

function lifeStealHit(groups: BattleStep[][]): BattleStep | undefined {
  return groups.flat().find((s) => s.sid === 10 && s.bid === BattleBehavior.ATTACK && s.sSObj?.rHp !== undefined);
}
