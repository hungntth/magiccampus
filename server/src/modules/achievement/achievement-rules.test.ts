// Achievement rules: threshold parsing, classification, progress (absolute vs incremental), completion + points, claim gate,
// reward text -> title / items, snapshot keying and backfill-style absolute evaluation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequirement, parseReward, parseThreshold, resolveTarget, type RequireRow } from './achievement-parse';
import {
  applyEvent, buildCatalog, buildIndex, claimGate, emptyState, foldResult, snapshotOf, type AchieveRow,
} from './achievement-rules';

const row = (id: number, description: string, extra: Partial<AchieveRow> = {}): AchieveRow => ({
  id, name: `A${id}`, description, detail: '', desc: '', award: 10, color: 1, kind: 1, type: 101, position: id, enable: 1, isAward: 0, ...extra,
});
const req = (id: number, aid: number, type: number, num = 0, name = ''): RequireRow => ({ id, aid, type, num, name, showType: 0 });
const noCreatures = (): readonly number[] => [];

test('parseThreshold: plain numbers, multipliers, none', () => {
  assert.equal(parseThreshold('Cấp độ người chơi đạt cấp 10'), 10);
  assert.equal(parseThreshold('Điểm cống hiến trong bang đạt 1 triệu'), 1_000_000);
  assert.equal(parseThreshold('Điểm cống hiến trong bang đạt 10 triệu'), 10_000_000);
  assert.equal(parseThreshold('Lượng ngân phiếu đạt 888888888'), 888_888_888);
  assert.equal(parseThreshold('Đánh bại Tà Thần'), null);
});

test('resolveTarget prefers num, falls back to the description', () => {
  assert.equal(resolveTarget(30, 'Có 30 loại pet'), 30);
  assert.equal(resolveTarget(0, 'đạt cấp 140'), 140);
  assert.equal(resolveTarget(0, 'không có số'), null);
});

test('classification by type + description', () => {
  const c = (r: RequireRow, d: string) => classifyRequirement(r, d, (n) => (n === 'Tà Thần' ? [144] : []));
  assert.deepEqual(c(req(1, 1001, 4), 'Cấp độ người chơi đạt cấp 10'), { spec: { reqId: 1, aid: 1001, kind: 'level', mode: 'abs', target: 10 } });
  assert.ok('spec' in c(req(2, 1017, 4), 'Lượng ngân phiếu nhân vật sở hữu đạt 8888'));
  assert.deepEqual(c(req(3, 1022, 4), 'Trên cấp 60 nhưng tất cả tiền đều là 0'), { reason: 'type4-unmapped' });
  assert.deepEqual(c(req(4, 2001, 2, 30, 'Số lượng pet'), 'Có 30 loại pet khác nhau'), { spec: { reqId: 4, aid: 2001, kind: 'petsOwned', mode: 'abs', target: 30 } });
  assert.deepEqual(c(req(5, 2010, 2), 'Có 1 pet cam'), { reason: 'type2-pet-quality-or-race' });
  assert.deepEqual(c(req(6, 5042, 1, 50), 'Hoàn thành 50 nhiệm vụ'), { spec: { reqId: 6, aid: 5042, kind: 'questsFinished', mode: 'inc', target: 50 } });
  assert.deepEqual(c(req(7, 5001, 0), 'Đánh bại Tà Thần'), { spec: { reqId: 7, aid: 5001, kind: 'creatureKill', mode: 'inc', target: 1, creatureIds: [144] } });
  assert.deepEqual(c(req(8, 6170, 0), 'Tiêu diệt Mehdi trong Kiếp Nạn Vô Ưu'), { reason: 'type0-unmapped' });
  assert.deepEqual(c(req(9, 6154, 0), 'Tiêu diệt Mehdi'), { reason: 'type0-creature-not-found' });
  assert.deepEqual(c(req(10, 3005, 21), 'Gia nhập thành công 1 bang hội'), { spec: { reqId: 10, aid: 3005, kind: 'guildJoined', mode: 'abs', target: 1 } });
  assert.deepEqual(c(req(11, 3006, 21), 'Điểm cống hiến trong bang đạt 100000'), { reason: 'type21-guild-contribution' });
  assert.deepEqual(c(req(389, 6064, 38, 3, 'Số lần tham gia'), 'Tham gia 3 lần thi Trả Lời Câu Hỏi'), { spec: { reqId: 389, aid: 6064, kind: 'quizJoined', mode: 'inc', target: 3 } });
  assert.deepEqual(c(req(390, 6065, 38), 'Đạt hạng nhất thi Trả Lời Câu Hỏi'), { spec: { reqId: 390, aid: 6065, kind: 'quizFirst', mode: 'inc', target: 1 } });
  assert.deepEqual(c(req(391, 6066, 38, 10, 'Số lần đạt hạng nhất'), 'Đạt 10 lần hạng nhất thi Trả Lời Câu Hỏi'), { spec: { reqId: 391, aid: 6066, kind: 'quizFirst', mode: 'inc', target: 10 } });
  assert.deepEqual(c(req(12, 9, 99), 'x'), { reason: 'unmapped-type-99' });
});

