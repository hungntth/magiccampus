// Auto-battle glue for BattleController: turns the stage units into AutoUnits and builds the round's
// [characterCmd, petCmd?] batch from the auto settings (a fallen character defends, the pet still acts).

import { BattleAction, type BagItem, type BattleCommand, type LearnedSkill } from '@mc/shared';
import { toast } from '../../ui/screens';
import type { BattleStage } from './BattleStage';
import { autoCharacterCommand, autoPetCommand, type AutoUnit } from './autoBattle';
import { autoState } from './autoState';

export interface AutoRoundInput {
  stage: BattleStage;
  mySlot: number;
  petSlot: number;
  skills: readonly LearnedSkill[];
  petSkills: readonly LearnedSkill[];
  bag: readonly BagItem[];
}

function unitsOf(stage: BattleStage): AutoUnit[] {
  return [...stage.units.values()].map((u) => ({
    slot: u.slot, side: u.enemy ? 'enemy' : 'player', kind: u.isPet ? 'pet' : u.enemy ? 'creature' : 'character',
    hp: u.hp, hpMax: u.hpMax, mp: u.mp, mpMax: u.mpMax, alive: u.hp > 0,
  }));
}

export function autoRoundCommands(inp: AutoRoundInput): BattleCommand[] {
  const units = unitsOf(inp.stage);
  const settings = autoState.settings();
  const common = { units, bag: inp.bag, settings, rng: Math.random };
  const me = units.find((u) => u.slot === inp.mySlot);
  let own: BattleCommand = { tid: -1, action: BattleAction.DEFENCE, id: -1, level: -1 };
  if (me?.alive) {
    const pick = autoCharacterCommand({ ...common, self: inp.mySlot, skills: inp.skills, defend: autoState.defend(false) });
    if (pick.note) toast(pick.note, true);
    own = pick.cmd;
  }
  const pet = units.find((u) => u.slot === inp.petSlot);
  if (!pet?.alive) return [own];
  const petPick = autoPetCommand({ ...common, self: inp.petSlot, skills: inp.petSkills, defend: autoState.defend(true) });
  if (petPick.note) toast(petPick.note, true);
  return [own, petPick.cmd];
}
