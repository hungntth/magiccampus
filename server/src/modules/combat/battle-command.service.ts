// Turns a player's wire command (battleUpdateCmd) into the round's PlayerCommand for that member's own fighter: target
// validation, skill ownership / MP plan (planCast) and potion consumption (spend before credit). Pure parse at the bottom.

import { Injectable } from '@nestjs/common';
import { BattleAction, type BattleCommand } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { sendPushes } from '../inventory/pushes';
import { UseItemService } from '../inventory/use-item.service';
import { SkillService } from '../skill/skill.service';
import type { Battle, Fighter, PlayerCommand } from './battle.types';
import { planCast } from './skill-cast';

@Injectable()
export class BattleCommandService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly useItem: UseItemService,
    private readonly skills: SkillService,
  ) {}

  /** `own` is the submitting member's fighter (its slot, HP and MP). */
  async resolve(session: Session, battle: Battle, own: Fighter, cmd: BattleCommand): Promise<PlayerCommand> {
    switch (cmd.action) {
      case BattleAction.ATTACK: {
        const target = battle.fighters.get(cmd.tid);
        if (!target || target.side !== 'enemy' || !target.alive) throw RpcException.invalidArgs('tid');
        return { action: BattleAction.ATTACK, targetSlot: target.slot };
      }
      case BattleAction.SKILL:
        return this.resolveSkill(session, battle, own, cmd);
      case BattleAction.DEFENCE:
      case BattleAction.ESCAPE:
      case BattleAction.TIMEOUT:
        return { action: cmd.action, targetSlot: -1 };
      case BattleAction.ITEM: {
        const room = { hp: own.hpMax - own.hp, mp: own.mpMax - own.mp };
        const used = await this.useItem.consumeForBattle(session.characterId!, cmd.id, room);
        sendPushes(session, used.pushes);
        return { action: BattleAction.ITEM, targetSlot: own.slot, heal: used.heal };
      }
      default:
        throw RpcException.invalidArgs('action');
    }
  }

  /** -50: ownership, passive / unsupported refusal, MP check (short on MP = basic attack on the target), then the cast. */
  private async resolveSkill(session: Session, battle: Battle, own: Fighter, cmd: BattleCommand): Promise<PlayerCommand> {
    const tpl = this.gameData.skill(cmd.id);
    if (!tpl) throw RpcException.invalidArgs('id');
    if (!(await this.skills.owns(session.characterId!, tpl.id))) throw RpcException.forbidden('Bạn chưa học kỹ năng này');
    const plan = planCast(tpl, own.mp, own.mpMax);
    if (plan.kind === 'refused') {
      throw RpcException.forbidden(plan.reason === 'passive' ? 'Không thể sử dụng kỹ năng bị động' : 'Kỹ năng chưa được hỗ trợ');
    }
    const self = plan.kind === 'cast' && plan.cast.category === 'heal';
    const alive = [...battle.fighters.values()].filter((f) => f.side === 'enemy' && f.alive);
    let target = battle.fighters.get(cmd.tid);
    if (!self && (!target || target.side !== 'enemy' || !target.alive)) {
      // A fallback attack may arrive with a self target (heal skill without MP): hit the first living enemy.
      if (plan.kind !== 'basic') throw RpcException.invalidArgs('tid');
      target = alive[0];
    }
    if (!self && !target) throw RpcException.invalidArgs('tid');
    return {
      action: BattleAction.ATTACK, targetSlot: self ? own.slot : target!.slot,
      ...(plan.kind === 'cast' ? { skill: plan.cast } : {}),
    };
  }
}

/** battleUpdateCmd sends `[{tid, action, id, level}]`; only the first command matters (no pets). */
export function parseCommand(raw: unknown): BattleCommand {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === null || typeof first !== 'object') throw RpcException.invalidArgs('cmd');
  const o = first as Record<string, unknown>;
  const num = (v: unknown, d: number): number => (v === undefined || v === null ? d : Number(v));
  const cmd: BattleCommand = { tid: num(o.tid, -1), action: Number(o.action), id: num(o.id, -1), level: num(o.level, -1) };
  if (!Number.isInteger(cmd.action) || !Number.isFinite(cmd.tid) || !Number.isFinite(cmd.id)) throw RpcException.invalidArgs('cmd');
  return cmd;
}
