// Tests for the Hành Lang Vô Tận pure rules (Go service_test.go vectors): state normalisation, enter / advance / attack gating,
// victory crediting and first kill, the once-per-day courage claim and the victory text.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { advanceVerdict, claimVerdict, floorRefusal, openCorridorState, recordVictory, victoryText } from './corridor-rules';
import { CORRIDOR_TEXT as T } from './corridor-text';

const st = (raw: Parameters<typeof openCorridorState>[0] = {}) => openCorridorState(raw);

describe('corridor rules', () => {
  it('state is normalised: cleared 0..12, first kills sorted unique valid floors, unknown current floor 0', () => {
    assert.deepEqual(st(), { maxCleared: 0, firstKills: [], curFloor: 0, claimedCycle: '' });
    const s = st({ maxCleared: 99, firstKills: [3, 1, 3, 40, 0], curFloor: 13, claimedCycle: '2026-11-05' });
    assert.deepEqual(s, { maxCleared: 12, firstKills: [1, 3], curFloor: 0, claimedCycle: '2026-11-05' });
  });

  it('a floor can be entered / fought up to cleared + 1 (never above 12)', () => {
    assert.equal(floorRefusal(st(), 1), null);
    assert.equal(floorRefusal(st(), 2), T.LOCKED(2));
    assert.equal(floorRefusal(st({ maxCleared: 5 }), 6), null);
    assert.equal(floorRefusal(st({ maxCleared: 5 }), 7), T.LOCKED(7));
    assert.equal(floorRefusal(st({ maxCleared: 12 }), 12), null);
    assert.equal(floorRefusal(st({ maxCleared: 12 }), 13), T.ERROR);
    assert.equal(floorRefusal(st(), 0), T.ERROR);
  });

  it('advance: only from a cleared floor below the top; curFloor tells floors sharing a map apart', () => {
    assert.deepEqual(advanceVerdict(st({ maxCleared: 1 }), 30), { ok: false, text: T.NOT_IN_CORRIDOR });
    assert.deepEqual(advanceVerdict(st({ maxCleared: 0 }), 79), { ok: false, text: T.NOT_CLEARED(1) });
    assert.deepEqual(advanceVerdict(st({ maxCleared: 0 }), 79, T.BEAT_ME_FIRST), { ok: false, text: T.BEAT_ME_FIRST });
    assert.deepEqual(advanceVerdict(st({ maxCleared: 1 }), 79), { ok: true, floor: 2 });
    assert.deepEqual(advanceVerdict(st({ maxCleared: 8, curFloor: 9 }), 79), { ok: false, text: T.NOT_CLEARED(9) });
    assert.deepEqual(advanceVerdict(st({ maxCleared: 9, curFloor: 9 }), 79), { ok: true, floor: 10 });
    assert.deepEqual(advanceVerdict(st({ maxCleared: 12, curFloor: 12 }), 82), { ok: false, text: T.TOP });
  });

  it('victory: max cleared and first kill; replays credit no first kill, floors above cleared + 1 credit nothing', () => {
    const s = st();
    assert.deepEqual(recordVictory(s, 2), { credited: false, firstKill: false });
    assert.deepEqual(recordVictory(s, 1), { credited: true, firstKill: true });
    assert.deepEqual([s.maxCleared, s.firstKills], [1, [1]]);
    assert.deepEqual(recordVictory(s, 1), { credited: true, firstKill: false });
    assert.deepEqual(recordVictory(s, 2), { credited: true, firstKill: true });
    assert.deepEqual([s.maxCleared, s.firstKills], [2, [1, 2]]);
    assert.deepEqual(recordVictory(s, 13), { credited: false, firstKill: false });
  });

  it('daily claim: nothing cleared / claimed today refuse; else 50 + 15 x (floor - 1), floor capped at 12', () => {
    assert.deepEqual(claimVerdict(st(), '2026-11-05'), { ok: false, text: T.NOTHING });
    assert.deepEqual(claimVerdict(st({ maxCleared: 1 }), '2026-11-05'), { ok: true, floor: 1, points: 50 });
    assert.deepEqual(claimVerdict(st({ maxCleared: 3 }), '2026-11-05'), { ok: true, floor: 3, points: 80 });
    assert.deepEqual(claimVerdict(st({ maxCleared: 12 }), '2026-11-05'), { ok: true, floor: 12, points: 215 });
    assert.deepEqual(claimVerdict(st({ maxCleared: 3, claimedCycle: '2026-11-05' }), '2026-11-05'), { ok: false, text: T.CLAIMED });
    assert.equal(claimVerdict(st({ maxCleared: 3, claimedCycle: '2026-11-04' }), '2026-11-05').ok, true);
  });

  it('victory text names the next floor, the top floor has its own line, a bag adds the gift sentence', () => {
    assert.equal(
      victoryText(1, 'Marita', true),
      'Đánh bại Marita, vượt qua Hành Lang Vô Tận tầng 1! Hãy qua cổng dịch chuyển để đến tầng 2. Lần đầu vượt qua tầng này, nhận được túi quà.',
    );
    assert.equal(victoryText(3, 'Celica', false), 'Đánh bại Celica, vượt qua Hành Lang Vô Tận tầng 3! Hãy qua cổng dịch chuyển để đến tầng 4.');
    assert.equal(victoryText(12, 'Sethia', false), 'Đánh bại Sethia, đã chinh phục tầng cao nhất của Hành Lang Vô Tận (tầng 12)!');
  });
});
