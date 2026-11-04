// StatBonusProvider registry parity: the migrated gear / buff / guild-skill split gives exactly the old single-buffBonuses result,
// and the title provider rules (both titles apply, expired / missing ones do not).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buffBonuses } from '../buff/buff-stats';
import { assembleStats, emptyBonuses, mergeBonuses, type Bonuses, type StatProfile } from '../character/character-stats';
import type { Character } from '../character/character.schema';
import { titleBuffTemplates } from '../title/title-rules';
import { collectBonuses, type StatBonusProvider } from './stat-provider';

const doc = {} as Character;
const fake = (key: string, b: Bonuses): StatBonusProvider => ({ key, bonuses: async () => b });
const prof: StatProfile = {
  attrs: { str: 12, agi: 9, sta: 14, int: 8, eng: 7 },
  apt: { str: 2000, agi: 1500, sta: 2200, int: 1800, eng: 1600 },
};

const gearLike = (() => {
  const b = emptyBonuses();
  b.attr.str = 5;
  b.flat.attack = 40;
  b.flat.hit = 0.5;
  b.pct.maxHp = 3;
  b.rates.finalCombo = 2;
  return b;
})();
const buffTpls = [{ percent_flag: 1, prop1: 1, prop_num1: 5 }, { percent_flag: 0, prop1: 10, prop_num1: 88, prop2: 6, prop_num2: 30 }];
const guildTpls = [{ percent_flag: 0, prop1: 4, prop_num1: 150 }, { percent_flag: 0, prop1: 59, prop_num1: 3 }];

describe('collectBonuses', () => {
  it('equals the old merge(gear, buffBonuses(buffs + guild skills)) for the final stats', () => {
    const old = mergeBonuses(structuredClone(gearLike), buffBonuses([...buffTpls, ...guildTpls]));
    const providers = [fake('gear', structuredClone(gearLike)), fake('buffs', buffBonuses(buffTpls)), fake('guild', buffBonuses(guildTpls))];
    const got = collectBonuses(providers, 1, doc);
    return got.then((b) => {
      assert.deepEqual(b, old);
      assert.deepEqual(assembleStats(prof, b), assembleStats(prof, old));
    });
  });

  it('no providers = no bonuses; order does not matter', async () => {
    assert.deepEqual(await collectBonuses([], 1, doc), emptyBonuses());
    const a = [fake('a', gearLike), fake('b', buffBonuses(buffTpls))];
    assert.deepEqual(await collectBonuses(a, 1, doc), await collectBonuses([...a].reverse(), 1, doc));
  });
});

describe('titleBuffTemplates', () => {
  const titles = new Map([[1, { b: 546 }], [2, { b: 0 }], [3, { b: 9999 }], [4, { b: 2822 }]]);
  const buffs = new Map([[546, { id: 546, prop1: 1, prop_num1: 3, percent_flag: 1 }], [2822, { id: 2822, prop1: 1, prop_num1: 5, percent_flag: 1 }]]);
  const tplOf = (id: number): Record<string, unknown> | undefined => titles.get(id);
  const buffOf = (id: number): Record<string, unknown> | undefined => buffs.get(id);

  it('uses `b`, skips b = 0, unknown buffs and non-positive ids; both active titles stack', () => {
    assert.deepEqual(titleBuffTemplates([1, 2, 3, 0, -1], tplOf, buffOf).map((t) => t.id), [546]);
    const both = titleBuffTemplates([1, 4], tplOf, buffOf);
    assert.deepEqual(both.map((t) => t.id), [546, 2822]);
    assert.deepEqual(buffBonuses(both).pct, { maxHp: 8 });
  });

  it('the same title in both slots counts once', () => {
    assert.equal(titleBuffTemplates([1, 1], tplOf, buffOf).length, 1);
  });
});
