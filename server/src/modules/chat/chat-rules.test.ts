// Unit tests for the pure chat rules: routing, world-chat cost with an injected clock, rate limit, whisper lookup.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChatChannel, ChatLimits } from '@mc/shared';
import { ChatRateLimiter, findOnlineByName, normalizeMessage, routeChannel, worldChatCost } from './chat-rules';

describe('routeChannel', () => {
  it('maps legacy ids', () => {
    assert.equal(routeChannel(ChatChannel.LOCAL), 'local');
    assert.equal(routeChannel(ChatChannel.WORLD), 'world');
    assert.equal(routeChannel(ChatChannel.TEAM), 'team');
    assert.equal(routeChannel(ChatChannel.GUILD), 'guild');
  });
  it('refuses area, headline, rumour, whisper and unknown ids', () => {
    for (const id of [4, 5, 9, 99, -1, 7]) assert.equal(routeChannel(id), 'unsupported');
    assert.equal(routeChannel(6), 'headline');
  });
});

describe('worldChatCost', () => {
  const T0 = 1_000_000;
  it('is free for level >= 10 when never used', () => {
    assert.equal(worldChatCost({ level: 10, now: T0, lastFreeAt: undefined, loaCount: 0 }), 'free');
  });
  it('is not free below level 10: Loa, else refuse', () => {
    assert.equal(worldChatCost({ level: 9, now: T0, lastFreeAt: undefined, loaCount: 1 }), 'loa');
    assert.equal(worldChatCost({ level: 9, now: T0, lastFreeAt: undefined, loaCount: 0 }), 'refuse');
  });
  it('free again only after the 5 minute window', () => {
    const w = ChatLimits.WORLD_FREE_WINDOW_MS;
    assert.equal(worldChatCost({ level: 20, now: T0 + w - 1, lastFreeAt: T0, loaCount: 0 }), 'refuse');
    assert.equal(worldChatCost({ level: 20, now: T0 + w - 1, lastFreeAt: T0, loaCount: 2 }), 'loa');
    assert.equal(worldChatCost({ level: 20, now: T0 + w, lastFreeAt: T0, loaCount: 0 }), 'free');
  });
});

describe('ChatRateLimiter', () => {
  it('allows one call per interval per character', () => {
    const rl = new ChatRateLimiter(1100);
    assert.equal(rl.tryAcquire(1, 0), true);
    assert.equal(rl.tryAcquire(1, 1099), false);
    assert.equal(rl.tryAcquire(2, 1099), true);
    assert.equal(rl.tryAcquire(1, 1100), true);
  });
  it('a refused call does not extend the window', () => {
    const rl = new ChatRateLimiter(1000);
    rl.tryAcquire(1, 0);
    assert.equal(rl.tryAcquire(1, 900), false);
    assert.equal(rl.tryAcquire(1, 1000), true);
  });
  it('forget resets a character', () => {
    const rl = new ChatRateLimiter(1000);
    rl.tryAcquire(1, 0);
    rl.forget(1);
    assert.equal(rl.tryAcquire(1, 1), true);
  });
});

describe('normalizeMessage', () => {
  it('trims, caps and rejects non-strings / blanks', () => {
    assert.equal(normalizeMessage('  hi  ', 500), 'hi');
    assert.equal(normalizeMessage('abcdef', 3), 'abc');
    assert.equal(normalizeMessage('   ', 500), null);
    assert.equal(normalizeMessage(5, 500), null);
    assert.equal(normalizeMessage(undefined, 500), null);
  });

  it('strips control / invisible characters and collapses whitespace', () => {
    assert.equal(normalizeMessage('a\n\r\tb', 500), 'a b');
    assert.equal(normalizeMessage('x\u202Eevil\u200B\u0000y', 500), 'x evil y');
    assert.equal(normalizeMessage('\u200B\u200B', 500), null);
    assert.equal(normalizeMessage('<script>alert(1)</script>', 500), '<script>alert(1)</script>');
  });

  it('caps by code point without splitting emoji', () => {
    assert.equal(normalizeMessage('😀😀😀', 2), '😀😀');
  });
});

describe('findOnlineByName', () => {
  const sessions = [{ characterName: 'Alice' }, { characterName: 'Bob' }, { characterName: null }];
  it('matches the exact name only', () => {
    assert.equal(findOnlineByName(sessions, 'Bob'), sessions[1]);
    assert.equal(findOnlineByName(sessions, ' Alice '), sessions[0]);
    assert.equal(findOnlineByName(sessions, 'bob'), undefined);
    assert.equal(findOnlineByName(sessions, 'Bo'), undefined);
    assert.equal(findOnlineByName(sessions, ''), undefined);
  });
});
