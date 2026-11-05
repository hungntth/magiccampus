// Tests for the pet line-up rules: cmdList round trip, seats from a saved config, pet eligibility and script skills.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PetView } from '@mc/shared';
import {
  CMD_ATTACK, CMD_MAX_ROUNDS, CMD_SKILL, cmdListToRows, confFromSeats, eligiblePets, rowIsStale, rowsToCmdList, scriptSkills, seatsFromConf,
  targetLabel, type LineupSeat,
} from './lineupRules';

const pet = (id: number, tid: number, binded = 1, extra: Partial<PetView> = {}): PetView => ({ id, tid, binded, ...extra }) as PetView;

test('cmdList rows keep the round order and drop malformed rows', () => {
  const rows = cmdListToRows({
    '10': { action: CMD_ATTACK, id: 0, level: 1, t: 3 },
    '2': { action: CMD_SKILL, id: 77, level: 2, t: '52' },
    '3': { action: 5, id: 1, level: 1, t: 1 },
    '4': { action: CMD_ATTACK, id: 0, level: 1, t: 999 },
  });
  assert.deepEqual(rows.map((r) => [r.action, r.id, r.t]), [[CMD_SKILL, 77, 52], [CMD_ATTACK, 0, 1], [CMD_ATTACK, 0, 3]]);
});

test('rowsToCmdList numbers rounds from zero, caps at 24 and normalises attack rows', () => {
  const many = Array.from({ length: 30 }, () => ({ action: CMD_ATTACK, id: 9, level: 4, t: 2 }) as const);
  const list = rowsToCmdList(many);
  assert.equal(Object.keys(list).length, CMD_MAX_ROUNDS);
  assert.deepEqual(list['0'], { action: CMD_ATTACK, id: 0, level: 1, t: 2 });
  assert.deepEqual(rowsToCmdList([{ action: CMD_SKILL, id: 5, level: 3, t: 50 }])['0'], { action: CMD_SKILL, id: 5, level: 3, t: 50 });
});

test('seats follow the positions and the config only keeps filled seats', () => {
  const seats = seatsFromConf({ '6': { pid: 8, pos: 6, cmdList: { '0': { action: CMD_ATTACK, id: 0, level: 1, t: 4 } } } }, 5, 3);
  assert.deepEqual(seats.map((s) => [s.pos, s.pid]), [[5, 0], [6, 8], [7, 0]]);
  const conf = confFromSeats(seats);
  assert.deepEqual(Object.keys(conf), ['6']);
  assert.equal(conf['6'].cmdList['0'].t, 4);
});

test('eligible pets are bound and one per template', () => {
  const pets = [pet(1, 10), pet(2, 10), pet(3, 11, 0), pet(4, 12)];
  const seats: LineupSeat[] = [{ pos: 1, pid: 1, rows: [] }, { pos: 2, pid: 0, rows: [] }];
  assert.deepEqual(eligiblePets(pets, seats).map((p) => p.id), [4]);
  assert.deepEqual(eligiblePets(pets, seats, 1).map((p) => p.id), [1, 2, 4]);
});

test('script skills list the learned active skills only', () => {
  const p = pet(1, 1, 1, { skill1: 5, skill2: 6, skill3: 0, skill4: 5 } as Partial<PetView>);
  const info = (id: number) => (id === 6 ? { id, name: 'Bị động', iconCode: '', type: 11, info: '' } : id === 5 ? { id, name: 'Hỏa Cầu', iconCode: '', type: 1, info: '', level: 2 } : undefined);
  const skills = scriptSkills(p, info);
  assert.deepEqual(skills, [{ id: 5, name: 'Hỏa Cầu', level: 2 }]);
  assert.equal(rowIsStale({ action: CMD_SKILL, id: 6, level: 1, t: 1 }, skills), true);
  assert.equal(rowIsStale({ action: CMD_ATTACK, id: 0, level: 1, t: 1 }, skills), false);
  assert.equal(targetLabel(52), 'Vị trí cố định 3');
  assert.equal(targetLabel(77), 'Ngẫu nhiên');
});
