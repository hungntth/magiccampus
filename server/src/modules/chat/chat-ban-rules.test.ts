// Tests for the chat-ban decisions (M14 phase G).

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_BAN_TEXT } from '@mc/shared';
import { banVerdict, liftVerdict, mutedNote, type BanFacts } from './chat-ban-rules';

const ok: BanFacts = { actorId: 1, targetId: 2, targetName: 'B', targetExists: true, targetOnline: true, targetBanLeftMs: 0, actorGold: 100 };

test('banVerdict: allowed with 100 gold on an online, unbanned other player', () => {
  assert.deepEqual(banVerdict(ok), { ok: true });
});

test('banVerdict: refusal order is not found, self, offline, already banned, gold', () => {
  assert.deepEqual(banVerdict({ ...ok, targetExists: false, targetId: 1 }), { ok: false, note: CHAT_BAN_TEXT.NOT_FOUND });
  assert.deepEqual(banVerdict({ ...ok, targetId: 1, targetOnline: false }), { ok: false, note: CHAT_BAN_TEXT.SELF });
  assert.deepEqual(banVerdict({ ...ok, targetOnline: false, targetBanLeftMs: 5, actorGold: 0 }), { ok: false, note: 'B không online, không thể cấm chat.' });
  const banned = banVerdict({ ...ok, targetBanLeftMs: 61_000, actorGold: 0 });
  assert.ok(!banned.ok && banned.note === 'B đang bị cấm chat, còn 2 phút.');
  assert.deepEqual(banVerdict({ ...ok, actorGold: 99 }), { ok: false, note: CHAT_BAN_TEXT.NEED_GOLD });
});

test('liftVerdict: needs a live ban and 100 gold', () => {
  assert.deepEqual(liftVerdict(0, 500), { ok: false, note: CHAT_BAN_TEXT.NOT_BANNED });
  const poor = liftVerdict(120_000, 99);
  assert.ok(!poor.ok && poor.note === 'Cần 100 vàng để huỷ cấm chat (còn 2 phút).');
  assert.deepEqual(liftVerdict(120_000, 100), { ok: true });
});

test('mutedNote mentions /huycam while banned and is null otherwise', () => {
  assert.equal(mutedNote(0), null);
  assert.match(mutedNote(60_000) ?? '', /^Bạn đang bị cấm chat, còn 1 phút\. Gõ \/huycam/);
});
