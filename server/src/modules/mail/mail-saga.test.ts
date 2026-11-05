// Unit test: the mail saga undo stack runs compensations newest first, survives a failing compensation and empties itself.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UndoStack } from './mail-saga';

describe('UndoStack', () => {
  it('runs compensations in reverse registration order', async () => {
    const log: string[] = [];
    const s = new UndoStack();
    s.push('escrow', async () => void log.push('restore item'));
    s.push('money', async () => void log.push('refund money'));
    s.push('gold', async () => void log.push('refund gold'));
    assert.deepEqual(await s.rollback(), []);
    assert.deepEqual(log, ['refund gold', 'refund money', 'restore item']);
    assert.equal(s.size, 0);
  });

  it('keeps going after a failing compensation and reports its label', async () => {
    const log: string[] = [];
    const errors: string[] = [];
    const s = new UndoStack();
    s.push('escrow', async () => void log.push('restore'));
    s.push('refund', async () => Promise.reject(new Error('db down')));
    const failed = await s.rollback((label) => errors.push(label));
    assert.deepEqual(failed, ['refund']);
    assert.deepEqual(errors, ['refund']);
    assert.deepEqual(log, ['restore']);
  });

  it('a second rollback does nothing', async () => {
    let n = 0;
    const s = new UndoStack();
    s.push('a', async () => void n++);
    await s.rollback();
    await s.rollback();
    assert.equal(n, 1);
  });
});
