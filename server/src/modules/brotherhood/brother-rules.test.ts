// Unit tests for the Kết bái rules and the in-memory ceremonies: team presence, swear / join / disband planning, fee and silver
// split, leave plan, answer flow (one NO cancels, 60 s expiry, run once).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BROTHER, BrotherKind, RelationType } from '@mc/shared';
import { BrotherCeremonies, type Ceremony } from './brother-ceremony';
import {
  TEXT, checkTeamOnMap, planDisband, planLeave, planSwear, silverSplit, type PairRow, type SwearInput, type TeamMember,
} from './brother-rules';

const member = (id: number, over: Partial<TeamMember> = {}): TeamMember => ({ id, name: `P${id}`, level: 30, groupId: null, ...over });
const friends = (...pairs: [number, number][]): PairRow[] => pairs.flatMap(([a, b]) => [{ a, b, type: RelationType.FRIEND }, { a: b, b: a, type: RelationType.FRIEND }]);
const input = (team: TeamMember[], rows: PairRow[], over: Partial<SwearInput> = {}): SwearInput => ({
  leaderId: team[0]!.id, team, groups: new Map(), rows, leaderSilver: 100_000_000, ...over,
});

describe('checkTeamOnMap', () => {
  const here = [{ id: 1, name: 'A', mapId: 10 }, { id: 2, name: 'B', mapId: 10 }];
  it('needs a party led by the caller with everyone online on the leader map', () => {
    assert.deepEqual(checkTeamOnMap(1, 1, here, 10), { ok: true, ids: [1, 2] });
    assert.deepEqual(checkTeamOnMap(1, null, [], 10), { ok: false, text: TEXT.noTeam });
    assert.deepEqual(checkTeamOnMap(2, 1, here, 10), { ok: false, text: TEXT.notLeader });
    assert.deepEqual(checkTeamOnMap(1, 1, [here[0]!, { id: 2, name: 'B', mapId: null }], 10), { ok: false, text: TEXT.offline('B') });
    assert.deepEqual(checkTeamOnMap(1, 1, [here[0]!, { id: 2, name: 'B', mapId: 11 }], 10), { ok: false, text: TEXT.farAway('B') });
  });
});

describe('planSwear', () => {
  it('plans a new group for 2-5 friends and charges every member', () => {
    const r = planSwear(input([member(1), member(2), member(3)], friends([1, 2], [1, 3], [2, 3])));
    assert.ok(r.ok);
    assert.equal(r.kind, BrotherKind.SWEAR);
    assert.equal(r.fee, 3 * BROTHER.feePerMember);
    assert.equal(r.newcomers.length, 3);
  });
  it('refuses a bad team size, low level and missing leader', () => {
    assert.deepEqual(planSwear(input([member(1)], [])), { ok: false, text: TEXT.size });
    const six = [1, 2, 3, 4, 5, 6].map((i) => member(i));
    assert.deepEqual(planSwear(input(six, [])), { ok: false, text: TEXT.size });
    assert.deepEqual(planSwear(input([member(1), member(2, { level: 24 })], friends([1, 2]))), { ok: false, text: TEXT.level('P2') });
    assert.deepEqual(planSwear(input([member(1), member(2)], friends([1, 2]), { leaderId: 9 })), { ok: false, text: TEXT.size });
  });
  it('needs a friend row between every pair (one direction is enough)', () => {
    const r = planSwear(input([member(1), member(2), member(3)], [{ a: 1, b: 2, type: 1 }, { a: 1, b: 3, type: 1 }]));
    assert.deepEqual(r, { ok: false, text: TEXT.notFriends('P2', 'P3') });
    assert.ok(planSwear(input([member(1), member(2)], [{ a: 2, b: 1, type: RelationType.FRIEND }])).ok);
  });
  it('refuses enemy, black, tutor and couple rows', () => {
    const base = friends([1, 2]);
    assert.deepEqual(planSwear(input([member(1), member(2)], [...base, { a: 1, b: 2, type: RelationType.ENEMY }])), { ok: false, text: TEXT.hostile('P1', 'P2') });
    assert.deepEqual(planSwear(input([member(1), member(2)], [...base, { a: 2, b: 1, type: RelationType.BLACK }])), { ok: false, text: TEXT.hostile('P2', 'P1') });
    assert.deepEqual(planSwear(input([member(1), member(2)], [{ a: 1, b: 2, type: RelationType.TUTOR }])), { ok: false, text: TEXT.tutor('P1', 'P2') });
    assert.deepEqual(planSwear(input([member(1), member(2)], [{ a: 1, b: 2, type: RelationType.COUPLE }])), { ok: false, text: TEXT.couple('P1', 'P2') });
  });
  it('checks the fee against moneyBind + money', () => {
    const team = [member(1), member(2)];
    const r = planSwear(input(team, friends([1, 2]), { leaderSilver: 3_999_999 }));
    assert.deepEqual(r, { ok: false, text: TEXT.fee(4_000_000, 2) });
    assert.ok(planSwear(input(team, friends([1, 2]), { leaderSilver: 4_000_000 })).ok);
  });
  it('adds newcomers to the one existing group when every brother is present', () => {
    const team = [member(1, { groupId: 7 }), member(2, { groupId: 7 }), member(3)];
    const groups = new Map([[7, [1, 2]]]);
    const rows = [...friends([1, 3], [2, 3]), { a: 1, b: 2, type: RelationType.BROTHER }, { a: 2, b: 1, type: RelationType.BROTHER }];
    const r = planSwear(input(team, rows, { groups }));
    assert.ok(r.ok);
    assert.equal(r.kind, BrotherKind.JOIN);
    assert.equal(r.groupId, 7);
    assert.equal(r.fee, BROTHER.feePerMember);
    assert.deepEqual(r.newcomers.map((p) => p.id), [3]);
  });
  it('refuses a join with a missing brother, two groups, or nobody new', () => {
    const groups = new Map([[7, [1, 2, 9]], [8, [3, 4]]]);
    const team = [member(1, { groupId: 7 }), member(2, { groupId: 7 }), member(5)];
    assert.deepEqual(planSwear(input(team, friends([1, 5], [2, 5]), { groups })), { ok: false, text: TEXT.joinNeedsAll });
    const mixed = [member(1, { groupId: 7 }), member(3, { groupId: 8 })];
    assert.deepEqual(planSwear(input(mixed, [], { groups })), { ok: false, text: TEXT.mixedGroups });
    const same = [member(1, { groupId: 7 }), member(2, { groupId: 7 })];
    assert.deepEqual(planSwear(input(same, [], { groups: new Map([[7, [1, 2]]]) })), { ok: false, text: TEXT.already });
  });
});

