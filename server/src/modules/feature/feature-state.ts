// Persisted state shapes of the stat features (character_features documents) and their defensive parsers: train soul
// (`train_soul`), awakening (`awakening`), war sprite (`war_sprite`), magic crystal (`magic_crystal`). Pure, no Nest / Mongoose.

import { emptyCrystals, MAGIC_CRYSTAL, WAR_SPRITE, type CrystalSlot, type MagicCrystalData, type WspState } from '@mc/shared';

export const FEATURE_KEYS = {
  soul: 'train_soul',
  awaken: 'awakening',
  warSprite: 'war_sprite',
  crystal: 'magic_crystal',
  heiyaoshi: 'heiyaoshi',
  zodiac: 'zodiac_stars',
} as const;

type Raw = Record<string, unknown> | null | undefined;

const nonNeg = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const recordOf = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

// --- Train soul: level 0..100, exp = progress inside the level ---

export interface SoulState {
  lvl: number;
  exp: number;
}

export function parseSoul(raw: Raw): SoulState {
  return { lvl: nonNeg(raw?.lvl), exp: nonNeg(raw?.exp) };
}

// --- Awakening: level 0..77, talent points, the pity counter ---

export interface AwakenState {
  level: number;
  point: number;
  pointUsed: number;
  pointDict: Record<string, number>;
  awakenAdd: number;
}

export function parseAwaken(raw: Raw): AwakenState {
  const dict: Record<string, number> = {};
  for (const [k, v] of Object.entries(recordOf(raw?.pointDict))) {
    const n = nonNeg(v);
    if (n > 0) dict[k] = n;
  }
  return { level: nonNeg(raw?.level), point: nonNeg(raw?.point), pointUsed: nonNeg(raw?.pointUsed), pointDict: dict, awakenAdd: nonNeg(raw?.awakenAdd) };
}

// --- War sprite: current template id per sprite (1..8) of both chains, lazily the chain roots ---

export function defaultWsp(): WspState {
  const wObj: Record<string, number> = {};
  const bObj: Record<string, number> = {};
  for (let i = 0; i < WAR_SPRITE.SLOTS; i++) {
    wObj[String(i + 1)] = WAR_SPRITE.WAR_ROOTS[i];
    bObj[String(i + 1)] = WAR_SPRITE.BATTLE_ROOTS[i];
  }
  return { wObj, bObj };
}

export function parseWsp(raw: Raw): WspState {
  const out = defaultWsp();
  for (const [key, src] of [['wObj', recordOf(raw?.wObj)], ['bObj', recordOf(raw?.bObj)]] as const) {
    for (const k of Object.keys(out[key])) {
      const id = nonNeg(src[k]);
      if (id > 0) out[key][k] = id;
    }
  }
  return out;
}

// --- Magic crystal: 16 pools ---

export function parseCrystals(raw: Raw): MagicCrystalData {
  const out = emptyCrystals();
  const src = recordOf(raw?.crystals);
  for (let i = 0; i < MAGIC_CRYSTAL.SLOTS; i++) {
    const c = recordOf(src[String(i)]);
    const slot: CrystalSlot = { a: Number(c.a) === 1 ? 1 : 0, max: nonNeg(c.max), l: nonNeg(c.l), s: nonNeg(c.s), lv: Math.min(nonNeg(c.lv), MAGIC_CRYSTAL.MAX_LEVEL) };
    out[String(i)] = slot;
  }
  return out;
}
