// Tests for the zodiac star rules with an injected clock: begin gates, finish / cancel / speed-up, restart-safe end timestamps,
// the addition roll and multiplier, the stat formula (add_value x addition) and the shard exchange.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildStarTables } from '../gamedata/star-data';
import {
  cancelStar, completeDue, emptyStars, finishStar, parseStars, planAddition, planBegin, planExchange, rollAddition, runningType,
  speedUpStar, starBonuses, starViews, toStarsData, totalStarLevel, type StarLookup, type StarState,
} from './zodiac-rules';

// Two stars (type 1 hp, type 2 attack) with levels 1..3 each; ids 1..3 and 4..6.
const rows = [1, 2].flatMap((type) => [1, 2, 3].map((level) => ({
  id: (type - 1) * 3 + level, type, level, name: `Cung ${type}`, description: 'd', add_prop: type === 1 ? 'hp' : 'attack',
  add_value: level * (type === 1 ? 1000 : 250), req_level: 80 + (level - 1) * 5, req_money: level * 300, req_seconds: level * 30,
  req_star_level: (level - 1) * 2,
})));
const tables = buildStarTables(rows);
const look: StarLookup = { byId: (id) => tables.byId.get(id), at: (t, l) => tables.byTypeLevel.get(`${t}:${l}`) };
const T0 = 1_700_000_000_000;

const begin = (s: StarState, level: number, tpl: number, now = T0): ReturnType<typeof planBegin> => planBegin(s, look, level, tpl, now);
const withLevels = (a: number, b: number): StarState => {
  const s = emptyStars();
  s['1'].level = a;
  s['2'].level = b;
  return s;
};

describe('zodiac begin', () => {
  it('starts the first level of a star: gold price, end timestamp = now + req_seconds', () => {
    const p = begin(emptyStars(), 80, 1);
    assert.ok(p.ok);
    assert.equal(p.cost, 300);
    assert.equal(p.state['1'].finishDate, T0 + 30_000);
    assert.equal(p.state['1'].level, 0);
  });

  it('gates: player level 80, template, level order, star-level sum, player level of the row', () => {
    const note = (s: StarState, lvl: number, tpl: number): string => {
      const p = begin(s, lvl, tpl);
      return p.ok ? '' : p.note;
    };
    assert.match(note(emptyStars(), 79, 1), /cấp 80/);
    assert.match(note(emptyStars(), 80, 999), /không hợp lệ/);
    assert.match(note(emptyStars(), 80, 2), /Cấp Tinh Cung không hợp lệ/); // level 2 before level 1
    assert.match(note(withLevels(1, 0), 80, 2), /cấp 85/);
    assert.match(note(withLevels(1, 0), 85, 2), /tổng cấp/); // needs 2 total levels
    assert.equal(note(withLevels(1, 1), 85, 2), '');
  });

  it('only one level-up at a time, but a finished-and-unclaimed one is completed first', () => {
    const running = begin(emptyStars(), 80, 1);
    assert.ok(running.ok);
    const blocked = begin(running.state, 80, 4, T0 + 1000);
    assert.ok(!blocked.ok);
    assert.match(blocked.note, /Đang có/);
    const later = begin(running.state, 80, 4, T0 + 31_000); // star 1 timer elapsed: completed lazily, star 2 can start
    assert.ok(later.ok);
    assert.equal(later.state['1'].level, 1);
    assert.equal(later.state['1'].finishDate, 0);
    assert.equal(later.state['2'].finishDate, T0 + 31_000 + 30_000);
  });
});

