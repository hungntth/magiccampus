// Unit tests for the pure party rules: invite / accept / deny / expiry (injectable clock), requests, leave / kick /
// leader transfer / disband, AFK and follower selection, mList and the AFK return distance.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupCantJoinCode, PartyLimits, type GroupMember } from '@mc/shared';
import { PartyBook, buildMList, withinAfkReturn } from './party-rules';

function book(): { b: PartyBook; tick: (ms: number) => void } {
  let t = 1_000;
  return { b: new PartyBook(() => t), tick: (ms) => void (t += ms) };
}

/** Builds a party led by 1 with members 2..n through the invite flow. */
function party(b: PartyBook, n: number): void {
  for (let i = 2; i <= n; i++) {
    assert.ok(b.invite(1, i).ok);
    assert.ok(b.accept(i, 1).ok);
  }
}

test('invite does not create a party until accepted; accept creates it with the inviter as leader', () => {
  const { b } = book();
  assert.deepEqual(b.invite(1, 2), { ok: true });
  assert.equal(b.partyOf(1), undefined);
  const r = b.accept(2, 1);
  assert.ok(r.ok && r.created);
  assert.deepEqual(r.ok && r.party.members, [1, 2]);
  assert.equal(b.isLeader(1), true);
  assert.equal(b.isLeader(2), false);
});

test('invite refusals: self, target already in a party (30), inviter party full (20)', () => {
  const { b } = book();
  assert.equal(b.invite(1, 1).ok, false);
  party(b, 5);
  const inGroup = b.invite(9, 2);
  assert.ok(!inGroup.ok && inGroup.reason === 'inGroup' && inGroup.code === GroupCantJoinCode.IN_GROUP);
  const full = b.invite(1, 9);
  assert.ok(!full.ok && full.reason === 'full' && full.code === GroupCantJoinCode.FULL);
});

test('an invite expires after 60 s; accept then reports expired and nothing changes', () => {
  const { b, tick } = book();
  b.invite(1, 2);
  tick(PartyLimits.INVITE_TTL_MS - 1);
  assert.equal(b.hasInvite(2, 1), true);
  tick(1);
  assert.equal(b.hasInvite(2, 1), false);
  const r = b.accept(2, 1);
  assert.ok(!r.ok && r.reason === 'expired');
  assert.equal(b.partyOf(1), undefined);
  assert.equal(b.partyOf(2), undefined);
});

test('accept without an invite is refused; a second accept of the same invite is refused', () => {
  const { b } = book();
  const none = b.accept(2, 1);
  assert.ok(!none.ok && none.reason === 'expired');
  b.invite(1, 2);
  assert.ok(b.accept(2, 1).ok);
  assert.equal(b.accept(2, 1).ok, false);
});

test('accept fails when the party filled up meanwhile (invites are not reserved slots)', () => {
  const { b } = book();
  party(b, 4);
  b.invite(1, 8);
  b.invite(1, 9);
  assert.ok(b.accept(8, 1).ok);
  const r = b.accept(9, 1);
  assert.ok(!r.ok && r.reason === 'full');
  assert.equal(b.partyOf(1)?.members.length, 5);
});

test('accepting joins the party and clears the joiner\'s other pending invites', () => {
  const { b } = book();
  b.invite(1, 3);
  b.invite(2, 3);
  assert.ok(b.accept(3, 1).ok);
  assert.equal(b.hasInvite(3, 2), false);
  const r = b.accept(3, 2);
  assert.ok(!r.ok);
});

test('deny of an invite removes it and reports invite; unknown or expired reports none', () => {
  const { b, tick } = book();
  b.invite(1, 2);
  assert.equal(b.deny(2, 1), 'invite');
  assert.equal(b.deny(2, 1), 'none');
  b.invite(1, 2);
  tick(PartyLimits.INVITE_TTL_MS);
  assert.equal(b.deny(2, 1), 'none');
});

test('request: applicant without a party asks, the leader accepts (groupAdd) or denies', () => {
  const { b } = book();
  party(b, 2);
  // the applicant may target any member; the leader is who decides
  const r = b.request(7, 2);
  assert.ok(r.ok && r.leaderId === 1);
  const a = b.acceptRequest(1, 7);
  assert.ok(a.ok);
  assert.deepEqual(b.partyOf(1)?.members, [1, 2, 7]);

  b.request(8, 1);
  assert.equal(b.deny(1, 8), 'request');
  const gone = b.acceptRequest(1, 8);
  assert.ok(!gone.ok && gone.reason === 'expired');
});

test('request refusals: self, applicant already grouped, target without party, full; accept needs the leader', () => {
  const { b, tick } = book();
  assert.ok(!b.request(1, 1).ok);
  const noParty = b.request(7, 1);
  assert.ok(!noParty.ok && noParty.reason === 'noParty');
  party(b, 5);
  const grouped = b.request(2, 3);
  assert.ok(!grouped.ok && grouped.reason === 'inGroup');
  const full = b.request(7, 1);
  assert.ok(!full.ok && full.reason === 'full');
  b.leave(5);
  assert.ok(b.request(7, 1).ok);
  const notLeader = b.acceptRequest(2, 7);
  assert.ok(!notLeader.ok && notLeader.reason === 'notLeader');
  tick(PartyLimits.INVITE_TTL_MS);
  const expired = b.acceptRequest(1, 7);
  assert.ok(!expired.ok && expired.reason === 'expired');
});

