// Unit tests for the Sư đồ pure rules: pair eligibility (IM and NPC), find codes, refusal texts, NPC lock, level-exp lookup and the
// pending request / NPC draft expiry.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FindTsCode, MENTOR_NPC_DRAFT_MS, MENTOR_REQUEST_MS, RelationType, reportGain } from '@mc/shared';
import { NpcDrafts, PendingRequests } from './mentor-pending';
import {
  checkPair, findCode, levelExp, npcLocked, npcRefusalText, pairBlocked, refusalText, validName, type PairFacts, type PairReason,
} from './mentor-rules';

const base: PairFacts = {
  npc: false, teacherLevel: 40, studentLevel: 35, teacherRank: 1, teacherStudents: 0, studentHasTeacher: false, reversed: false, rowTypes: [],
};
const check = (patch: Partial<PairFacts>): PairReason => checkPair({ ...base, ...patch });

describe('checkPair (IM)', () => {
  it('accepts a rank 1 Lv 30+ teacher at or above the student level (gap 0)', () => {
    assert.equal(check({}), 'ok');
    assert.equal(check({ teacherLevel: 30, studentLevel: 30 }), 'ok');
    assert.equal(check({ rowTypes: [RelationType.FRIEND, RelationType.TUTOR] }), 'ok');
  });
  it('refuses by priority: has teacher, reversed, rank, level, full, block', () => {
    assert.equal(check({ studentHasTeacher: true, reversed: true, teacherRank: 0 }), 'hasTeacher');
    assert.equal(check({ reversed: true, teacherRank: 0 }), 'reversed');
    assert.equal(check({ teacherRank: 0, teacherLevel: 10 }), 'noRank');
    assert.equal(check({ teacherLevel: 29, studentLevel: 5 }), 'level');
    assert.equal(check({ teacherLevel: 40, studentLevel: 41 }), 'level');
    assert.equal(check({ teacherStudents: 5 }), 'full');
    assert.equal(check({ teacherRank: 2, teacherStudents: 9 }), 'ok');
    assert.equal(check({ teacherRank: 2, teacherStudents: 10 }), 'full');
    assert.equal(check({ rowTypes: [RelationType.BLACK] }), 'pair');
  });
  it('blocks enemy, couple, brother and black rows but not friend / tutor', () => {
    for (const t of [RelationType.ENEMY, RelationType.COUPLE, RelationType.BROTHER, RelationType.BLACK]) assert.equal(pairBlocked([t]), true);
    assert.equal(pairBlocked([RelationType.FRIEND, RelationType.TUTOR]), false);
  });
});

describe('checkPair (NPC 49)', () => {
  const npc = (patch: Partial<PairFacts>): PairReason => check({ npc: true, teacherRank: 0, studentLevel: 15, ...patch });
  it('lets a rank 0 Lv 30+ leader take a Lv <= 20 member', () => {
    assert.equal(npc({}), 'ok');
    assert.equal(npc({ studentLevel: 20 }), 'ok');
  });
  it('checks levels and the rank-1 cap for a rank 0 leader', () => {
    assert.equal(npc({ teacherLevel: 29 }), 'level');
    assert.equal(npc({ studentLevel: 21 }), 'level');
    assert.equal(npc({ teacherStudents: 5 }), 'full');
    assert.equal(npc({ teacherRank: 3, teacherStudents: 5 }), 'ok');
  });
});

describe('codes and texts', () => {
  it('maps reasons to the Flash f codes per direction', () => {
    assert.equal(findCode('ok', true), FindTsCode.WAITING);
    assert.equal(findCode('offline', true), 2);
    assert.equal(findCode('notFound', false), 3);
    assert.equal(findCode('level', true), 4);
    assert.equal(findCode('hasTeacher', false), 5);
    for (const r of ['self', 'noRank', 'full', 'pair'] as const) {
      assert.equal(findCode(r, true), 6);
      assert.equal(findCode(r, false), 6);
    }
    assert.equal(findCode('reversed', true), 6);
    assert.equal(findCode('reversed', false), 8);
  });
  it('words refusals for the answering side', () => {
    assert.equal(refusalText('hasTeacher', false), 'Bạn đã có sư phụ rồi!');
    assert.equal(refusalText('hasTeacher', true), 'Đối phương đã có sư phụ!');
    assert.equal(refusalText('ok', true), '');
    assert.match(npcRefusalText('level'), /cấp 30/);
    assert.match(npcRefusalText('offline'), /không online/);
  });
  it('locks NPC pairs until the student is Lv 30', () => {
    assert.equal(npcLocked(true, 29), true);
    assert.equal(npcLocked(true, 30), false);
    assert.equal(npcLocked(false, 1), false);
  });
  it('validates names like the legacy boundary', () => {
    assert.equal(validName('  Bob '), 'Bob');
    assert.equal(validName(''), null);
    assert.equal(validName('a\nb'), null);
    assert.equal(validName('x'.repeat(31)), null);
    assert.equal(validName(7), null);
  });
});

describe('levelExp / reportGain', () => {
  it('is the exp a level needs on top of the previous one', () => {
    assert.equal(levelExp(1), 0);
    assert.equal(levelExp(2), 72);
    assert.equal(levelExp(3), 285);
    assert.ok(levelExp(31) > levelExp(30));
  });
  it('gives 10 % of the levels gained', () => {
    assert.equal(reportGain(1, 3, levelExp), Math.floor((72 + 285) / 10));
    assert.ok(reportGain(30, 31, levelExp) > 0);
  });
});

describe('PendingRequests', () => {
  it('is keyed by pair and direction and lives 5 minutes', () => {
    const p = new PendingRequests();
    p.remember(1, 2, true, 1000); // student 2 asked teacher 1
    assert.equal(p.consume(1, 2, false, 1001), false); // the student cannot accept their own request
    assert.equal(p.consume(1, 2, true, 1001), true);
    assert.equal(p.consume(1, 2, true, 1002), false); // once
    p.remember(1, 2, false, 5000);
    assert.equal(p.consume(1, 2, false, 5000 + MENTOR_REQUEST_MS), false);
    p.remember(1, 2, false, 5000);
    assert.equal(p.consume(1, 2, false, 5000 + MENTOR_REQUEST_MS - 1), true);
  });
  it('drops requests of a leaving character', () => {
    const p = new PendingRequests();
    p.remember(1, 2, true, 0);
    p.remember(3, 4, false, 0);
    p.dropFor(2);
    assert.equal(p.size, 1);
    assert.equal(p.consume(3, 4, false, 1), true);
  });
});

describe('NpcDrafts', () => {
  it('needs a live draft naming the current leader and is single use', () => {
    const d = new NpcDrafts();
    d.set(5, 9, 100);
    assert.equal(d.take(5, 8, 101), false); // leader changed (draft is consumed)
    d.set(5, 9, 100);
    assert.equal(d.take(5, 9, 100 + MENTOR_NPC_DRAFT_MS), false);
    d.set(5, 9, 100);
    assert.equal(d.take(5, 9, 100 + MENTOR_NPC_DRAFT_MS - 1), true);
    assert.equal(d.take(5, 9, 101), false);
  });
  it('drops drafts of the member or the leader', () => {
    const d = new NpcDrafts();
    d.set(5, 9, 0);
    d.set(6, 9, 0);
    d.dropFor(9);
    assert.equal(d.size, 0);
  });
});
