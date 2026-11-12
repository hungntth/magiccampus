// Marriage push helpers (stateless): lines to a character / the world, the wallet pair (onAddMoney + onUPP), onInitCouple, the
// seek-ad world event and the skill list refresh after couple skills are granted or revoked.

import { Injectable } from '@nestjs/common';
import type { InitCouplePush, PlayerUpdate, SysEventPush } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { SkillService } from '../skill/skill.service';
import type { Paid } from './marriage-money';

@Injectable()
export class MarriagePush {
  constructor(
    private readonly scenes: SceneManager,
    private readonly skills: SkillService,
  ) {}

  session(characterId: number): Session | undefined {
    return this.scenes.findByCharacter(characterId);
  }

  say(characterId: number, text: string): void {
    this.session(characterId)?.callback('onSystemSay', text);
  }

  world(text: string): void {
    this.scenes.broadcastAll('onSystemSay', [text]);
  }

  sysEvent(payload: SysEventPush): void {
    this.scenes.broadcastAll('onSysEvent', [payload]);
  }

  /** onInitCouple to an online character (`null` = single). */
  couple(characterId: number, payload: InitCouplePush): void {
    this.session(characterId)?.callback('onInitCouple', payload);
  }

  /** `onAddMoney(cid, key, delta, total)` then `onUPP {key: total}` per silver kind of a charge (`sign` -1) or refund (+1). */
  paid(characterId: number, paid: Paid, sign: 1 | -1): void {
    const s = this.session(characterId);
    if (!s) return;
    const one = (key: 'money' | 'moneyBind', delta: number, total: number): void => {
      if (delta === 0) return;
      s.callback('onAddMoney', characterId, key, sign * delta, total);
      const update: PlayerUpdate = { [key]: total };
      s.callback('onUPP', update);
    };
    one('moneyBind', paid.bind, paid.bindTotal);
    one('money', paid.money, paid.moneyTotal);
  }

  /** Fresh skill window rows (`onSkillUpdate` + `onMWeaponSkillUpdate(list, true)` as the skill RPCs send them). */
  async skillList(characterId: number): Promise<void> {
    const s = this.session(characterId);
    if (!s) return;
    const list = await this.skills.list(characterId);
    s.callback('onSkillUpdate', list);
    s.callback('onMWeaponSkillUpdate', list, true);
  }
}
