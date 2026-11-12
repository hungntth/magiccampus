// Unit coverage for the locally authored Ninja Bóng Đêm equipment template.

import assert from 'node:assert/strict';
import test from 'node:test';
import { NINJA_SHADOW_EQUIP_ID, NINJA_SHADOW_RES_CODE, customTemplate } from './custom-templates';

test('Ninja Bóng Đêm is a wearable costume template with a creature art code', () => {
  const template = customTemplate(19, NINJA_SHADOW_EQUIP_ID);
  assert.equal(template?.kind, 11);
  assert.equal(template?.position, 21);
  assert.equal(template?.res_code_male, NINJA_SHADOW_RES_CODE);
  assert.equal(template?.res_code_female, NINJA_SHADOW_RES_CODE);
});

test('Ninja Bóng Đêm does not shadow a non-equipment template', () => {
  assert.equal(customTemplate(29, NINJA_SHADOW_EQUIP_ID), undefined);
});
