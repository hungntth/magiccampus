// Tiểu Tinh Linh RPCs (legacy FairyManagerPanel / FairyFuncCanvas / FairyItemCanvas / FairySkillCanvas / FairySkillConfigCanvas, Flash names):
// initCharFairy() -> roster; fairyGrowUp(id, type) -> {f, exp, cri, gnum} | {f:false, code}; fairyRaise(id, itemId, 1) -> {f, num};
// addFairyExp(id, [itemIds] | {"0": itemId}, 1) -> {f, num, en}; onSkill(id, bookItemId) / upFairySkill(id, skillIndex) -> {flag, id, sindex, skill};
// fairySkillConfigChange(id, config), changeFairyState(id, 0|1), delFairy(id) -> null. Pushes: onUpdateFairy, onFairyOn / onFairyOff (map),
// onDelFairy, onUPP, onAddCharactorSlot / onDelCharactorSlot.

import { Injectable } from '@nestjs/common';
import type { FairyAddExpReply, FairyGrowReply, FairyRaiseReply, FairyRoster, FairySkillReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { FairySkillService } from './fairy-skill.service';
import { FairyService } from './fairy.service';

export function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

/** Optional quantity argument (the client always sends 1): missing / bad -> 1, capped at 99. */
const qtyArg = (v: unknown): number => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 99) : 1;
};

/** Bag item id list: an array, an AMF ECMA-array object {"0": id, ...} or a single id. */
export function idListArg(v: unknown, name: string): number[] {
  const raw = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Record<string, unknown>) : [v];
  const ids = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0 || ids.length > 30) throw RpcException.invalidArgs(name);
  return ids;
}

export const FAIRY_MUTATE = { requireAuth: true, requireCharacter: true, forbidInBattle: true } as const;

@Injectable()
export class FairyRpc {
  constructor(private readonly fairies: FairyService, private readonly skills: FairySkillService) {}

  @Rpc('initCharFairy', { requireAuth: true, requireCharacter: true })
  initCharFairy(session: Session): Promise<FairyRoster> {
    return this.fairies.roster(session);
  }

  @Rpc('fairyGrowUp', FAIRY_MUTATE)
  fairyGrowUp(session: Session, args: unknown[]): Promise<FairyGrowReply> {
    return this.fairies.grow(session, intArg(args[0], 'fairyId'), intArg(args[1], 'type'));
  }

  @Rpc('fairyRaise', FAIRY_MUTATE)
  fairyRaise(session: Session, args: unknown[]): Promise<FairyRaiseReply> {
    return this.fairies.raise(session, intArg(args[0], 'fairyId'), intArg(args[1], 'itemId'), qtyArg(args[2]));
  }

  @Rpc('addFairyExp', FAIRY_MUTATE)
  addFairyExp(session: Session, args: unknown[]): Promise<FairyAddExpReply> {
    return this.fairies.feed(session, intArg(args[0], 'fairyId'), idListArg(args[1], 'itemIds'), qtyArg(args[2]));
  }

  @Rpc('onSkill', FAIRY_MUTATE)
  onSkill(session: Session, args: unknown[]): Promise<FairySkillReply> {
    return this.skills.learn(session, intArg(args[0], 'fairyId'), intArg(args[1], 'itemId'));
  }

  @Rpc('upFairySkill', FAIRY_MUTATE)
  upFairySkill(session: Session, args: unknown[]): Promise<FairySkillReply> {
    return this.skills.upgrade(session, intArg(args[0], 'fairyId'), intArg(args[1], 'skillIndex'));
  }

  @Rpc('fairySkillConfigChange', FAIRY_MUTATE)
  fairySkillConfigChange(session: Session, args: unknown[]): Promise<null> {
    const cfg = args[1];
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw RpcException.invalidArgs('config');
    return this.skills.setConfig(session, intArg(args[0], 'fairyId'), cfg);
  }

  @Rpc('changeFairyState', FAIRY_MUTATE)
  changeFairyState(session: Session, args: unknown[]): Promise<null> {
    return this.fairies.changeState(session, intArg(args[0], 'fairyId'), intArg(args[1], 'state'));
  }

  @Rpc('delFairy', FAIRY_MUTATE)
  delFairy(session: Session, args: unknown[]): Promise<null> {
    return this.fairies.release(session, intArg(args[0], 'fairyId'));
  }
}
