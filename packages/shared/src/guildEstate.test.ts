// Guild phase B pure rules: bank deposit / move / spend planners, extension costs and caps, building cost + prerequisite checks,
// the level chain, skill develop / learn caps by guild level and contribution, effective skill levels.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BuildMode, BuildTid, GUILD_BANK, constructError, costShortfall, effectiveSkills, bankPageExtend, developError, guildLevelOf,
  guildSlotIndex, guildSlotSid, learnError, memberExtend, nextLevelRow, planBankDeposit, planBankMove, planBankSpend,
  skillChainKey, spendContribution, unmetPrereqs,
  type BankSlotRow, type BuildingRow, type GuildSkillRow, type OwnedBuilding,
} from './index.js';

const slot = (id: number, slotIndex: number, tid: number, count: number): BankSlotRow => ({ id, slotIndex, tid, count });

test('bank sids: 500 + index + 1', () => {
  assert.equal(guildSlotSid(0), 501);
  assert.equal(guildSlotIndex(530), 29);
  assert.equal(GUILD_BANK.PAGE_SIZE * GUILD_BANK.MAX_PAGES, 120);
});

test('deposit tops up the same template then opens free slots; refuses when the pages are full', () => {
  const slots = [slot(1, 0, 2026, 99990), slot(2, 1, 2027, 5)];
  const p = planBankDeposit(slots, 2026, 20, 1)!;
  assert.deepEqual(p.tops, [{ id: 1, add: 9 }]);
  assert.deepEqual(p.news, [{ slotIndex: 2, count: 11 }]);
  const full = Array.from({ length: 30 }, (_, i) => slot(i + 1, i, 5000 + i, 1));
  assert.equal(planBankDeposit(full, 2026, 1, 1), null);
  assert.notEqual(planBankDeposit(full, 2026, 1, 2), null);
  assert.equal(planBankDeposit([], 2026, 0, 1), null);
});

test('move: empty target moves, same template merges up to the cap, other template swaps', () => {
  const slots = [slot(1, 0, 2026, 10), slot(2, 1, 2026, 99995), slot(3, 2, 2027, 4)];
  assert.deepEqual(planBankMove(slots, 501, 510, 1), { kind: 'move', id: 1, toIndex: 9 });
  assert.deepEqual(planBankMove(slots, 501, 502, 1), { kind: 'merge', fromId: 1, toId: 2, fromLeft: 6, toCount: 99999 });
  assert.deepEqual(planBankMove(slots, 501, 503, 1), { kind: 'swap', aId: 1, bId: 3, aIndex: 0, bIndex: 2 });
  assert.equal(planBankMove(slots, 505, 506, 1), 'Ô kho trống');
  assert.equal(planBankMove(slots, 501, 540, 1), 'Ô kho không hợp lệ'); // page 2 not opened
  assert.notEqual(typeof planBankMove(slots, 501, 540, 2), 'string');
  assert.equal(planBankMove(slots, 501, 501, 1), 'Ô kho không đổi');
});

test('spend takes lowest slots first and fails atomically on a shortfall', () => {
  const slots = [slot(1, 0, 2026, 5), slot(2, 3, 2026, 10), slot(3, 1, 2039, 7)];
  assert.deepEqual(planBankSpend(slots, [{ tid: 2026, count: 12 }, { tid: 2039, count: 0 }]), [{ id: 1, take: 5 }, { id: 2, take: 7 }]);
  assert.equal(planBankSpend(slots, [{ tid: 2027, count: 1 }]), null);
  assert.equal(planBankSpend(slots, [{ tid: 2039, count: 8 }]), null);
});

test('extensions: member price per slot with a cap, bank pages priced up to 4', () => {
  assert.deepEqual(memberExtend({ money: 500_000, memLimit: 50, bagPages: 1 }), { cost: 500_000 });
  assert.deepEqual(memberExtend({ money: 499_999, memLimit: 50, bagPages: 1 }), { error: 'Tiền bang hội không đủ' });
  assert.deepEqual(memberExtend({ money: 1e9, memLimit: 200, bagPages: 1 }), { error: 'Số thành viên bang đã đạt tối đa' });
  assert.deepEqual(bankPageExtend({ money: 1e9, memLimit: 50, bagPages: 1 }), { cost: 500_000 });
  assert.deepEqual(bankPageExtend({ money: 1e9, memLimit: 50, bagPages: 3 }), { cost: 3_000_000 });
  assert.deepEqual(bankPageExtend({ money: 1e9, memLimit: 50, bagPages: 4 }), { error: 'Kho bang đã đạt tối đa' });
  assert.deepEqual(bankPageExtend({ money: 10, memLimit: 50, bagPages: 1 }), { error: 'Tiền bang hội không đủ' });
});

