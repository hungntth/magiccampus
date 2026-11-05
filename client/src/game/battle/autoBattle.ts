// Pure auto-battle brain (legacy Battle.battleAuto / battlePetAuto, research 2026-11-04_17 §5): picks the character's or the
// pet's round command from the auto settings (bs/bt/p keys), the battle units, the learned skills and the bag. No DOM / Pixi.

import {
  AutoSlotKind, BattleAction, skillMpCost, type AutoBattleSettings, type AutoSettingKey, type BagItem, type BattleCommand,
  type LearnedSkill,
} from '@mc/shared';

export interface AutoUnit {
  slot: number;
  side: 'player' | 'enemy';
  kind: 'character' | 'pet' | 'creature';
  hp: number; hpMax: number; mp: number; mpMax: number;
  alive: boolean;
}

export interface AutoInput {
  units: readonly AutoUnit[];
  /** Slot of the unit being commanded (the character, or its pet). */
  self: number;
  /** Usable battle skills of that unit (character: learned battle skills; pet: its skills). */
  skills: readonly LearnedSkill[];
  bag: readonly BagItem[];
  settings: AutoBattleSettings;
  defend: boolean;
  rng: () => number;
}

export interface AutoPick { cmd: BattleCommand; note?: string }

const SKILL_TYPE_CLOSE = 1;
const SKILL_TYPE_DEFENDER = 10;
const TARGET_ENEMY = 4;
const NO_MP_CHAR = 'MP của nhân vật không đủ,hãy bổ sung!';
const NO_MP_PET = 'MP của pet không đủ,hãy bổ sung!';

/** Battle.BATTLE_POS rows 1 and 2 are the front: slots 5..9 (enemy) and 15..19 (player side). */
export const isFrontSlot = (slot: number): boolean => slot % 10 >= 5;

interface Keys { heal: number; hpP: AutoSettingKey; mpItem: AutoSettingKey; mpP: AutoSettingKey;
  team: number; teamP: AutoSettingKey; pets: number; petsP: AutoSettingKey; attack: AutoSettingKey; note: string }

const CHAR_KEYS: Keys = { heal: 1, hpP: 'p2', mpItem: 'bs9', mpP: 'p3', team: 3, teamP: 'p4', pets: 5, petsP: 'p5', attack: 'bs7', note: NO_MP_CHAR };
const PET_KEYS: Keys = { heal: 2, hpP: 'p6', mpItem: 'bs10', mpP: 'p7', team: 4, teamP: 'p8', pets: 6, petsP: 'p9', attack: 'bs8', note: NO_MP_PET };

export function autoCharacterCommand(input: AutoInput): AutoPick {
  return chain(input, CHAR_KEYS);
}

/** `input.self` is the pet's slot and `input.skills` its skills. */
export function autoPetCommand(input: AutoInput): AutoPick {
  return chain(input, PET_KEYS);
}

