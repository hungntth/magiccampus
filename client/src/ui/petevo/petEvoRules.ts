// Pure helpers of the Tiến hóa window and the Sách Tiến Hóa book: which pets can evolve / feather, the Vũ Hóa aptitude table and
// try plan (mirrors Flash PetEvolutionPanel.toFeather), the Khế Ước row figures and the handbook bonus texts. Data comes from
// @mc/shared (feather tables, handbook / contract statics); nothing here touches the DOM.

import {
  advanceFeather, featherAptitudes, featherAtCap, featherNpCost, featherProtectNeed, FEATHER_SUCCESS, normalizeFeather,
  PET_APTITUDE_KEYS, PET_CONTRACT_KEYS, PET_CONTRACT_MAX_LEVEL, PET_SERIE_PROP, hasFeatherTable, contractBonusPercent, petContractRowOf,
  petHandbookByCreature, type ActivePetObject, type FeatherAptitudes, type PetAptitudeKey, type PetContract, type PetContractReply,
  type PetEvolutionInfo, type PetFeatherReply, type PetHandbookDef, type PetHandbookEntry, type PetView,
} from '@mc/shared';
import { aptBase } from '../petfunc/petFuncRules';
import { EVO_TEXT, featherDown, featherUp, HANDBOOK_PROP_NAMES } from './petEvoText';

/** Level the Flash book demands before a pet may evolve (PET_HANDBOOK_PANEL_U[112]). */
export const EVOLVE_MIN_LEVEL = 120;
/** Class id of the hunter (extra column of the contract bonus). */
export const HUNTER_CLASS = 5;

const byTidThenGrow = (a: PetView, b: PetView): number => b.tid - a.tid || b.growRate - a.growRate;
export const isEvolved = (pet: PetView): boolean => pet.envoInfo?.envo === true;

/** Pets the Tiến Hóa tab lists: not evolved yet and with an evolvable handbook entry (Flash getEvolutionAblePets). */
export const evolvablePets = (pets: readonly PetView[]): PetView[] =>
  pets.filter((p) => !isEvolved(p) && petHandbookByCreature(p.tid) !== undefined).sort(byTidThenGrow);

/** Pets the Vũ Hóa tab lists: every evolved pet (Flash getEvolutionPets); `canFeather` tells whether it has a table. */
export const evolvedPets = (pets: readonly PetView[]): PetView[] => pets.filter(isEvolved).sort(byTidThenGrow);
export const canFeather = (pet: PetView): boolean => isEvolved(pet) && hasFeatherTable(pet.tid);

/** Activation state of a handbook entry from the login / push object. */
export function entryState(all: ActivePetObject | undefined, def: Pick<PetHandbookDef, 'id'>): PetHandbookEntry {
  return all?.[String(def.id)] ?? { pid: def.id, actived: false, activedNum: 0 };
}

export type EvolveGate = { ok: true } | { ok: false; text: string };

/** Client gates of the Evolve button, in the order Flash / the server check them (the server stays authoritative). */
export function evolveGate(pet: PetView, def: PetHandbookDef, all: ActivePetObject | undefined, playerLevel: number): EvolveGate {
  if (playerLevel < EVOLVE_MIN_LEVEL) return { ok: false, text: EVO_TEXT.levelGate };
  if (!pet.binded) return { ok: false, text: EVO_TEXT.unbound };
  if (!entryState(all, def).actived) return { ok: false, text: `Cần kích hoạt ${def.name} trong ${EVO_TEXT.book} trước` };
  return { ok: true };
}

const FEATHER_KEYS: Readonly<Record<PetAptitudeKey, keyof FeatherAptitudes>> = {
  strength: 'str', agility: 'agi', stamina: 'sta', intelligence: 'int', energy: 'eng',
};

export interface FeatherRow { key: PetAptitudeKey; base: number; feather: number; next: number; }

/** Vũ Hóa table rows: instance base, current feather total and the total after one success. */
export function featherRows(pet: PetView, info: PetEvolutionInfo): FeatherRow[] {
  const now = featherAptitudes(pet.tid, info);
  const next = featherAptitudes(pet.tid, advanceFeather(normalizeFeather(info), 1));
  return PET_APTITUDE_KEYS.map((key) => ({ key, base: aptBase(pet, key), feather: now[FEATHER_KEYS[key]], next: next[FEATHER_KEYS[key]] }));
}