const row = (id: number, chain: string, level: number, pre: number[] = [], numLimit = 1, extra: Partial<BuildingRow> = {}): BuildingRow => ({
  id, chain, level, name: `${chain}-${level}`, description: '', type: 1, numLimit, moneyCost: 100, expCost: 50, genCost: 3, rareCost: 2, spCost: 1,
  pre, resCode: '0', iconCode: '0', funcScript: '', ...extra,
});
const rows = [
  row(2, 'BUILD100001', 1), row(3, 'BUILD100002', 1, [2], 2), row(5, 'BUILD100003', 1, [2]),
  row(6, 'BUILD100001', 2, [2, 3, 5]), row(8, 'BUILD100002', 2, [6, 3], 2), row(1, 'EXT_POINT', 0, [], -1, { type: 3 }),
];
const rowOf = (id: number): BuildingRow | undefined => rows.find((r) => r.id === id);
const own = (extendId: number, tid: number, buildState = 0): OwnedBuilding => ({ extendId, tid, buildState });

test('building cost shortfall names the first missing resource', () => {
  const cost = { money: 100, exp: 50, gen: 3, rare: 2, sp: 1 };
  assert.equal(costShortfall(cost, { ...cost }), null);
  assert.equal(costShortfall(cost, { ...cost, exp: 49 }), 'Thiếu Kinh nghiệm bang hội');
  assert.equal(costShortfall(cost, { ...cost, sp: 0 }), 'Thiếu Vật liệu bang hội đặc biệt');
});

test('prerequisites: same chain at the same or a higher level counts, an unfinished build does not', () => {
  const hallOnly = [own(10, 2)];
  assert.deepEqual(unmetPrereqs(rowOf(3)!, hallOnly, rowOf), []);
  assert.deepEqual(unmetPrereqs(rowOf(6)!, hallOnly, rowOf), [3, 5]);
  const inProgress = [own(10, 2), own(4, BuildTid.IN_BUILDING, 3)];
  assert.deepEqual(unmetPrereqs(rowOf(6)!, inProgress, rowOf), [3, 5]);
  const done = [own(10, 2), own(4, 8), own(5, 5)]; // house L2 satisfies the house L1 requirement
  assert.deepEqual(unmetPrereqs(rowOf(6)!, done, rowOf), []);
});

test('constructBuild gate: create / upgrade / limit / prerequisites', () => {
  const hall = [own(10, 2)];
  const check = (mode: number, lot: OwnedBuilding | undefined, target: number, owned: OwnedBuilding[]): string | null =>
    constructError({ mode, lot, target: rowOf(target), owned, rowOf });
  assert.equal(check(BuildMode.CREATE, undefined, 3, hall), null);
  assert.equal(check(BuildMode.CREATE, own(4, 3), 3, [...hall, own(4, 3)]), 'Vị trí này đã có công trình');
  assert.equal(check(BuildMode.CREATE, undefined, 6, hall), 'Công trình không hợp lệ'); // level 2 cannot be created
  assert.equal(check(BuildMode.CREATE, undefined, 5, [...hall, own(1, 5)]), 'Đã đạt số lượng công trình tối đa');
  assert.equal(check(BuildMode.CREATE, undefined, 8, hall), 'Công trình không hợp lệ');
  assert.equal(check(BuildMode.CREATE, undefined, 1, hall), 'Công trình không hợp lệ'); // the empty-lot placeholder
  const house = own(4, 3);
  assert.equal(check(BuildMode.UPGRADE, house, 8, [...hall, house]), 'Chưa đủ công trình tiên quyết'); // needs hall L2
  assert.equal(check(BuildMode.UPGRADE, house, 6, [...hall, house]), 'Không thể thăng cấp lên công trình này');
  assert.equal(check(BuildMode.UPGRADE, own(4, 3, 8), 8, [...hall, own(4, 3, 8)]), 'Công trình đang được xây dựng');
  assert.equal(check(BuildMode.UPGRADE, undefined, 8, hall), 'Vị trí này chưa có công trình');
  const upgraded = [own(10, 6), own(4, 3), own(5, 5)];
  assert.equal(check(BuildMode.UPGRADE, upgraded[1], 8, upgraded), null);
  assert.equal(check(3, house, 8, hall), 'Công trình không hợp lệ');
});

