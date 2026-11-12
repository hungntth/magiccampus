// Tests for the pure avatar resolver: body priority, hidden dress, fake dress / flyer, flying on no-fly maps, flyer overlays.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_LOOK_INPUT, appearanceOf, artCode, costumeArt, flyerArt, type LookInput } from './appearance-rules';

const input = (over: Partial<LookInput>): LookInput => ({ ...NO_LOOK_INPUT, classBody: '2050070000001', ...over });
const FLYER = { res: '2070380000005', wav: '2070380100005' };

test('class body when nothing is worn', () => {
  const v = appearanceOf(input({}));
  assert.deepEqual(v, { res: '2050070000001', base: '2050070000001', body: 'class', wp: '0', flying: false });
});

test('a worn costume replaces the body and keeps the raw weapon art', () => {
  const v = appearanceOf(input({ costume: '2060100200042', weapon: '2010000000011' }));
  assert.equal(v.res, '2060100200042');
  assert.equal(v.body, 'dress');
  assert.equal(v.dress, '2060100200042');
  assert.equal(v.wp, '2010000000011'); // raw weapon art; the client hides it on a non-class body
});

test('dress hide shows the class body again', () => {
  const v = appearanceOf(input({ costume: '2060100200042', hideDress: true }));
  assert.equal(v.body, 'class');
  assert.equal(v.dress, undefined);
});

test('transform wins over a costume', () => {
  const v = appearanceOf(input({ costume: '2060100200042', transform: '2000000000099' }));
  assert.equal(v.res, '2000000000099');
  assert.equal(v.base, '2050070000001'); // fallback art when the transform sheet is missing
  assert.equal(v.body, 'transform');
  assert.equal(v.dress, undefined);
});

test('a fake dress replaces the worn costume only', () => {
  assert.equal(appearanceOf(input({ costume: '111', fakeDress: '222' })).res, '222');
  assert.equal(appearanceOf(input({ costume: null, fakeDress: '222' })).body, 'class'); // nothing worn: no fake look
  assert.equal(appearanceOf(input({ costume: '111', fakeDress: '222', hideDress: true })).res, '2050070000001');
});

test('flyer layers: worn art, front overlay only when set, fake flyer wins, none without a worn flyer', () => {
  const worn = appearanceOf(input({ flyer: FLYER }));
  assert.deepEqual([worn.flyer, worn.flyerFront], ['2070380000005', '2070380100005']);
  assert.equal(appearanceOf(input({ flyer: { res: '5', wav: null } })).flyerFront, undefined);
  const fake = appearanceOf(input({ flyer: FLYER, fakeFlyer: { res: '9', wav: null } }));
  assert.equal(fake.flyer, '9');
  assert.equal(fake.flyerFront, undefined);
  assert.equal(appearanceOf(input({ flyer: null, fakeFlyer: { res: '9', wav: null } })).flyer, undefined);
});

test('flying is only reported on a flyable map', () => {
  assert.equal(appearanceOf(input({ flying: true, mapFlyable: true })).flying, true);
  assert.equal(appearanceOf(input({ flying: true, mapFlyable: false })).flying, false);
});

test('mount skin is carried as state', () => {
  assert.equal(appearanceOf(input({ mount: '2050070001001' })).mount, '2050070001001');
});

test('art helpers read the template columns', () => {
  assert.equal(artCode(0), null);
  assert.equal(artCode('2060100200042'), '2060100200042');
  const fashion = { res_code: 0, res_code_male: 2060100200042, res_code_female: 2060100200043 };
  assert.equal(costumeArt(fashion, 0), '2060100200042');
  assert.equal(costumeArt(fashion, 1), '2060100200043');
  assert.equal(costumeArt({ res_code: 77 }, 1), '77');
  assert.equal(costumeArt(undefined, 0), null);
  assert.deepEqual(flyerArt({ res_code: 2070380000005, wav_code: 2070380100005 }), FLYER);
  assert.deepEqual(flyerArt({ res_code: 5, wav_code: 0 }), { res: '5', wav: null });
  assert.equal(flyerArt({ res_code: 0 }), null);
});

test('the wing art rides on the view and is absent when none is worn or it is hidden', () => {
  assert.equal(appearanceOf(input({ wing: '2070390004003' })).wing, '2070390004003');
  assert.equal('wing' in appearanceOf(input({ wing: null })), false);
  // a wing does not change the body kind
  assert.equal(appearanceOf(input({ wing: '2070390004003', costume: '2060100000001' })).body, 'dress');
});

test('the guarding fairy art rides on the view (M13 G) and is absent when none guards', () => {
  assert.equal(appearanceOf(input({ fairy: '2060100300002' })).fairy, '2060100300002');
  assert.equal('fairy' in appearanceOf(input({ fairy: null })), false);
});
