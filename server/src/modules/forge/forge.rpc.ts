// Forge RPCs (Flash names): getMakeRecipes (H5 helper), getMakeColor / newMake (crafting) and materialMixOne / materialMixAll /
// jewelUpdateOne / jewelUpdateAll (mixing, gem tiers). Pushes: the stack changes, onAddItem, onAddCharactorSlot; every refusal
// or failed roll also shows onSystemMidMsgOrNote (newMake replies {flag:false} for a failed roll, as Go does).

import { Injectable } from '@nestjs/common';
import type { GetMakeColorReply, MakeRecipe, MaterialMixReply, MaterialRef, MaterialRefs, NewMakeReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { sendPushes } from '../inventory/pushes';
import { CraftService } from './craft.service';
import { MixService, type MixMode } from './mix.service';

/** `materials` = {"1": {tempBagFlag, idx}, ...}; anything else is rejected. */
export function parseMaterials(v: unknown): MaterialRefs {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw RpcException.invalidArgs('materials');
  const out: MaterialRefs = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const r = raw as Partial<MaterialRef> | null;
    if (typeof r !== 'object' || r === null || !Number.isInteger(Number(r.idx))) throw RpcException.invalidArgs('materials');
    out[k] = { tempBagFlag: r.tempBagFlag === true, idx: Number(r.idx) };
  }
  return out;
}

const tplId = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs('equipTemplateId');
  return n;
};

@Injectable()
export class ForgeRpc {
  constructor(private readonly craft: CraftService, private readonly mix: MixService) {}

  @Rpc('getMakeRecipes', { requireCharacter: true })
  getMakeRecipes(): Promise<MakeRecipe[]> {
    return this.craft.recipes();
  }

  @Rpc('getMakeColor', { requireCharacter: true })
  getMakeColor(session: Session, args: unknown[]): Promise<GetMakeColorReply> {
    return this.craft.preview(session.characterId!, parseMaterials(args[0]), tplId(args[1]));
  }

  @Rpc('newMake', { requireCharacter: true, forbidInBattle: true })
  async newMake(session: Session, args: unknown[]): Promise<NewMakeReply> {
    const r = await this.craft.make(session.characterId!, session.characterName ?? '', parseMaterials(args[0]), tplId(args[1]));
    sendPushes(session, r.pushes);
    if (r.note) session.callback('onSystemMidMsgOrNote', r.note);
    return { flag: r.flag };
  }

  @Rpc('materialMixOne', { requireCharacter: true, forbidInBattle: true })
  materialMixOne(session: Session, args: unknown[]): Promise<MaterialMixReply> {
    return this.runMix(session, args, 'mix', false);
  }

  @Rpc('materialMixAll', { requireCharacter: true, forbidInBattle: true })
  materialMixAll(session: Session, args: unknown[]): Promise<MaterialMixReply> {
    return this.runMix(session, args, 'mix', true);
  }

  @Rpc('jewelUpdateOne', { requireCharacter: true, forbidInBattle: true })
  jewelUpdateOne(session: Session, args: unknown[]): Promise<MaterialMixReply> {
    return this.runMix(session, args, 'jewel', false);
  }

  @Rpc('jewelUpdateAll', { requireCharacter: true, forbidInBattle: true })
  jewelUpdateAll(session: Session, args: unknown[]): Promise<MaterialMixReply> {
    return this.runMix(session, args, 'jewel', true);
  }

  private async runMix(session: Session, args: unknown[], mode: MixMode, all: boolean): Promise<MaterialMixReply> {
    const num = Number(args[0]);
    const itemId = Number(args[1]);
    if (!Number.isInteger(num)) throw RpcException.invalidArgs('num');
    if (!Number.isInteger(itemId)) throw RpcException.invalidArgs('itemRef');
    const r = await this.mix.run(session.characterId!, mode, all, num, itemId, args[2] === true);
    sendPushes(session, r.pushes);
    if (r.note) session.callback('onSystemMidMsgOrNote', r.note);
    return r.reply;
  }
}
