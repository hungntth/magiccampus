// The character's skill half of the battle menu, split out of BattleController: the learned battle skills
// (initLearnedSkill at battle start) and the pick flow (MP pre-check, self skills go out at once, others wait for a click).

import {
  BattleAction, isBattleSkill, skillMpCost, skillNoMpMessage, skillTargetsEnemy, type BattleCommand, type LearnedSkill,
} from '@mc/shared';
import type { GameClient } from '../../net/client';
import { toast } from '../../ui/screens';
import type { BattleStage } from './BattleStage';
import { skillCmd } from './commands';

export class SkillPick {
  /** Usable battle skills, reloaded at every battle start. */
  skills: LearnedSkill[] = [];
  /** Chosen skill waiting for an enemy click. */
  pending: LearnedSkill | null = null;

  async load(client: GameClient, current: () => boolean): Promise<void> {
    this.pending = null;
    try {
      const list = await client.call<LearnedSkill[]>('initLearnedSkill');
      if (current()) this.skills = list.filter((s) => isBattleSkill(s.type));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  /** Core.checkSkillRequire then send (self skills) or arm the enemy pick. */
  use(sk: LearnedSkill, stage: BattleStage | null, mySlot: number, send: (cmd: BattleCommand) => void): void {
    const unit = stage?.units.get(mySlot);
    if (unit && skillMpCost(sk.useMp, unit.mpMax) > unit.mp) return void toast(skillNoMpMessage(sk.name), true);
    if (!skillTargetsEnemy(sk.type)) return send(skillCmd(sk, mySlot));
    this.pending = sk;
    stage?.setPicking(true);
    toast(`Chọn mục tiêu cho [${sk.name}]`);
  }

  /** Enemy click: the armed skill or a basic attack. */
  commandFor(slot: number): BattleCommand {
    const sk = this.pending;
    return sk ? skillCmd(sk, slot) : { tid: slot, action: BattleAction.ATTACK, id: 0, level: -1 };
  }
}