describe('planDisband / silverSplit / planLeave', () => {
  const group = { id: 4, members: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] };
  it('needs a group and every member in the team', () => {
    assert.deepEqual(planDisband(null, [1, 2]), { ok: false, text: TEXT.notMember });
    assert.deepEqual(planDisband(group, [1, 3]), { ok: false, text: TEXT.disbandNeedsAll });
    const r = planDisband(group, [1, 2, 3]);
    assert.ok(r.ok);
    assert.deepEqual(r.participants.map((p) => p.id), [1, 2]);
  });
  it('spends moneyBind first', () => {
    assert.deepEqual(silverSplit(5_000_000, 1_000_000, 4_000_000), { bind: 4_000_000, money: 0 });
    assert.deepEqual(silverSplit(1_000_000, 9_000_000, 4_000_000), { bind: 1_000_000, money: 3_000_000 });
    assert.equal(silverSplit(1, 1, 4_000_000), null);
  });
  it('dissolves below two members and revokes everybody then', () => {
    assert.deepEqual(planLeave([1, 2], 2), { dissolved: true, revokeIds: [1, 2] });
    assert.deepEqual(planLeave([1, 2, 3], 3), { dissolved: false, revokeIds: [3] });
  });
});

describe('BrotherCeremonies', () => {
  const ceremony = (kind: Ceremony['kind'] = BrotherKind.SWEAR): Ceremony => ({
    kind, leaderId: 1, leaderName: 'A', groupId: 0, fee: 4_000_000, expires: 0, agreed: new Set(),
    participants: [1, 2, 3].map((id) => ({ id, name: `P${id}`, existing: false })),
  });

  it('runs once after every answer and treats the leader as agreed', () => {
    const b = new BrotherCeremonies();
    assert.ok(b.register(ceremony(), 0, true));
    assert.equal(b.answer(2, BrotherKind.SWEAR, true, 1000).state, 'waiting');
    assert.equal(b.answer(3, BrotherKind.SWEAR, true, 2000).state, 'ready');
    assert.equal(b.answer(3, BrotherKind.SWEAR, true, 2500).state, 'expired');
    assert.equal(b.liveCount, 0);
  });
  it('one NO cancels for everybody', () => {
    const b = new BrotherCeremonies();
    b.register(ceremony(), 0, true);
    const r = b.answer(2, BrotherKind.SWEAR, false, 10);
    assert.equal(r.state, 'refused');
    assert.equal(b.answer(3, BrotherKind.SWEAR, true, 20).state, 'expired');
  });
  it('rejects a wrong kind and a late answer', () => {
    const b = new BrotherCeremonies();
    b.register(ceremony(), 0, true);
    assert.equal(b.answer(2, BrotherKind.JOIN, true, 10).state, 'expired');
    assert.equal(b.answer(2, BrotherKind.SWEAR, true, BROTHER.answerMs + 1).state, 'expired');
    assert.equal(b.liveCount, 0);
  });
  it('refuses a second live ceremony for a participant but allows it after expiry', () => {
    const b = new BrotherCeremonies();
    assert.ok(b.register(ceremony(), 0, true));
    assert.equal(b.register({ ...ceremony(), leaderId: 2 }, 5, true), false);
    assert.ok(b.register({ ...ceremony(), leaderId: 2 }, BROTHER.answerMs + 1, true));
  });
  it('keeps the leader draft for 60 s and consumes it once', () => {
    const b = new BrotherCeremonies();
    b.putDraft(ceremony(), 0);
    assert.ok(b.takeDraft(1, 59_000));
    assert.equal(b.takeDraft(1, 59_500), null);
    b.putDraft(ceremony(), 0);
    assert.equal(b.takeDraft(1, BROTHER.answerMs + 1), null);
  });
  it('dropFor removes the draft and the live ceremony and returns the cancelled one', () => {
    const b = new BrotherCeremonies();
    b.putDraft(ceremony(), 0);
    b.register(ceremony(), 0, true);
    const c = b.dropFor(1);
    assert.ok(c);
    assert.equal(b.draftCount, 0);
    assert.equal(b.liveCount, 0);
    assert.equal(b.dropFor(2), null);
  });
  it('a disband needs the leader to answer too', () => {
    const b = new BrotherCeremonies();
    const c = { ...ceremony(BrotherKind.DISBAND), participants: [1, 2].map((id) => ({ id, name: `P${id}`, existing: true })) };
    b.register(c, 0, false);
    assert.equal(b.answer(2, BrotherKind.DISBAND, true, 1).state, 'waiting');
    assert.equal(b.answer(1, BrotherKind.DISBAND, true, 2).state, 'ready');
  });
});
