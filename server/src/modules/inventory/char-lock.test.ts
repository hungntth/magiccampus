// Unit test: operations of one character run strictly one after another, different characters do not wait.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withCharLock, withCharLocks, withKeyLock } from './char-lock';

describe('withCharLock', () => {
  it('serializes the same character and keeps results', async () => {
    const log: string[] = [];
    const slow = withCharLock(1, async () => {
      log.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      log.push('a-end');
      return 'a';
    });
    const fast = withCharLock(1, async () => {
      log.push('b');
      return 'b';
    });
    assert.deepEqual(await Promise.all([slow, fast]), ['a', 'b']);
    assert.deepEqual(log, ['a-start', 'a-end', 'b']);
  });

  it('a failing operation releases the lock', async () => {
    await assert.rejects(withCharLock(2, async () => Promise.reject(new Error('x'))));
    assert.equal(await withCharLock(2, async () => 'ok'), 'ok');
  });
});

describe('withKeyLock / withCharLocks', () => {
  it('serializes the same string key and not different keys', async () => {
    const log: string[] = [];
    const slow = withKeyLock('auction:1', async () => {
      log.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      log.push('a-end');
    });
    const other = withKeyLock('auction:2', async () => {
      log.push('other');
    });
    const next = withKeyLock('auction:1', async () => {
      log.push('b');
    });
    await Promise.all([slow, other, next]);
    assert.deepEqual(log, ['a-start', 'other', 'a-end', 'b']);
  });

  it('two opposite pair locks do not deadlock', async () => {
    const r = await Promise.all([withCharLocks(5, 3, async () => 'x'), withCharLocks(3, 5, async () => 'y')]);
    assert.deepEqual(r, ['x', 'y']);
  });
});
