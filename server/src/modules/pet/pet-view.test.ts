// Unit test for the following-pet scene view (pet-view.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PetTemplate } from '../gamedata/pet-data';
import { petSceneView } from './pet-view';

test('petSceneView carries the scene keys the Flash Pet object reads', () => {
  const tpl = { resCode: '2060100000014', colorCode: '-173', iconCode: '3060100000014' } as PetTemplate;
  const v = petSceneView({ _id: 7, characterId: 3, tid: 32, petName: 'Nấm', level: 5, element: 0 }, tpl);
  assert.deepEqual(v, {
    id: 7, cid: 3, tid: 32, name: 'Nấm', level: 5, resCode: '2060100000014', colorCode: '-173',
    iconCode: '3060100000014', element: 0,
  });
});
