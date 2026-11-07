// Description parser cases ported from Go effect_desc_bag_test.go / effect_desc_bag_bundles_test.go (same fixture templates).
// The fake game data has no Mongo: the index is built from TemplateSummary rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DescBagIndex, type TemplateSummary } from './index';
import { parseDescBag } from './parse';
import { descBagNameKey, descBagTokens, isDescBagName } from './text';
import type { DescBagPlan } from './types';

const tpl = (id: number, name: string, type = 550, extra: Partial<TemplateSummary> = {}): TemplateSummary => ({
  id, name, type, color: 0, isTest: false, info: '', ...extra,
});

const ITEMS: TemplateSummary[] = [
  tpl(274, 'Nội Đơn Bách Luyện', 507), tpl(1036, 'Tiêu Diêu Phù'), tpl(731, 'Đông Huyền Lệnh Kỳ'), tpl(1330, 'Đông Huyền Lệnh Kỳ (Trắng)'),
  tpl(16, 'Kim Cương', 600), tpl(50, 'Mệnh Thạch', 503), tpl(51, 'Trí Thạch', 503), tpl(52, 'Lực Thạch', 503), tpl(53, 'Thần Thạch', 503),
  tpl(54, 'Xảo Thạch', 503), tpl(275, 'Tẩy Tủy Đan Sức Mạnh', 507), tpl(276, 'Tẩy Tủy Đan Nhanh Nhẹn', 507),
  tpl(1652, 'Tẩy Tủy Đan Sức Mạnh Cao Cấp', 507), tpl(1653, 'Tẩy Tủy Đan Nhanh Nhẹn Cao Cấp', 507),
  tpl(1654, 'Tẩy Tủy Đan Thể Chất Cao Cấp', 507), tpl(404, 'Nội Đơn Nhiên Thiêu', 507), tpl(2326, 'Đá May Mắn Cam'),
  tpl(3724, 'Chìa Khóa Thủy Tinh'), tpl(3690, 'Chìa Khóa Linh Vũ'), tpl(3761, 'Chìa Khóa Tẩy Luyện'),
  tpl(2339, 'Thời Trang Học Sinh (15 ngày)'), tpl(2048, 'Thời Trang Hoàng Gia'), tpl(1911, 'Cánh Chiến Thần Hoàng Kim'),
  tpl(3457, 'Túi Quà Độc Hưởng Cấp 80'), tpl(9001, 'Test Tiêu Diêu Phù', 550, { isTest: true }),
  // pattern fixture (bundles test)
  tpl(4857, 'Túi Quà EXP Mệnh Hồn Cao Cấp', 550, { info: 'Chứa 15000 exp Mệnh Hồn' }),
  tpl(653, 'Hoàng Kim Lễ (Lớn)', 550, { info: 'Cuộn giấy dùng để đổi lấy 500 kim phiếu' }),
  tpl(642, 'Hoàng Kim Lễ (Nhỏ)', 550, { info: 'Cuộn giấy dùng để đổi lấy 100 kim phiếu' }),
  tpl(1064, 'Hoàng Kim Lễ', 550, { info: 'Sách có giá 50 kim phiếu' }), tpl(2335, 'Tinh Hồn Linh Giáp', 513),
  tpl(3719, 'Túi Quà Mệnh Hồn Cao Cấp'), tpl(4988, 'Túi Quà Mệnh Hồn Cao Cấp.'),
];
const EQUIPS: TemplateSummary[] = [
  tpl(1633, 'Hỏa Phụng Hoàng (30 Ngày)', 1100, { color: 3 }), tpl(1627, 'Ngựa Một Sừng (30 Ngày)', 1100),
  tpl(1432, 'Thời Trang Học Sinh (15 ngày)', 1100),
];
const idx = DescBagIndex.build(ITEMS, EQUIPS);