function chain(inp: AutoInput, k: Keys): AutoPick {
  const self = inp.units.find((u) => u.slot === inp.self);
  const s = inp.settings;
  const get = (key: string): number => Number((s as Record<string, number | undefined>)[key] ?? 0);
  if (self) {
    // 1 self HP, 2 self MP item, 3 heal a character, 4 heal a pet
    if (get(`bs${k.heal}`) > 0 && pct(self.hp, self.hpMax) < get(k.hpP)) {
      const c = slotCommand(inp, k.heal, self.slot);
      if (c) return { cmd: c };
    }
    if (get(k.mpItem) > 0 && pct(self.mp, self.mpMax) < get(k.mpP)) {
      const c = itemCommand(inp, get(k.mpItem), self.slot);
      if (c) return { cmd: c };
    }
    for (const [slotKey, pKey, kind] of [[k.team, k.teamP, 'character'], [k.pets, k.petsP, 'pet']] as const) {
      if (get(`bs${slotKey}`) <= 0) continue;
      for (const ally of inp.units) {
        if (ally.side !== self.side || ally.kind !== kind || !ally.alive || pct(ally.hp, ally.hpMax) >= get(pKey)) continue;
        const c = slotCommand(inp, slotKey, ally.slot);
        if (c) return { cmd: c };
      }
    }
  }
  // 5 auto-defence
  if (inp.defend) return { cmd: { tid: -1, action: BattleAction.DEFENCE, id: -1, level: -1 } };
  // 6 attack skill, 7 basic attack
  const sid = get(k.attack);
  const sk = sid > 0 ? inp.skills.find((x) => x.sid === sid) : undefined;
  let note: string | undefined;
  if (sk && self) {
    if (skillMpCost(sk.useMp, self.mpMax) > self.mp) note = k.note;
    else {
      let tid = randomEnemy(inp)?.slot ?? -1;
      if (sk.type === SKILL_TYPE_DEFENDER) tid = pick(inp.units.filter((u) => u.side === self.side && u.alive), inp.rng)?.slot ?? self.slot;
      else if (sk.type === SKILL_TYPE_CLOSE && !isFrontSlot(self.slot)) tid = randomFrontEnemy(inp)?.slot ?? tid;
      return { cmd: { tid, action: BattleAction.SKILL, id: sk.sid, level: sk.level } };
    }
  }
  const back = !isFrontSlot(inp.self);
  const target = (back ? randomFrontEnemy(inp) : undefined) ?? randomEnemy(inp);
  return { cmd: { tid: target?.slot ?? -1, action: BattleAction.ATTACK, id: 0, level: -1 }, ...(note ? { note } : {}) };
}

/** bt<N>/bs<N> heal slot aimed at `targetSlot`: a skill (enemy-target skills hit a random enemy) or an item on self only. */
function slotCommand(inp: AutoInput, n: number, targetSlot: number): BattleCommand | null {
  const s = inp.settings as Record<string, number | undefined>;
  const id = Number(s[`bs${n}`] ?? 0);
  if (Number(s[`bt${n}`] ?? 0) === AutoSlotKind.SKILL) {
    const sk = inp.skills.find((x) => x.sid === id);
    if (!sk) return null;
    const unit = inp.units.find((u) => u.slot === inp.self);
    if (unit && skillMpCost(sk.useMp, unit.mpMax) > unit.mp) return null;
    const tid = sk.targetType === TARGET_ENEMY ? randomEnemy(inp)?.slot ?? -1 : targetSlot;
    return { tid, action: BattleAction.SKILL, id: sk.sid, level: sk.level };
  }
  // The server's ITEM heals the submitting fighter only: items on another unit are skipped.
  return targetSlot === inp.self ? itemCommand(inp, id, targetSlot) : null;
}

function itemCommand(inp: AutoInput, tid: number, targetSlot: number): BattleCommand | null {
  const item = inp.bag.find((b) => b.tid === tid && b.stackNum > 0);
  return item ? { tid: targetSlot, action: BattleAction.ITEM, id: item.id, level: -1 } : null;
}

const pct = (v: number, max: number): number => (max > 0 ? (v / max) * 100 : 100);

function pick<T>(list: readonly T[], rng: () => number): T | undefined {
  return list.length ? list[Math.min(list.length - 1, Math.floor(rng() * list.length))] : undefined;
}

function enemiesOf(inp: AutoInput): AutoUnit[] {
  const self = inp.units.find((u) => u.slot === inp.self);
  const side = self?.side ?? 'player';
  return inp.units.filter((u) => u.side !== side && u.alive);
}

const randomEnemy = (inp: AutoInput): AutoUnit | undefined => pick(enemiesOf(inp), inp.rng);

/** Alive enemies not standing behind a living unit (back slot n is covered by front slot n + 5). */
function randomFrontEnemy(inp: AutoInput): AutoUnit | undefined {
  const alive = enemiesOf(inp);
  const bySlot = new Set(alive.map((u) => u.slot));
  return pick(alive.filter((u) => isFrontSlot(u.slot) || !bySlot.has(u.slot + 5)), inp.rng);
}
