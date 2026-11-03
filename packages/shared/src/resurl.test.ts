import { test } from 'node:test';
import assert from 'node:assert/strict';
import { md5 } from './md5.ts';
import { decodeResCode, resPath, iconPath, mapTileHash } from './resurl.ts';

test('md5 matches known vectors', () => {
  assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(
    md5('resource/scene/SCENE_FOLDER_000001/MAP_0_0.jpg'),
    '36d51dd37392edf908666bced3544007',
  );
});

test('decodes map folder code', () => {
  const d = decodeResCode(1015015000001);
  assert.equal(d.ext, 1);
  assert.equal(d.word1, 15);
  assert.equal(d.word2, 15);
  assert.equal(d.num, '000001');
  assert.equal(resPath(1015015000001), 'resource/scene/SCENE_FOLDER_000001');
});

test('decodes npc icon code', () => {
  assert.equal(iconPath('3060100001064'), 'icon/creature/NPC_CRE_001064.jpg');
});

test('map tile hash for map 1', () => {
  assert.equal(mapTileHash(1015015000001, 0, 0), '36d51dd37392edf908666bced3544007');
});