function plan(name: string, desc: string, id = 9999): DescBagPlan {
  const res = parseDescBag(idx, id, name, desc);
  assert.ok(res.plan, `${name}: ${desc} -> ${res.reason}`);
  return res.plan;
}
const counts = (p: DescBagPlan): Record<number, number> => {
  const out: Record<number, number> = {};
  for (const e of p.entries) out[e.target.id] = (out[e.target.id] ?? 0) + e.count;
  return out;
};
const reason = (desc: string, name = 'Túi Quà Thử'): string => {
  const res = parseDescBag(idx, 9500, name, desc);
  assert.equal(res.plan, null, `${desc} should be rejected`);
  return res.reason;
};

test('tokenizer: escapes, full-width punctuation, letter/digit splits, decimals', () => {
  assert.deepEqual(descBagTokens('Chứa Sách x3 Exp*2，0.05 hệ số  phẩm\nchất (Trắng)！'), [
    'chứa', 'sách', 'x', '3', 'exp', '*', '2', ',', '0.05', 'hệ', 'số', 'phẩm', 'chất', '(', 'trắng', ')', '!',
  ]);
  assert.deepEqual(descBagTokens('a\\nb\\\\nc/nd\\"e'), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(descBagNameKey('Túi Quà Mệnh Hồn Cao Cấp.'), 'túi quà mệnh hồn cao cấp');
});

test('bag-like names', () => {
  assert.equal(isDescBagName('Túi Nội Đơn Bách Luyện'), true);
  assert.equal(isDescBagName('Chìa Khóa Bí Ẩn'), false);
  assert.equal(isDescBagName('Lì Xì May Mắn'), true);
});

test('1616: a counted fixed bag with a trailing explanation', () => {
  const p = plan('Túi Nội Đơn Bách Luyện', 'Bên trong chứa 10 viên Nội Đơn Bách Luyện, mỗi viên có thể tăng 0.05 hệ số    phẩm    chất\\n cho pet', 1616);
  assert.equal(p.mode, 'fixed');
  assert.deepEqual(counts(p), { 274: 10 });
});

test('1185: the longest name wins ("Đông Huyền Lệnh Kỳ (Trắng)" over "Đông Huyền Lệnh Kỳ")', () => {
  assert.deepEqual(counts(plan('Túi Tiêu Diêu Thưởng Kim', 'Chứa 10 Tiêu Diêu Phù và 5 Đông Huyền Lệnh Kỳ (Trắng)', 1185)), { 1036: 10, 1330: 5 });
});

test('1190 / 1195: "mỗi loại" gives uncounted entries the count to their left', () => {
  assert.deepEqual(counts(plan('Túi Bảo Thạch Trung Cấp (Vật Lý)', 'Chứa 10 Lực Thạch, Mệnh Thạch và Xảo Thạch mỗi loại', 1190)), { 52: 10, 50: 10, 54: 10 });
  assert.deepEqual(
    counts(plan('Túi Bảo Thạch Sơ Cấp (Ma Pháp)', 'Chứa 10 Thần Thạch, Trí Thạch, 5 Mệnh Thạch, Xảo Thạch mỗi loại', 1195)),
    { 53: 10, 51: 10, 50: 5, 54: 5 },
  );
});

test('1186-1188: "Kim Cương cấp N" levels stay unreadable', () => {
  for (const desc of [
    'Chứa 10 Kim Cương cấp 1 và Kim Cương cấp 2 mỗi loại',
    'Chứa 10 Kim Cương cấp 1, Kim Cương cấp 2 và Kim Cương cấp 3 mỗi loại',
    'Chứa 10 Kim Cương cấp 1, Kim Cương cấp 2, Kim Cương cấp 3 và Kim Cương cấp 4 mỗi loại',
  ]) assert.ok(reason(desc, 'Túi Đục Lỗ'));
});

test('a game currency with a balance in this port is a grantable target', () => {
  const p = plan('Túi Điểm Ấn Thạch (50)', 'Mở nhận 50 Điểm Ấn Thạch', 5239);
  assert.equal(p.entries[0].target.kind, 'game');
  assert.equal(p.entries[0].target.key, 'stoneSealPoint');
  assert.equal(p.entries[0].count, 50);
});

test('kim phiếu has no grant path: the bag stays unknown', () => {
  assert.match(reason('Nhấp đôi để nhận 300 kim phiếu và 1 Túi Quà Độc Hưởng Cấp 80', 'Túi Quà Độc Hưởng Cấp 50'), /unsupported currency/);
});

test('3368: a random category picks among the "Tẩy Tủy Đan ... Cao Cấp" variants', () => {
  const p = plan('Túi Quà Tẩy Tủy Đan Cao Cấp', 'Ngẫu nhiên nhận được 1 Tẩy Tủy Đan cao cấp', 3368);
  assert.equal(p.mode, 'random');
  assert.deepEqual(p.entries.map((e) => e.target.id).sort(), [1652, 1653, 1654]);
});

test('3588: a random list is one uniformly picked entry', () => {
  const p = plan('Túi Quà Nhất Kích', 'Túi quà nhận được sau khi giết hạ được Xà Thần Hydra trong 1 lần. Ngẫu nhiên nhận được Nội Đơn Nhiên Thiêu, Đá May Mắn Cam', 3588);
  assert.equal(p.mode, 'random');
  assert.deepEqual(p.entries.map((e) => e.target.id), [404, 2326]);
});

test('3837: a choice bag lists its options in order', () => {
  const p = plan('Túi Quà Chìa Khóa', 'Mở chọn nhận 1: Chìa Khóa Thủy Tinh, Chìa Khóa Linh Vũ, Chìa Khóa Tẩy Luyện', 3837);
  assert.equal(p.mode, 'choice');
  assert.deepEqual(p.entries.map((e) => [e.target.id, e.count]), [[3724, 1], [3690, 1], [3761, 1]]);
});

test('equipment keeps its template (colour from the row) and beats a same-name card', () => {
  const p = plan('Túi Quà Hỏa Phụng Hoàng (30 ngày)', 'Chứa 1 Hỏa Phụng Hoàng (30 Ngày)', 3380);
  assert.deepEqual([p.entries[0].target.kind, p.entries[0].target.id, p.entries[0].target.color], ['equip', 1633, 3]);
  assert.equal(plan('Túi Quà Học Sinh (15 Ngày)', 'Chứa 1 Thời Trang Học Sinh (15 Ngày)', 3687).entries[0].target.id, 1432);
});

test('rejected descriptions answer "unknown"', () => {
  const cases: [string, string][] = [
    ['Túi Quà Cánh Chiến Thần Hoàng Kim', 'Mở nhận 1 Chứng Nhận Cánh Chiến Thần Hoàng Kim'],
    ['Túi Quà Thời Trang Hoàng Gia (30 Ngày)', 'Mở nhận Thời Trang Hoàng Gia'],
    ['Túi Quà Tụ Linh Thạch【Có Phí】', 'Mở nhận 5 Bảo Rương Tụ Linh Thạch, gồm 500 Tụ Linh Thạch. Cần dùng 499 vàng để mở'],
    ['Túi Quà Mùa Xuân', 'Túi quà mùa xuân mà hệ thống tặng cho người chơi'],
    ['Túi Quà Kỷ Hợi', 'Ngẫu nhiên nhận Thời Trang Bích Hải Triều Sinh (30 Ngày), Lam Châu (30 Ngày) và may mắn nhận được 1 Tiêu Diêu Phù'],
    ['Bảo Rương Năng Nổ Trắng', 'Có thể nhận: Tiêu Diêu Phù, Lực Thạch'],
    ['Túi Quà Pháp Thuật Vô Biên', 'Mở nhận Lực Thạch*5, Mệnh Thạch*2, ngoài ra có cơ hội nhận Xảo Thạch'],
    ['Tinh Vũ Bao', 'Chứa 1 Lực Thạch, 10 Mệnh Thạch và Xảo Thạch'],
    ['Bảo Rương Bí Kíp', 'Mở nhận ngẫu nhiên 1 Tẩy Tủy Đan Sức Mạnh, Lam Châu, Cổ Tịch Vô Ưu'],
    ['Túi Quà Test', 'Chứa 10 Test Tiêu Diêu Phù và Tiêu Diêu Phù'],
  ];
  for (const [name, desc] of cases) assert.ok(reason(desc, name), desc);
});

test('"Name (qualifier)*N": dropped only when the number is on the template and no live variant exists', () => {
  assert.deepEqual(counts(plan('Túi Quà Lôi Điểu', 'Mở nhận: Túi Quà EXP Mệnh Hồn Cao Cấp (15000 điểm)*1,\n Đá May Mắn Cam*3', 4855)), { 4857: 1, 2326: 3 });
  for (const desc of [
    'Mở nhận: Túi Quà EXP Mệnh Hồn Cao Cấp (20000 điểm)*1',
    'Mở nhận: Hoàng Kim Lễ (50 kim phiếu)*1',
    'Mở nhận: Túi Quà EXP Mệnh Hồn Cao Cấp (15000 điểm)',
  ]) assert.ok(reason(desc), desc);
});

test('"Mở có thể nhận": a fixed list only when every entry has its own count; a trailing note is skipped', () => {
  const desc = 'Vật phẩm Tết Nguyên Đán, Mở có thể nhận: Tinh Hồn Linh Giáp*5, Hoàng Kim Lễ (Lớn)*1\n (Hoàng Kim Lễ cấp 50 trở lên mới sử dụng)';
  assert.deepEqual(counts(plan('Túi Quà Tết Đại Cát', desc, 6563)), { 2335: 5, 653: 1 });
  for (const bad of [
    'Mở có thể nhận: Tinh Hồn Linh Giáp, Lực Thạch',
    'Mở có thể nhận Tinh Hồn Linh Giáp*5',
    'Mở có thể nhận: Tinh Hồn Linh Giáp*5 (có cơ hội nhận thêm Lực Thạch)',
  ]) assert.ok(reason(bad), bad);
});

test('name aliases force the mapped template', () => {
  const desc = 'Mở nhận: Tinh Hồn Linh Giáp *6, Hoàng Kim Lễ Đại *2, Hoàng Kim Lễ Nhỏ *1, Túi Quà Mệnh Hồn Cao Cấp*2';
  assert.deepEqual(counts(plan('Gói Kỳ Nghỉ Sắc Màu', desc, 7007)), { 2335: 6, 653: 2, 642: 1, 3719: 2 });
});

test('untranslated Chinese text ends the list', () => {
  const p = plan('Túi Quà Đặc Quyền Tinh Hồn Linh Giáp Mới', 'Mở nhận 4 Tinh Hồn Linh Giáp\n购买该特权后, \n在私人订购活动的特权有效期内每日可领取一次。', 5041);
  assert.deepEqual(counts(p), { 2335: 4 });
});

test('description overrides replace the template text (6598 food bag: same four entries)', () => {
  const foods = DescBagIndex.build([
    tpl(4584, 'Bánh Trôi Thần Kỳ'), tpl(3439, 'Kem Ngọt Ngào'), tpl(3742, 'Tuổi Thơ Tươi Tắn'), tpl(3890, 'Truyền Thuyết Thất Tịch - Hoàn Chỉnh'),
  ], []);
  const res = parseDescBag(foods, 6598, 'Túi Quà Ngày Lễ Ẩm Thực', 'các loại thức ăn đặc biệt ngày lễ: ...');
  assert.ok(res.plan, res.reason);
  assert.deepEqual(res.plan.entries.map((e) => [e.target.id, e.count]), [[4584, 2], [3439, 2], [3742, 2], [3890, 2]]);
});

test('a "(30 Ngày)" bag must grant a 30-day item', () => {
  assert.match(reason('Chứa 1 Tiêu Diêu Phù', 'Túi Quà Tiêu Diêu (30 Ngày)'), /bag duration 30 ngày/);
});

test('no game data', () => {
  assert.equal(parseDescBag(null, 1, 'x', 'Chứa 1 Y').reason, 'no game data');
});
