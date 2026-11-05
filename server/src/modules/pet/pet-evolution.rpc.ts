// M12 Phase B RPCs: activePet, activePetGold, toPetEnvolution, toPetFeather and toPetFeatherNextStep. The reply and the onEnvolution / onFeather /
// OnFeatherNextStep push carry the same legacy payload; the sheet refresh (onRefreshPetProp) follows as an ordered push.

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes } from '../inventory/pushes';
import type { PetHandbookEntry } from '@mc/shared';
import { PetEvolutionService, type ActivateResult, type EvolveReply, type FeatherReply } from './pet-evolution.service';

const payload = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
const id = (v: unknown, field: string): number => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(field); return n; };

@Injectable()
export class PetEvolutionRpc {
  constructor(private readonly evolution: PetEvolutionService) {}

  @Rpc('activePet', { requireCharacter: true })
  active(session: Session, args: unknown[]): Promise<PetHandbookEntry> {
    const req = payload(args[0]);
    return this.activation(session, () => this.evolution.activate(session.characterId!, id(req.pid, 'pid'), Number(req.num)));
  }

  /** VIP quick activation: pays ceil(remaining / 5) gold for the whole remainder (the num is ignored, as in Go). */
  @Rpc('activePetGold', { requireCharacter: true })
  activeGold(session: Session, args: unknown[]): Promise<PetHandbookEntry> {
    const req = payload(args[0]);
    return this.activation(session, () => this.evolution.activateGold(session.characterId!, id(req.pid, 'pid'), req.moneyType));
  }

  @Rpc('toPetEnvolution', { requireCharacter: true, forbidInBattle: true })
  evolve(session: Session, args: unknown[]): Promise<EvolveReply> {
    const petId = id(args[0], 'petId');
    return midNoteOnFail(session, async () => {
      const { reply, pushes } = await this.evolution.evolve(session.characterId!, petId);
      session.callback('onEnvolution', reply);
      sendPushes(session, pushes);
      return reply;
    });
  }

  @Rpc('toPetFeather', { requireCharacter: true, forbidInBattle: true })
  feather(session: Session, args: unknown[]): Promise<FeatherReply & { num: number }> {
    const petId = id(args[0], 'petId');
    return midNoteOnFail(session, async () => {
      const { reply, pushes } = await this.evolution.feather(session.characterId!, petId, args[1] === true || args[1] === 1);
      const out = { num: 1, ...reply };
      session.callback('onFeather', out);
      sendPushes(session, pushes);
      return out;
    });
  }

  @Rpc('toPetFeatherNextStep', { requireCharacter: true, forbidInBattle: true })
  featherJump(session: Session, args: unknown[]): Promise<FeatherReply & { num: number }> {
    const petId = id(args[0], 'petId');
    return midNoteOnFail(session, async () => {
      const { reply, pushes } = await this.evolution.featherJump(session.characterId!, petId);
      const out = { num: 100, ...reply };
      session.callback('OnFeatherNextStep', out);
      sendPushes(session, pushes);
      return out;
    });
  }

  private activation(session: Session, call: () => Promise<ActivateResult>): Promise<PetHandbookEntry> {
    return midNoteOnFail(session, async () => {
      const out = await call();
      sendPushes(session, out.pushes);
      return out.reply;
    });
  }
}
