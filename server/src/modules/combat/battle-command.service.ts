// Turns a player's wire command (battleUpdateCmd) into the round's PlayerCommand for that member's own fighter: target
// validation, skill ownership / MP plan (planCast) and potion consumption (spend before credit). A pet fighter gets the same
// attack / skill / defence / item handling (skill must be in its slots, uses its MP; items come from the owner's bag and heal the pet);
// escape and catch are owner-only. AUTO (-110) is a basic attack on a random living enemy (Go ClientActionAuto). Pure parse at the bottom.

import { Injectable } from '@nestjs/common';
import { BattleAction, type BattleCommand } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { sendPushes } from '../inventory/pushes';
import { UseItemService } from '../inventory/use-item.service';
import { PetCatchService } from '../pet/pet-catch.service';
import { SkillService } from '../skill/skill.service';
import type { Battle, Fighter, PlayerCommand } from './battle.types';
import { planCast } from './skill-cast';

@Injectable()
export class BattleCommandService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly useItem: UseItemService,
    private readonly skills: SkillService,
    private readonly petCatch: PetCatchService,
  ) {}

  /** `own` is the fighter the command is for: the submitting member's character (its slot, HP and MP) or its pet. */
  async resolve(session: Session, battle: Battle, own: Fighter, cmd: BattleCommand): Promise<PlayerCommand> {
    if (own.kind === 'pet' && !PET_ACTIONS.has(cmd.action)) throw RpcException.invalidArgs('action');
    switch (cmd.action) {
      case BattleAction.ATTACK: {
        const target = battle.fighters.get(cmd.tid);
        if (!target || target.side === own.side || !target.alive) throw RpcException.invalidArgs('tid'); // the other side (PvP: the other player)
        return { action: BattleAction.ATTACK, targetSlot: target.slot };
      }
      case BattleAction.AUTO: {
        const target = randomEnemy(battle, own);
        if (!target) throw RpcException.invalidArgs('tid');
        return { action: BattleAction.ATTACK, targetSlot: target.slot };
      }
      case BattleAction.SKILL:
        return this.resolveSkill(session, battle, own, cmd);
      case BattleAction.DEFENCE:
      case BattleAction.ESCAPE:
      case BattleAction.TIMEOUT:
        return { action: cmd.action, targetSlot: -1 };
      case BattleAction.CATCH:
        return this.resolveCatch(session, battle, own, cmd);
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

  /**
   * -70: the target must be a living enemy creature. The command carries the template's catchable value and the free pet slots
   * (bag room minus the pets this slot already caught in this battle); the round rolls it (rate 0 when a gate fails, Go).
   */
  private async resolveCatch(session: Session, battle: Battle, own: Fighter, cmd: BattleCommand): Promise<PlayerCommand> {
    const target = battle.fighters.get(cmd.tid);
    if (!target || target.side !== 'enemy' || target.kind !== 'creature' || !target.alive) throw RpcException.invalidArgs('tid');
    const caught = [...battle.fighters.values()].filter((f) => f.caughtBy === own.slot).length;
    const room = (await this.petCatch.room(session.characterId!)) - caught;
    return {
      action: BattleAction.CATCH, targetSlot: target.slot,
      catch: {
        catchable: this.gameData.petTemplate(target.refId)?.catchable ?? 0, room, bonusPoints: await this.petCatch.bonusPoints(session.characterId!),
      },
    };
  }

  /** -50: ownership, passive / unsupported refusal, MP check (short on MP = basic attack on the target), then the cast. */
  private async resolveSkill(session: Session, battle: Battle, own: Fighter, cmd: BattleCommand): Promise<PlayerCommand> {
    const tpl = this.gameData.skill(cmd.id);
    if (!tpl) throw RpcException.invalidArgs('id');
    const owned = own.kind === 'pet' ? own.skills?.includes(tpl.id) === true : await this.skills.owns(session.characterId!, tpl.id);
    if (!owned) throw RpcException.forbidden(own.kind === 'pet' ? 'Pet chưa học kỹ năng này' : 'Bạn chưa học kỹ năng này');
    const plan = planCast(tpl, own.mp, own.mpMax);
    if (plan.kind === 'refused') {
      throw RpcException.forbidden(plan.reason === 'passive' ? 'Không thể sử dụng kỹ năng bị động' : 'Kỹ năng chưa được hỗ trợ');
    }
    const self = plan.kind === 'cast' && plan.cast.category === 'heal';
    const alive = [...battle.fighters.values()].filter((f) => f.side !== own.side && f.alive);
    let target = battle.fighters.get(cmd.tid);
    if (!self && (!target || target.side === own.side || !target.alive)) {
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

/** Actions a pet can take (attack / skill / defence / item, AUTO from the auto-battle chain; the round also writes TIMEOUT for it). */
const PET_ACTIONS: ReadonlySet<number> = new Set([
  BattleAction.ATTACK, BattleAction.SKILL, BattleAction.DEFENCE, BattleAction.TIMEOUT, BattleAction.ITEM, BattleAction.AUTO,
]);

/** A random living fighter of the other side, or undefined. */
export function randomEnemy(battle: Pick<Battle, 'fighters'>, own: Fighter, rng: () => number = Math.random): Fighter | undefined {
  const alive = [...battle.fighters.values()].filter((f) => f.side !== own.side && f.alive);
  return alive.length ? alive[Math.min(alive.length - 1, Math.floor(rng() * alive.length))] : undefined;
}

/** battleUpdateCmd sends `[ownerCmd, petCmd?]`: index 0 is the owner, index 1 the pet (further entries are ignored). */
export function parseCommands(raw: unknown): { own: BattleCommand; pet?: BattleCommand } {
  const own = parseCommand(raw);
  return Array.isArray(raw) && raw.length > 1 && raw[1] !== null && raw[1] !== undefined ? { own, pet: parseCommand(raw[1]) } : { own };
}

/** One `{tid, action, id, level}` entry (an array argument contributes its first element). */
export function parseCommand(raw: unknown): BattleCommand {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === null || typeof first !== 'object') throw RpcException.invalidArgs('cmd');
  const o = first as Record<string, unknown>;
  const num = (v: unknown, d: number): number => (v === undefined || v === null ? d : Number(v));
  const cmd: BattleCommand = { tid: num(o.tid, -1), action: Number(o.action), id: num(o.id, -1), level: num(o.level, -1) };
  if (!Number.isInteger(cmd.action) || !Number.isFinite(cmd.tid) || !Number.isFinite(cmd.id)) throw RpcException.invalidArgs('cmd');
  return cmd;
}
