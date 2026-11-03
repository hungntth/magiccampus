// Unit tests for NpcService.buildFuncInit (function-type mapping, text default, quest list pass-through).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NpcService } from './npc.service';

const svc = new NpcService();

test('function types map to themselves, others to 0', () => {
  assert.equal(svc.buildFuncInit({ id: 1, type: 8 }).npcType, 8);
  assert.equal(svc.buildFuncInit({ id: 1, type: 2 }).npcType, 2);
  assert.equal(svc.buildFuncInit({ id: 1, type: 1 }).npcType, 0);
  assert.equal(svc.buildFuncInit({ id: 1, type: 10 }).npcType, 0);
});

test('null on_service_text becomes empty string', () => {
  assert.equal(svc.buildFuncInit({ id: 1, type: 1, on_service_text: null }).onServiceText, '');
  assert.equal(svc.buildFuncInit({ id: 1, type: 1, on_service_text: 'Chào' }).onServiceText, 'Chào');
});

test('npcQuest defaults to empty with state -1', () => {
  const p = svc.buildFuncInit({ id: 240, name: 'Tân Thủ Sứ', type: 1 });
  assert.deepEqual(p.npcQuest, { npcId: 240, state: -1, list: {} });
  assert.deepEqual(p.loopInfo, { d: null, flag: false });
  assert.equal(p.npcName, 'Tân Thủ Sứ');
});

test('npcQuest carries the quest state and list from QuestService', () => {
  const view = {
    qid: 1, state: 102, require: [], sName: 'Tân Thủ Sứ', fName: 'Trưởng Thôn Stoff', pos: null,
    data: {
      id: 1, name: 'Bắt Đầu Thực Tập', info: '', type: 1, startText: '', completeText: '', awardExp: 48,
      moneyNum: 100, moneyType: 1, startNpc: 240, finishNpc: 231, minLevel: 1, color: 0,
    },
  };
  const p = svc.buildFuncInit({ id: 240, type: 1 }, { state: 102, list: { '1': view } });
  assert.equal(p.npcQuest.state, 102);
  assert.equal(p.npcQuest.list['1'].data.name, 'Bắt Đầu Thực Tập');
});
