// Item-use RPCs: useItem(targetType, petId, itemId), fullHpRecoverByItem / fullMpRecoverByItem(targetType, targetId,
// entries). All fire-and-forget on the client. Pushes (self): onUPP{currentHp,currentMp}, onAddCharactorSlot /
// onDelCharactorSlot, onSystemMidMsgOrNote, plus the equip pushes when the item is equipment.

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes } from './pushes';
import { UseItemService, type RecoverKind } from './use-item.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

/** `[{sid: itemId, priority}]` from the client; malformed rows are dropped, a non-array means "scan the bag". */
function parseEntries(raw: unknown): { id: number; priority: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { id: number; priority: number }[] = [];
  for (const e of raw.slice(0, 300)) {
    const o = (e ?? {}) as Record<string, unknown>;
    const id = Number(o.sid ?? o.id ?? o.itemId);
    const priority = Number(o.priority);
    if (Number.isInteger(id) && Number.isFinite(priority)) out.push({ id, priority });
  }
  return out;
}

@Injectable()
export class UseItemRpc {
  constructor(private readonly useItem: UseItemService) {}

  /** targetType 1 = character (pets are not ported), petId is ignored. */
  @Rpc('useItem', { requireCharacter: true })
  async use(session: Session, args: unknown[]): Promise<null> {
    if (intArg(args[0], 'targetType') !== 1) throw RpcException.invalidArgs('targetType');
    const itemId = intArg(args[2], 'itemId');
    return midNoteOnFail(session, async () => {
      sendPushes(session, await this.useItem.useItem(session.characterId!, itemId));
      return null;
    });
  }

  @Rpc('fullHpRecoverByItem', { requireCharacter: true })
  fullHp(session: Session, args: unknown[]): Promise<null> {
    return this.recover(session, 'hp', args);
  }

  @Rpc('fullMpRecoverByItem', { requireCharacter: true })
  fullMp(session: Session, args: unknown[]): Promise<null> {
    return this.recover(session, 'mp', args);
  }

  private async recover(session: Session, kind: RecoverKind, args: unknown[]): Promise<null> {
    if (intArg(args[0], 'targetType') !== 1) throw RpcException.invalidArgs('targetType');
    const entries = parseEntries(args[2]);
    return midNoteOnFail(session, async () => {
      sendPushes(session, await this.useItem.recover(session.characterId!, kind, entries));
      return null;
    });
  }
}