const index = () => buildIndex(
  [row(1001, 'Cấp độ người chơi đạt cấp 10'), row(1002, 'Cấp độ người chơi đạt cấp 50', { award: 20 }), row(5042, 'Hoàn thành 3 nhiệm vụ'),
    row(5001, 'Đánh bại Tà Thần'), row(9, 'x', { enable: -1 }), row(8, 'multi'), row(7, 'nothing')],
  [req(1, 1001, 4), req(2, 1002, 4), req(3, 5042, 1, 3), req(4, 5001, 0), req(5, 9, 4), req(6, 8, 4), req(7, 8, 4)],
  (n) => (n === 'Tà Thần' ? [144, 145] : []),
);

test('index: tracked vs unsupported with reasons; disabled ones are ignored', () => {
  const idx = index();
  assert.deepEqual([...idx.tracked.keys()].sort(), [1001, 1002, 5001, 5042]);
  assert.equal(idx.unsupported.get(8), 'multi-requirement');
  assert.equal(idx.unsupported.get(7), 'no-requirements');
  assert.equal(idx.unsupported.has(9), false);
  assert.deepEqual(idx.byCreature.get(145)?.map((s) => s.aid), [5001]);
});

test('absolute: one level event completes every reached threshold; progress is capped and never drops', () => {
  const idx = index();
  const res = applyEvent(idx, emptyState(), 'level', { value: 60 }, 5_000_000);
  assert.deepEqual(res.completed.map((c) => c.aid).sort(), [1001, 1002]);
  assert.equal(res.achPoint, 30);
  const state = foldResult(emptyState(), res);
  assert.equal(state.achieveReqLog['1']?.progress, 10);
  assert.ok(state.achieveReqLog['2']?.done > 0);
  // finished achievements do not move again, and a lower value never reduces anything
  assert.deepEqual(applyEvent(idx, state, 'level', { value: 70 }, 6_000_000).reqs, []);
  const partial = applyEvent(idx, emptyState(), 'level', { value: 5 }, 5_000_000);
  assert.deepEqual(partial.reqs.map((r) => [r.reqId, r.progress, r.done]), [[1, 5, 0], [2, 5, 0]]);
  const after = foldResult(emptyState(), partial);
  assert.equal(applyEvent(idx, after, 'level', { value: 3 }, 5_000_001).reqs.length, 0);
});

test('incremental: amounts accumulate to the target, completion sets achieveLog and points once', () => {
  const idx = index();
  let state = emptyState();
  for (let i = 0; i < 2; i += 1) {
    const r = applyEvent(idx, state, 'questsFinished', { amount: 1 }, 5_000_000 + i);
    assert.equal(r.completed.length, 0);
    state = foldResult(state, r);
  }
  assert.equal(state.achieveReqLog['3'].progress, 2);
  const last = applyEvent(idx, state, 'questsFinished', {}, 5_100_000);
  assert.deepEqual(last.completed, [{ aid: 5042, at: 5_100_000, points: 10 }]);
  state = foldResult(state, last);
  assert.equal(state.achPoint, 10);
  assert.equal(applyEvent(idx, state, 'questsFinished', {}, 5_200_000).reqs.length, 0);
});

test('creature kills: any listed template counts, repeats count, others do not', () => {
  const idx = index();
  assert.equal(applyEvent(idx, emptyState(), 'creatureKill', { creatureIds: [1, 2, 3] }, 5_000_000).reqs.length, 0);
  const r = applyEvent(idx, emptyState(), 'creatureKill', { creatureIds: [145, 7, 144] }, 5_000_000);
  assert.deepEqual(r.completed.map((c) => c.aid), [5001]);
  assert.equal(r.reqs[0].progress, 1); // capped at the target
});

