// Rune RPCs (legacy RuneBag / RuneSlot / RuneClickBag / RuneChipBag): getRuneBagData(cid), exchangeRune(), runeMove(from, to, bagType),
// arrangeRuneBag(cid, bagType), runeSet(bagPos, holePos, bagType, decoPosition), runeRemove(holePos, bagPos, bagType, decoPosition), runeUpLvl(),
// runeResolve(runeObj, bagType) and the H5 reads getRuneCatalog / getRuneChipBag. Pushes: onRuneBagUpdate, updateRuneChipBag, onUPP.
// A refusal shows onSystemMidMsgOrNote and rejects the call (the Go server answered most of them silently).

import { Injectable } from '@nestjs/common';
import type { DecoInfo, RuneBag, RuneCatalog, RuneChipBag, RuneExchangeReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { RuneService } from './rune.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

/** runeResolve's `{ "<bagPos>": runeId }` object (an array form `[id, ...]` is read by index). */
function pickedArg(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') throw RpcException.invalidArgs('runeObj');
  const out: Record<string, number> = {};
  for (const [k, id] of Object.entries(v as Record<string, unknown>)) {
    const pos = Number(k);
    if (Number.isInteger(pos) && pos >= 0) out[String(pos)] = Math.trunc(Number(id)) || 0;
  }
  return out;
}

@Injectable()
export class RuneRpc {
  constructor(private readonly rune: RuneService) {}

  @Rpc('getRuneCatalog', { requireCharacter: true })
  getRuneCatalog(): RuneCatalog {
    return this.rune.catalog();
  }

  @Rpc('getRuneBagData', { requireCharacter: true })
  getRuneBagData(session: Session): Promise<RuneBag> {
    return this.rune.bag(session.characterId!);
  }

  @Rpc('getRuneChipBag', { requireCharacter: true })
  getRuneChipBag(session: Session): Promise<RuneChipBag> {
    return this.rune.chips(session.characterId!);
  }

  @Rpc('runeMove', { requireCharacter: true, forbidInBattle: true })
  runeMove(session: Session, args: unknown[]): Promise<null> {
    const [from, to, bagType] = [intArg(args[0], 'fromBagPos'), intArg(args[1], 'toBagPos'), intArg(args[2], 'bagType')];
    return midNoteOnFail(session, () => this.rune.move(session, from, to, bagType));
  }

  /** args: (cid, bagType); the cid is the Flash client's own id and is ignored. */
  @Rpc('arrangeRuneBag', { requireCharacter: true, forbidInBattle: true })
  arrangeRuneBag(session: Session, args: unknown[]): Promise<null> {
    const bagType = intArg(args[1], 'bagType');
    return midNoteOnFail(session, () => this.rune.arrange(session, bagType));
  }

  @Rpc('runeSet', { requireCharacter: true, forbidInBattle: true })
  runeSet(session: Session, args: unknown[]): Promise<DecoInfo> {
    const [bagPos, holePos, bagType, decoPosition] = [intArg(args[0], 'bagPos'), intArg(args[1], 'holePos'), intArg(args[2], 'bagType'), intArg(args[3], 'decoPosition')];
    return midNoteOnFail(session, () => this.rune.set(session, bagPos, holePos, bagType, decoPosition));
  }

  @Rpc('runeRemove', { requireCharacter: true, forbidInBattle: true })
  runeRemove(session: Session, args: unknown[]): Promise<DecoInfo> {
    const [holePos, bagPos, bagType, decoPosition] = [intArg(args[0], 'holePos'), intArg(args[1], 'bagPos'), intArg(args[2], 'bagType'), intArg(args[3], 'decoPosition')];
    return midNoteOnFail(session, () => this.rune.remove(session, holePos, bagPos, bagType, decoPosition));
  }

  @Rpc('runeUpLvl', { requireCharacter: true, forbidInBattle: true })
  runeUpLvl(session: Session): Promise<RuneBag> {
    return midNoteOnFail(session, () => this.rune.upLevel(session));
  }

  @Rpc('runeResolve', { requireCharacter: true, forbidInBattle: true })
  runeResolve(session: Session, args: unknown[]): Promise<null> {
    const picked = pickedArg(args[0]);
    const bagType = intArg(args[1], 'bagType');
    return midNoteOnFail(session, () => this.rune.resolve(session, picked, bagType));
  }

  @Rpc('exchangeRune', { requireCharacter: true, forbidInBattle: true })
  exchangeRune(session: Session): Promise<RuneExchangeReply> {
    return midNoteOnFail(session, () => this.rune.exchange(session));
  }
}
