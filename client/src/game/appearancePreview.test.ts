// Unit coverage for the URL-gated Ninja Bóng Đêm appearance preview.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { SceneCharacter } from '@mc/shared';
import { NINJA_SHADOW_PREVIEW_RES } from './customSheets';
import { ninjaShadowPreview } from './appearancePreview';

const character = (): SceneCharacter => ({
  id: 1, name: 'Zed', classId: 1, gender: 0, level: 1, posX: 10, posY: 20, posDir: 0,
  iconCode: '0', resCode: '2050700000001', inGroup: false, isLeader: false, groupAfk: false,
});

test('ninjaShadowPreview applies only to Zed with the explicit URL flag', () => {
  const preview = ninjaShadowPreview(character(), 'Zed', new URLSearchParams('previewDress=ninja-shadow'));
  assert.equal(preview.resCode, NINJA_SHADOW_PREVIEW_RES);
  assert.equal(preview.av?.body, 'dress');
  assert.equal(preview.av?.base, '2050700000001');
});

test('ninjaShadowPreview leaves ordinary sessions untouched', () => {
  const source = character();
  assert.equal(ninjaShadowPreview(source, 'Zed', new URLSearchParams()), source);
  assert.equal(ninjaShadowPreview(source, 'Linh', new URLSearchParams('previewDress=ninja-shadow')), source);
});
