// Pure roll of a crafted equipment instance (legacy craft.go R26): lines re-rolled between EQUIPT_QUALITY[q-1] and
// [q] of the template value, bind bonus, 1-3 pre-drilled holes (40/35/25 %), random element, maker name.

import { MAX_HOLES, qualityMultiplier, type EquipProperties } from '@mc/shared';
import { randInt, type Rng } from './craft-rules';

type Tpl = Record<string, unknown>;
const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

interface Line {
  prop: number;
  num: number;
}

/** Template lines with a prop id, in slot order. */
function templateLines(tpl: Tpl, propKey: string, numKey: string): Line[] {
  const out: Line[] = [];
  for (const n of [1, 2]) {
    const prop = int(tpl[`${propKey}${n}`]);
    if (prop > 0) out.push({ prop, num: int(tpl[`${numKey}${n}`]) });
  }
  return out;
}

/** Fisher-Yates over a copy. */
function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One rolled value: between floor(base * M[q-1]) and floor(base * M[q]). */
export function rollLineValue(base: number, quality: number, rng: Rng): number {
  const lo = Math.floor(base * qualityMultiplier(quality - 1));
  const hi = Math.floor(base * qualityMultiplier(quality));
  return randInt(lo, hi, rng);
}

/** 1 hole 40 %, 2 holes 35 %, 3 holes 25 %. */
export function rollHoles(rng: Rng): number {
  const u = rng();
  return u < 0.4 ? 1 : u < 0.75 ? 2 : 3;
}

/** Element 1..6. */
export const rollElement = (rng: Rng): number => 1 + Math.floor(rng() * 6);

/** Full instance properties of a crafted piece. Lines are shuffled within main and within secondary groups. */
export function rollCraftedProperties(
  tpl: Tpl, quality: number, prefix: number, maker: string, rng: Rng,
): EquipProperties {
  const props: EquipProperties = { quality, prefix, element: rollElement(rng), makerName: maker };
  const main = shuffled(templateLines(tpl, 'main_prop', 'main_prop_num'), rng);
  main.forEach((l, i) => {
    const n = i + 1;
    if (n === 1) {
      props.mainProp1 = l.prop;
      props.mainPropNum1 = rollLineValue(l.num, quality, rng);
    } else {
      props.mainProp2 = l.prop;
      props.mainPropNum2 = rollLineValue(l.num, quality, rng);
    }
  });
  const sub = shuffled(templateLines(tpl, 'prop', 'prop_num'), rng);
  sub.forEach((l, i) => {
    if (i === 0) {
      props.prop1 = l.prop;
      props.propNum1 = rollLineValue(l.num, quality, rng);
    } else {
      props.prop2 = l.prop;
      props.propNum2 = rollLineValue(l.num, quality, rng);
    }
  });
  const bind = int(tpl.bind_prop_num);
  const bindMax = quality >= 6 ? Math.floor(bind * qualityMultiplier(quality)) : 0;
  props.bindMainPropNum1 = randInt(0, bindMax, rng);
  props.bindMainPropNum2 = randInt(0, bindMax, rng);
  const holes = Math.min(MAX_HOLES, rollHoles(rng));
  props.holeNum = holes;
  for (let i = 1; i <= holes; i++) props[`t${i}`] = 0;
  return props;
}
