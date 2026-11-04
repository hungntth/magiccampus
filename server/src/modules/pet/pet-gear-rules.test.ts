// Pet skill book eligibility / conflicts, slot gates and equipment gates (pure rules).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillTable } from '../gamedata/skill-data';
import { skillsByName } from '../gamedata/skill-data';
import {
  bookSkill, checkBook, delSkillBlocker, firstEmptySkillSlot, openSkillBlocker, parseCreKind, petEquipBlocker, petEquipIndex,
  skillFitsCreature, skillsConflict,
} from './pet-gear-rules';

const table = buildSkillTable([
  { id: 10, name: 'Phản Kích', level: 1, type: 11, buff_id: 1, cre_kind: '3|2', code_name: 'S1', script_req_l: null },
  { id: 11, name: 'Phản Kích', level: 2, type: 11, buff_id: 2, cre_kind: '3|2', code_name: 'S1', script_req_l: null },
  { id: 20, name: 'Chính Xác', level: 1, type: 11, buff_id: 3, cre_kind: '0', code_name: 'S2', script_req_l: null },
  { id: 21, name: 'Chính Xác Khác', level: 1, type: 11, buff_id: 4, cre_kind: null, code_name: 'S2', script_req_l: null },
  { id: 30, name: 'Kết Hợp', level: 1, type: 11, buff_id: 5, cre_kind: null, code_name: 'S3', script_req_l: 'GRP' },
  { id: 31, name: 'Kết Hợp Hai', level: 1, type: 11, buff_id: 6, cre_kind: null, code_name: 'S4', script_req_l: 'GRP' },
  { id: 40, name: 'Chủ Động', level: 1, type: 1, buff_id: null, cre_kind: '4', code_name: 'S5', script_req_l: null },
]);
const byId = (id: number) => table.get(id);
const named = (() => {
  const idx = skillsByName(table);
  return (n: string) => idx.get(n) ?? [];
})();
const book = { type: 506, use_type: 2, name: 'Phản Kích', skill_id: 0 };
const creature = { classIds: [3], qLevel: 2 };

test('cre_kind "classIds|minQLevel": 0 / missing parts are unrestricted', () => {
  assert.deepEqual(parseCreKind('3|2'), { classId: 3, minQ: 2 });
  assert.deepEqual(parseCreKind('0'), { classId: 0, minQ: 0 });
  assert.deepEqual(parseCreKind(''), { classId: 0, minQ: 0 });
  assert.equal(skillFitsCreature('3|2', { classIds: [3], qLevel: 2 }), true);
  assert.equal(skillFitsCreature('3|2', { classIds: [3], qLevel: 1 }), false);
  assert.equal(skillFitsCreature('3|2', { classIds: [4], qLevel: 3 }), false);
  assert.equal(skillFitsCreature('', { classIds: [], qLevel: 1 }), true);
});

test('the book skill is skill_id when set, else the lowest level with the exact name', () => {
  assert.equal(bookSkill(book, byId, named)?.id, 10);
  assert.equal(bookSkill({ ...book, skill_id: 11 }, byId, named)?.id, 11);
  assert.equal(bookSkill({ ...book, name: 'Không Có' }, byId, named), undefined);
});

test('checkBook succeeds into the first empty slot', () => {
  const r = checkBook(book, [5, -1, 0, 0, -1], creature, byId, named);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual({ slot: r.slot, id: r.skill.id }, { slot: 2, id: 10 });
});

test('checkBook rejects non-books and unknown skills with f=2', () => {
  assert.deepEqual(pick(checkBook({ ...book, type: 501 }, [0], creature, byId, named)), { f: 2 });
  assert.deepEqual(pick(checkBook({ ...book, use_type: 1 }, [0], creature, byId, named)), { f: 2 });
  assert.deepEqual(pick(checkBook(undefined, [0], creature, byId, named)), { f: 2 });
  assert.deepEqual(pick(checkBook({ ...book, name: 'Không Có' }, [0], creature, byId, named)), { f: 2 });
});

test('checkBook rejects a creature that does not fit the skill with f=2', () => {
  assert.deepEqual(pick(checkBook(book, [0], { classIds: [3], qLevel: 1 }, byId, named)), { f: 2 });
  assert.deepEqual(pick(checkBook(book, [0], { classIds: [5], qLevel: 3 }, byId, named)), { f: 2 });
});

test('checkBook: no empty slot or a conflict is f=1', () => {
  assert.deepEqual(pick(checkBook(book, [7, -1, -1], creature, byId, named)), { f: 1 });
  assert.deepEqual(pick(checkBook(book, [10, 0], creature, byId, named)), { f: 1 }); // same id
  assert.deepEqual(pick(checkBook(book, [11, 0], creature, byId, named)), { f: 1 }); // same name + code_name
});

test('skills conflict on id, name, code_name or script_req_l (non-empty only)', () => {
  const t = (id: number) => table.get(id)!;
  assert.equal(skillsConflict(t(20), t(21)), true); // code_name S2
  assert.equal(skillsConflict(t(30), t(31)), true); // script_req_l GRP
  assert.equal(skillsConflict(t(10), t(20)), false);
  assert.equal(skillsConflict(t(21), t(30)), false); // both script_req_l: empty vs GRP, different codes
});

test('first empty skill slot is the first 0', () => {
  assert.equal(firstEmptySkillSlot([3, -1, 0, 0]), 2);
  assert.equal(firstEmptySkillSlot([3, -1]), -1);
});

test('delete-skill gate: bound pet and a learned skill', () => {
  assert.equal(delSkillBlocker(0, 10), 'Phải khóa pet mới xóa được');
  assert.notEqual(delSkillBlocker(1, 0), null);
  assert.notEqual(delSkillBlocker(1, -1), null);
  assert.equal(delSkillBlocker(1, 10), null);
});

test('open-skill gate: only locked slots 6..15', () => {
  assert.equal(openSkillBlocker(6, -1), null);
  assert.notEqual(openSkillBlocker(6, 0), null);
  assert.notEqual(openSkillBlocker(5, -1), null);
  assert.notEqual(openSkillBlocker(16, -1), null);
});

test('pet equipment index: positions 50..57 only', () => {
  assert.equal(petEquipIndex({ position: 50 }), 0);
  assert.equal(petEquipIndex({ position: 57 }), 7);
  assert.equal(petEquipIndex({ position: 14 }), null);
  assert.equal(petEquipIndex(undefined), null);
});

test('pet equipment gates: level, class list and creature id list', () => {
  const gear = { req_level: 10, req_class: '|1|3|', req_class_id: '|32|33|' };
  const pet = { petLevel: 10, petTid: 32, creatureClassIds: [3] };
  assert.equal(petEquipBlocker(gear, pet), null);
  assert.notEqual(petEquipBlocker(gear, { ...pet, petLevel: 9 }), null);
  assert.notEqual(petEquipBlocker(gear, { ...pet, creatureClassIds: [2] }), null);
  assert.notEqual(petEquipBlocker(gear, { ...pet, petTid: 40 }), null);
  assert.equal(petEquipBlocker({ req_level: 1, req_class: null, req_class_id: null }, pet), null);
});

function pick(r: ReturnType<typeof checkBook>): { f: number } | 'ok' {
  return r.ok ? 'ok' : { f: r.f };
}
