// Skill RPCs: initLearnedSkill() -> LearnedSkill[].

import { Injectable } from '@nestjs/common';
import type { LearnedSkill } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { SkillService } from './skill.service';

@Injectable()
export class SkillRpc {
  constructor(private readonly skills: SkillService) {}

  @Rpc('initLearnedSkill', { requireCharacter: true })
  async initLearnedSkill(session: Session): Promise<LearnedSkill[]> {
    return this.skills.list(session.characterId!);
  }
}