export type FeatherPlan = { ok: true; np: number; charms: number; rate: number } | { ok: false; text: string };

/** What one toPetFeather try needs and whether the client may send it (Flash toFeather checks, same refusal texts). */
export function featherPlan(raw: PetEvolutionInfo, np: number, charmsHeld: number, protect: boolean): FeatherPlan {
  const info = normalizeFeather(raw);
  if (featherAtCap(info)) return { ok: false, text: EVO_TEXT.featherCap };
  const cost = featherNpCost(info);
  if (cost > np) return { ok: false, text: EVO_TEXT.noNp };
  const charms = protect ? featherProtectNeed(info) : 0;
  if (charms > charmsHeld) return { ok: false, text: EVO_TEXT.noCharm };
  return { ok: true, np: cost, charms, rate: FEATHER_SUCCESS[info.round]?.[info.stage] ?? 0 };
}

/** Chat line of a feather result (Flash resultInfo): realm and stage are shown 1-based / as is. */
export function featherMessage(before: PetEvolutionInfo, r: PetFeatherReply): string {
  if (r.success) return before.round === r.round ? featherUp(r.round + 1, r.stage) : EVO_TEXT.featherRealm;
  return before.stage === r.stage ? EVO_TEXT.featherFail : featherDown(r.round + 1, r.stage);
}

export interface ContractFigures {
  type: number;
  level: number;
  exp: number;
  /** Exp that fills the bar (the next level's req_exp); 0 at the cap. */
  expMax: number;
  /** Stones one attempt eats at the next level. */
  stones: number;
  now: number;
  next: number;
  maxed: boolean;
}

/** Level / exp / next-level cost and bonus percents of one contract type from PlayerData.contractPet. */
export function contractFigures(state: Partial<PetContract> | undefined, type: number, hunter: boolean): ContractFigures {
  const key = PET_CONTRACT_KEYS[type];
  const level = Math.min(PET_CONTRACT_MAX_LEVEL, Math.max(0, Math.trunc(Number(state?.[key] ?? 0)) || 0));
  const exp = Math.max(0, Math.trunc(Number(state?.[`${key}Exp` as keyof PetContract] ?? 0)) || 0);
  const maxed = level >= PET_CONTRACT_MAX_LEVEL;
  const row = maxed ? undefined : petContractRowOf(level + 1);
  return {
    type, level, exp: maxed ? 0 : exp, expMax: row?.reqExp ?? 0, stones: row?.reqNum ?? 0, maxed,
    now: contractBonusPercent(type, level, hunter), next: maxed ? 0 : contractBonusPercent(type, level + 1, hunter),
  };
}

/** The contract state after a reply {type, newLvl, newExp}. */
export function applyContractReply(state: Partial<PetContract> | undefined, r: PetContractReply): PetContract {
  const key = PET_CONTRACT_KEYS[r.type];
  return { hp: 0, hpExp: 0, speed: 0, speedExp: 0, physics: 0, physicsExp: 0, magic: 0, magicExp: 0, ...state, [key]: r.newLvl, [`${key}Exp`]: r.newExp };
}

/** "Hp +480" / "Bạo +1%" bonus text of one prop. */
export const propText = (propType: number, propNum: number, percent: boolean): string =>
  `${HANDBOOK_PROP_NAMES[propType] ?? `#${propType}`} +${propNum}${percent ? '%' : ''}`;

/** Bonus of a handbook entry once active (empty when none). */
export const entryBonusText = (def: PetHandbookDef): string => (def.propType > 0 ? propText(def.propType, def.propNum, def.percent) : '');

/** Bonus a fully activated series adds (PET_SERIE_PROP; series 9 / 10 have none). */
export const serieBonusText = (classId: number): string =>
  (PET_SERIE_PROP[classId] ?? []).map((p) => propText(p.propType, p.propNum, p.percent)).join(', ');