describe('zodiac finish / cancel / speed-up', () => {
  const started = (): StarState => {
    const p = begin(emptyStars(), 80, 1);
    assert.ok(p.ok);
    return p.state;
  };

  it('finish needs the end timestamp to pass (restart safe: only the stored end matters)', () => {
    const s = started();
    const early = finishStar(s, 1, T0 + 29_999);
    assert.ok(!early.ok);
    const done = finishStar(s, 1, T0 + 30_000);
    assert.ok(done.ok);
    assert.deepEqual(done.state['1'], { level: 1, addition: 1, finishDate: 0 });
    assert.ok(!finishStar(done.state, 1, T0 + 99_000).ok); // nothing running any more
    assert.equal(runningType(s), 1);
    assert.equal(runningType(done.state), null);
  });

  it('cancel clears the timer without a level', () => {
    const c = cancelStar(started(), 1);
    assert.ok(c.ok);
    assert.equal(c.state['1'].finishDate, 0);
    assert.equal(c.state['1'].level, 0);
    assert.ok(!cancelStar(c.state, 1).ok);
  });

  it('speed-up moves the end behind now so finish succeeds at once; refused when idle or already due', () => {
    const s = started();
    const fast = speedUpStar(s, 1, T0 + 1000);
    assert.ok(fast.ok);
    assert.equal(fast.state['1'].finishDate, T0 + 999);
    assert.ok(finishStar(fast.state, 1, T0 + 1000).ok);
    assert.ok(!speedUpStar(emptyStars(), 1, T0).ok);
    assert.ok(!speedUpStar(s, 1, T0 + 40_000).ok);
  });

  it('completeDue is idempotent and keeps running timers', () => {
    const s = started();
    assert.equal(completeDue(s, T0 + 10)['1'].finishDate, T0 + 30_000);
    const once = completeDue(s, T0 + 31_000);
    assert.equal(once['1'].level, 1);
    assert.deepEqual(completeDue(once, T0 + 99_000), once);
  });

  it('parseStars survives garbage and clamps level / addition', () => {
    const p = parseStars({ stars: { '1': { level: 99, addition: 9, finishDate: -5 }, '2': { level: 'x', addition: 0.2 } } });
    assert.deepEqual(p['1'], { level: 12, addition: 5, finishDate: 0 });
    assert.deepEqual(p['2'], { level: 0, addition: 1, finishDate: 0 });
    assert.equal(Object.keys(parseStars(null)).length, 12);
    assert.equal(totalStarLevel(withLevels(2, 3)), 5);
  });
});

describe('zodiac addition', () => {
  it('plans rate and silver, refuses bad counts and the cap', () => {
    const s = emptyStars();
    const p = planAddition(s, 1, 1);
    assert.ok(p.ok);
    assert.equal(p.rate, 1);
    assert.equal(p.silver, 6000);
    assert.ok(!planAddition(s, 1, 0).ok);
    assert.ok(!planAddition(s, 13, 1).ok);
    s['1'].addition = 5;
    assert.ok(!planAddition(s, 1, 1).ok);
  });

  it('a successful roll adds 0.05 (rounded, capped), a failed one changes nothing', () => {
    const s = emptyStars();
    const win = rollAddition(s, 1, 0.5, () => 0.1);
    assert.ok(win.success);
    assert.equal(win.state['1'].addition, 1.05);
    const miss = rollAddition(s, 1, 0.5, () => 0.9);
    assert.ok(!miss.success);
    assert.equal(miss.state, s);
    s['1'].addition = 4.98;
    assert.equal(rollAddition(s, 1, 1, () => 0).state['1'].addition, 5);
  });
});

describe('zodiac stats and views', () => {
  it('stat = add_value x addition of the CURRENT level; level 0 and running timers add nothing', () => {
    const s = withLevels(2, 1);
    s['1'].addition = 1.5;
    s['2'].finishDate = T0; // the next level is running: not counted
    const b = starBonuses(s, look);
    assert.equal(b.flat.maxHp, 2000 * 1.5);
    assert.equal(b.flat.attack, 250);
    assert.deepEqual(starBonuses(emptyStars(), look).flat, {});
  });

  it('unmapped props (debuff rates) grant nothing', () => {
    const odd = buildStarTables([{ id: 1, type: 1, level: 1, add_prop: 'debuffSuccRate', add_value: 2 }]);
    const s = withLevels(1, 0);
    const b = starBonuses(s, { byId: (id) => odd.byId.get(id), at: (t, l) => odd.byTypeLevel.get(`${t}:${l}`) });
    assert.deepEqual([b.flat, b.rates], [{}, {}]);
  });

  it('wire map carries tid of the current level and the panel view the next level', () => {
    const s = withLevels(1, 0);
    const data = toStarsData(s, look);
    assert.equal(data['1'].tid, 1);
    assert.equal(data['2'].tid, 0);
    const v = starViews(s, look);
    assert.equal(v['1'].value, 1000);
    assert.equal(v['1'].next?.tid, 2);
    assert.equal(v['2'].value, 0);
    assert.equal(v['2'].name, 'Cung 2'); // falls back to the first level template
    assert.equal(starViews(withLevels(3, 0), look)['1'].next, null);
  });
});

describe('zodiac exchange', () => {
  it('only star shards swap, never the same kind, never more than the stack', () => {
    assert.ok(planExchange(3316, 3317, 5, 5).ok);
    assert.ok(!planExchange(3316, 3316, 1, 5).ok);
    assert.ok(!planExchange(3315, 3317, 1, 5).ok); // Hoa Tinh Tú is not a shard
    assert.ok(!planExchange(551, 3317, 1, 5).ok);
    assert.ok(!planExchange(3316, 3317, 6, 5).ok);
    assert.ok(!planExchange(3316, 3317, 0, 5).ok);
  });
});