test('level chain: guild level is the hall level; the next row stops at the top', () => {
  assert.equal(guildLevelOf(rowOf(2)), 1);
  assert.equal(guildLevelOf(rowOf(6)), 2);
  assert.equal(guildLevelOf(rowOf(3)), 1); // not a hall
  assert.equal(guildLevelOf(undefined), 1);
  assert.equal(nextLevelRow(rows, 'BUILD100001', 1)?.id, 6);
  assert.equal(nextLevelRow(rows, 'BUILD100001', 2), undefined);
});

const skill = (id: number, level: number, extra: Partial<GuildSkillRow> = {}): GuildSkillRow => ({
  id, chain: 'SKILL700101', level, name: 'Cự Man Lực', description: '', iconCode: '0', devExp: 1000, devMoney: 500, contrib: 200, buffId: 1316,
  reqLevel: 1, reqClasses: [], ...extra,
});

test('develop: next level only, capped by guild level, paid in guild exp and money', () => {
  const base = { guildLevel: 2, developedLevel: 0, guildExp: 1000, guildMoney: 500 };
  assert.equal(developError({ ...base, row: skill(1, 1) }), null);
  assert.equal(developError({ ...base, row: skill(2, 2) }), 'Không thể mở kỹ năng mới');
  assert.equal(developError({ ...base, developedLevel: 2, row: skill(3, 3) }), 'Cấp bang hội chưa đủ');
  assert.equal(developError({ ...base, guildExp: 999, row: skill(1, 1) }), 'Kinh nghiệm bang hội không đủ');
  assert.equal(developError({ ...base, guildMoney: 499, row: skill(1, 1) }), 'Tiền bang hội không đủ');
  assert.equal(developError({ ...base, row: undefined }), 'Kỹ năng không tồn tại');
});

test('learn: capped by the developed level and guild level; costs contribution; class and level gates', () => {
  const base = { guildLevel: 3, developedLevel: 2, learnedLevel: 0, contribTotal: 200, charLevel: 10, classId: 2 };
  assert.equal(learnError({ ...base, row: skill(1, 1) }), null);
  assert.equal(learnError({ ...base, row: skill(2, 2) }), 'Không thể học kỹ năng này'); // skipping a level
  assert.equal(learnError({ ...base, learnedLevel: 2, row: skill(3, 3) }), 'Bang hội chưa mở cấp kỹ năng này');
  assert.equal(learnError({ ...base, developedLevel: 3, guildLevel: 2, learnedLevel: 2, row: skill(3, 3) }), 'Cấp bang hội chưa đủ');
  assert.equal(learnError({ ...base, contribTotal: 199, row: skill(1, 1) }), 'Điểm cống hiến không đủ');
  assert.equal(learnError({ ...base, row: skill(1, 1, { reqLevel: 11 }) }), 'Cấp độ nhân vật chưa đủ');
  assert.equal(learnError({ ...base, row: skill(1, 1, { reqClasses: [1, 3] }) }), 'Nghề nghiệp không phù hợp');
  assert.equal(learnError({ ...base, row: skill(1, 1, { reqClasses: [2] }) }), null);
});

test('contribution is paid from normal points first; chain key drops the NO suffix', () => {
  assert.deepEqual(spendContribution(50, 500, 200), { normal: 50, donate: 150 });
  assert.deepEqual(spendContribution(300, 0, 200), { normal: 200, donate: 0 });
  assert.equal(spendContribution(10, 10, 21), null);
  assert.equal(skillChainKey('SKILL700101NO'), 'SKILL700101');
  assert.equal(skillChainKey('SKILL700101'), 'SKILL700101');
});

test('effective skill levels never exceed what the guild developed', () => {
  const learned = [{ chain: 'A', sid: 1, level: 4 }, { chain: 'B', sid: 2, level: 2 }, { chain: 'C', sid: 3, level: 1 }];
  assert.deepEqual(effectiveSkills(learned, { A: 2, B: 5 }), [{ chain: 'A', level: 2 }, { chain: 'B', level: 2 }]);
  assert.deepEqual(effectiveSkills(learned, {}), []);
});