test('a request survives a leader change but not the party being disbanded', () => {
  const { b } = book();
  party(b, 3);
  b.request(7, 1);
  assert.ok(b.giveLeader(1, 2).ok);
  assert.ok(b.acceptRequest(2, 7).ok);
  const { b: b2 } = book();
  party(b2, 2);
  b2.request(7, 1);
  b2.leave(2); // disband
  const r = b2.acceptRequest(1, 7);
  assert.ok(!r.ok);
});

test('leave of a normal member keeps the party; leaving down to one member disbands it', () => {
  const { b } = book();
  party(b, 3);
  const l = b.leave(3);
  assert.ok(l.kind === 'left' && l.newLeaderId === null);
  assert.deepEqual(b.partyOf(1)?.members, [1, 2]);
  const d = b.leave(2);
  assert.ok(d.kind === 'dismissed');
  assert.deepEqual(d.kind === 'dismissed' && d.members, [1, 2]);
  assert.equal(b.partyOf(1), undefined);
  assert.equal(b.partyOf(2), undefined);
  assert.equal(b.leave(1).kind, 'none');
});

test('leader leaving promotes the next non-AFK member to the front', () => {
  const { b } = book();
  party(b, 4);
  b.setAfk(2, true);
  const l = b.leave(1);
  assert.ok(l.kind === 'left' && l.newLeaderId === 3);
  assert.deepEqual(b.partyOf(3)?.members, [3, 2, 4]);
  assert.equal(b.isLeader(3), true);
  assert.equal(b.flagsOf(2).groupAfk, true);
});

test('leader leaving with only AFK members left promotes the first and clears its AFK flag', () => {
  const { b } = book();
  party(b, 3);
  b.setAfk(2, true);
  b.setAfk(3, true);
  const l = b.leave(1);
  assert.ok(l.kind === 'left' && l.newLeaderId === 2);
  assert.equal(b.flagsOf(2).groupAfk, false);
  assert.equal(b.flagsOf(3).groupAfk, true);
});

test('kick: only the leader, not self, only members; kicking from a pair disbands', () => {
  const { b } = book();
  party(b, 3);
  const notLeader = b.kick(2, 3);
  assert.ok(!notLeader.ok && notLeader.reason === 'notLeader');
  const self = b.kick(1, 1);
  assert.ok(!self.ok && self.reason === 'self');
  const stranger = b.kick(1, 9);
  assert.ok(!stranger.ok && stranger.reason === 'notMember');
  const k = b.kick(1, 3);
  assert.ok(k.ok && k.result.kind === 'left');
  const k2 = b.kick(1, 2);
  assert.ok(k2.ok && k2.result.kind === 'dismissed');
  assert.equal(b.partyOf(1), undefined);
});

test('giveLeader reorders the list, clears the new leader\'s AFK and validates', () => {
  const { b } = book();
  party(b, 3);
  b.setAfk(3, true);
  assert.ok(!b.giveLeader(2, 3).ok);
  assert.ok(!b.giveLeader(1, 1).ok);
  assert.ok(!b.giveLeader(1, 9).ok);
  const g = b.giveLeader(1, 3);
  assert.ok(g.ok && g.wasAfk && g.oldLeaderId === 1);
  assert.deepEqual(b.partyOf(1)?.members, [3, 1, 2]);
  assert.deepEqual(b.flagsOf(3), { inGroup: true, isLeader: true, groupAfk: false });
  assert.deepEqual(b.flagsOf(1), { inGroup: true, isLeader: false, groupAfk: false });
});

test('AFK: members toggle, the leader cannot, no party refused; AFK members can walk and are not followers', () => {
  const { b } = book();
  assert.ok(!b.setAfk(1, true).ok);
  party(b, 3);
  assert.ok(!b.setAfk(1, true).ok);
  assert.equal(b.canWalk(1), true);
  assert.equal(b.canWalk(2), false);
  assert.deepEqual(b.followersOf(1), [2, 3]);
  assert.ok(b.setAfk(2, true).ok);
  assert.equal(b.canWalk(2), true);
  assert.deepEqual(b.followersOf(1), [3]);
  assert.deepEqual(b.followersOf(3), []);
  assert.ok(b.setAfk(2, false).ok);
  assert.equal(b.canWalk(2), false);
  assert.equal(b.canWalk(99), true);
});

test('forget drops pending invites and requests in both directions', () => {
  const { b } = book();
  b.invite(1, 2);
  b.invite(3, 1);
  b.forget(1);
  assert.equal(b.hasInvite(2, 1), false);
  assert.equal(b.hasInvite(1, 3), false);
});

test('buildMList: leader first, len, null next at the tail; empty list has a null head', () => {
  const m = (cid: number): GroupMember => ({
    cid, name: `p${cid}`, level: 1, classId: 1, gender: 0, iconCode: '0', isLeader: cid === 1, afk: false, mapId: 1,
  });
  const list = buildMList([m(1), m(2), m(3)]);
  assert.equal(list.len, 3);
  assert.equal(list.head?.obj.cid, 1);
  assert.equal(list.head?.next?.obj.cid, 2);
  assert.equal(list.head?.next?.next?.obj.cid, 3);
  assert.equal(list.head?.next?.next?.next, null);
  assert.deepEqual(buildMList([]), { head: null, len: 0 });
});

test('withinAfkReturn: same map and at most 300 px', () => {
  const leader = { mapId: 3, x: 1000, y: 1000 };
  assert.equal(withinAfkReturn({ mapId: 3, x: 1300, y: 1000 }, leader), true);
  assert.equal(withinAfkReturn({ mapId: 3, x: 1301, y: 1000 }, leader), false);
  assert.equal(withinAfkReturn({ mapId: 1, x: 1000, y: 1000 }, leader), false);
});