test('claim gate: needs a reward, a finished achievement and no earlier claim', () => {
  const idx = index();
  const done = foldResult(emptyState(), applyEvent(idx, emptyState(), 'level', { value: 10 }, 5_000_000));
  assert.equal(claimGate(undefined, done, 1001), 'no-reward');
  assert.equal(claimGate({ isAward: 0 }, done, 1001), 'no-reward');
  assert.equal(claimGate({ isAward: 1 }, emptyState(), 1001), 'not-done');
  assert.equal(claimGate({ isAward: 1 }, done, 1001), 'ok');
  assert.equal(claimGate({ isAward: 2 }, { ...done, takeLog: { '1001': 1 } }, 1001), 'claimed');
});

test('reward text: title by desc name, item lists, "nhận N X", Ấn Chương', () => {
  assert.deepEqual(parseReward('Phần thưởng Danh Hiệu Phú Hào'), { titleName: 'Phú Hào', items: [] });
  assert.deepEqual(parseReward('Nhận danh hiệu: Rèn Luyện - Dũng Sĩ\r'), { titleName: 'Rèn Luyện - Dũng Sĩ', items: [] });
  assert.deepEqual(parseReward('Phần thưởng Danh hiệu Địa Chủ'), { titleName: 'Địa Chủ', items: [] });
  assert.deepEqual(parseReward('Nhận vật phẩm: Huy Chương Quân Đoàn*1 , Chìa Khóa Thủy Tinh*1\r'), {
    titleName: null, items: [{ name: 'Huy Chương Quân Đoàn', qty: 1 }, { name: 'Chìa Khóa Thủy Tinh', qty: 1 }],
  });
  assert.deepEqual(parseReward('Sau khi đạt thành tựu nhận 2 Tinh Hồn Chi Thực'), { titleName: null, items: [{ name: 'Tinh Hồn Chi Thực', qty: 2 }] });
  assert.deepEqual(parseReward('Nhận: 1 Đông Huyền Lệnh Kỳ (Cam)'), { titleName: null, items: [{ name: 'Đông Huyền Lệnh Kỳ (Cam)', qty: 1 }] });
  assert.deepEqual(parseReward('Phần thưởng Ấn Chương Kinh Nhận'), { titleName: null, items: [{ name: 'Ấn Chương Kinh Nhận', qty: 1 }] });
  // the seed dump holds a literal backslash + r at the end of some rows
  assert.deepEqual(parseReward('Nhận vật phẩm: Huy Chương Công Trạng*3\\r'), { titleName: null, items: [{ name: 'Huy Chương Công Trạng', qty: 3 }] });
  assert.deepEqual(parseReward('Nhận danh hiệu: Rèn Luyện - Dũng Sĩ\r'), { titleName: 'Rèn Luyện - Dũng Sĩ', items: [] });
  assert.deepEqual(parseReward(''), { titleName: null, items: [] });
});

test('snapshot is keyed by requirement id; catalog carries resolved targets and the tracked flag', () => {
  const idx = index();
  const state = foldResult(emptyState(), applyEvent(idx, emptyState(), 'level', { value: 12 }, 5_000_000));
  const snap = snapshotOf(state);
  assert.deepEqual(Object.keys(snap.achieveReqLog).sort(), ['1', '2']); // requirement ids, not achievement ids
  assert.equal(snap.achPnt, 10);
  const cat = buildCatalog(idx);
  const lv10 = cat.entries.find((e) => e.id === 1001)!;
  assert.equal(lv10.tracked, true);
  assert.equal(lv10.reqs[0].num, 10);
  assert.equal(cat.entries.find((e) => e.id === 8)?.tracked, false);
  assert.equal(cat.entries.some((e) => e.id === 9), false); // disabled rows are not listed
});

test('backfill: absolute values of an existing character grant credit at once', () => {
  const idx = index();
  let state = emptyState();
  state = foldResult(state, applyEvent(idx, state, 'level', { value: 55 }, 5_000_000));
  assert.deepEqual(Object.keys(state.achieveLog).sort(), ['1001', '1002']);
  assert.equal(state.achPoint, 30);
});

test('classify: type 57 formations map to heiyaoshi figures by requirement order, the astrology decoder stays unsupported', () => {
  const row = (id: number): RequireRow => ({ id, aid: 6000 + id, type: 57, num: 0, name: 'Hỏa Trận', showType: 0 });
  const first = classifyRequirement(row(699), '', () => []);
  assert.ok('spec' in first);
  assert.deepEqual([first.spec.kind, first.spec.mode, first.spec.target], ['heiyaoshiFigures', 'abs', 1]);
  const tenth = classifyRequirement(row(708), '', () => []);
  assert.ok('spec' in tenth);
  assert.equal(tenth.spec.target, 10);
  assert.deepEqual(classifyRequirement(row(709), '', () => []), { reason: 'type57-astrology' });
});
