// Guild skill stat effect: which buff ids the effective learned skills give, and the stat bonuses those buffs produce
// through the shared buff pipeline (buffBonuses), including the cap by the guild's developed level.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GuildSkillRow } from '@mc/shared';
import { buffBonuses } from '../buff/buff-stats';
import { buildGuildBuildingTables, buildGuildSkillTables } from '../gamedata/guild-data';
import { guildSkillBuffIds } from './guild-skill-buffs';

const row = (id: number, level: number, buffId: number): GuildSkillRow => ({
  id, chain: 'SKILL700101', level, name: 'Cự Man Lực', description: '', iconCode: '0', devExp: 1, devMoney: 1, contrib: 1, buffId, reqLevel: 1, reqClasses: [],
});
const chains = new Map([['SKILL700101', [row(1, 1, 1316), row(2, 2, 1320), row(3, 3, 1321)]]]);

describe('guildSkillBuffIds', () => {
  it('uses the learned level when the guild developed at least that much', () => {
    assert.deepEqual(guildSkillBuffIds([{ chain: 'SKILL700101', sid: 2, level: 2 }], { SKILL700101: 3 }, chains), [1320]);
  });

  it('caps by the developed level and gives nothing from an undeveloped chain', () => {
    assert.deepEqual(guildSkillBuffIds([{ chain: 'SKILL700101', sid: 3, level: 3 }], { SKILL700101: 1 }, chains), [1316]);
    assert.deepEqual(guildSkillBuffIds([{ chain: 'SKILL700101', sid: 3, level: 3 }], {}, chains), []);
  });

  it('the buff template props become the stat bonus (physical attack +150 at level 2)', () => {
    const ids = guildSkillBuffIds([{ chain: 'SKILL700101', sid: 2, level: 2 }], { SKILL700101: 2 }, chains);
    assert.deepEqual(ids, [1320]);
    const b = buffBonuses([{ percent_flag: 0, prop1: 4, prop_num1: 150 }]); // data_tbl_buff 1320
    assert.equal(b.flat.attack, 150);
  });
});

describe('guild static data builders', () => {
  it('buildings: prerequisites parse from the pipe list, null costs become 0', () => {
    const t = buildGuildBuildingTables(
      [{ id: 6, code_name: 'BUILD100001', level: 2, type: 1, pre_building: '2|3|5', money_cost: 10, sp_m_cost: null, num_limit: 1 }, { id: 2, code_name: 'BUILD100001', level: 1, type: 1, pre_building: null }],
      [{ id: 2, mid: 49, pos_x: 5, pos_y: 6 }, { id: 1, mid: 49, pos_x: 1, pos_y: 2 }],
    );
    assert.deepEqual(t.rows.get(6)!.pre, [2, 3, 5]);
    assert.equal(t.rows.get(6)!.spCost, 0);
    assert.deepEqual(t.rows.get(2)!.pre, []);
    assert.deepEqual(t.lots.map((l) => l.id), [1, 2]);
  });

  it('skills: only use_env 4 rows with a develop cost; chains merge the NO variants and sort by level', () => {
    const t = buildGuildSkillTables([
      { id: 11, code_name: 'SKILL1NO', level: 7, use_env: 4, guild_dev_exp: 5, buff_id: 9 },
      { id: 10, code_name: 'SKILL1', level: 6, use_env: 4, guild_dev_exp: 5, buff_id: 8, req_class: '|1|2|' },
      { id: 12, code_name: 'SKILL1NO', level: 8, use_env: 4, guild_dev_exp: 0 },
      { id: 13, code_name: 'OTHER', level: 1, use_env: 1, guild_dev_exp: 5 },
    ]);
    assert.deepEqual(t.chains.get('SKILL1')!.map((r) => r.level), [6, 7]);
    assert.deepEqual(t.byId.get(10)!.reqClasses, [1, 2]);
    assert.equal(t.byId.has(12), false);
    assert.equal(t.byId.has(13), false);
  });
});
