// Skill RPCs: initLearnedSkill() -> LearnedSkill[]; skillLearnByClient(nextSid, position?) -> boolean; addTrainingSkill(sid) -> null;
// getSkillLearnList() -> SkillLearnView[] (H5 helper: the skill window rows). Pushes: onUPP {expSkill, exp, money, moneyBind},
// onSkillUpdate, onMWeaponSkillUpdate, stat-refresh onUPP (passives); failures onSystemSay(msg).

import { Injectable } from '@nestjs/common';
import type { LearnedSkill, SkillLearnView } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { sendPushes } from '../inventory/pushes';
import { SkillLearnService } from './skill-learn.service';
import { SkillService } from './skill.service';

const sidArg = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs('sid');
  return n;
};

@Injectable()
export class SkillRpc {
  constructor(
    private readonly skills: SkillService,
    private readonly learn: SkillLearnService,
  ) {}

  @Rpc('initLearnedSkill', { requireCharacter: true })
  async initLearnedSkill(session: Session): Promise<LearnedSkill[]> {
    return this.skills.list(session.characterId!);
  }

  @Rpc('getSkillLearnList', { requireCharacter: true })
  async getSkillLearnList(session: Session): Promise<SkillLearnView[]> {
    return this.learn.learnList(session.characterId!);
  }

  @Rpc('skillLearnByClient', { requireCharacter: true, forbidInBattle: true })
  async skillLearnByClient(session: Session, args: unknown[]): Promise<boolean> {
    const res = await this.learn.upgrade(session.characterId!, sidArg(args[0]));
    if (!res.ok) {
      session.callback('onSystemSay', res.err);
      return false;
    }
    sendPushes(session, res.pushes);
    return true;
  }

  @Rpc('addTrainingSkill', { requireCharacter: true, forbidInBattle: true })
  async addTrainingSkill(session: Session, args: unknown[]): Promise<null> {
    const res = await this.learn.learnTraining(session.characterId!, sidArg(args[0]));
    if (res.ok) {
      sendPushes(session, res.pushes);
      return null;
    }
    session.callback('onSystemSay', res.err);
    const list = await this.skills.list(session.characterId!);
    session.callback('onSkillUpdate', list);
    session.callback('onMWeaponSkillUpdate', list, true);
    return null;
  }
}
