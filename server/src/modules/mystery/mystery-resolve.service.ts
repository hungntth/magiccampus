// mysTreObjResolve (Phân giải): the selected Mật Bảo pieces are consumed from the bag FIRST (saved), then the Bí Ngân (`mys_sil` per unit, owner 2026-10-31) is credited and the
// per-unit rune / chip rolls are granted (owner 2026-11-06: 10 % one level-1 rune, 30 % one chip, never rare families). A stale selection consumes nothing: the current bag is
// pushed with a note (Go resolve_stale.go). Push order: updateRuneChipBag, onAddMoney decoSilver, updateMysTreBag (+ onRuneBagUpdate, note, onUPP currencies).

import { Injectable } from '@nestjs/common';
import { MYS_TEXT } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { RuneService } from '../rune/rune.service';
import { buildDropPools, parseResolveArg, planResolve, rollResolveDrops, type DropPools } from './mystery-rules';
import { MysteryService } from './mystery.service';
import { bagWire } from './mystery-state';

@Injectable()
export class MysteryResolveService {
  private pools: DropPools | null = null;

  constructor(
    private readonly mystery: MysteryService,
    private readonly gameData: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly runes: RuneService,
  ) {}

  private dropPools(): DropPools {
    return (this.pools ??= buildDropPools(this.gameData.decoRunes(), this.gameData.runeChips(), (id) => this.gameData.decoRune(id)));
  }

  /** mysTreObjResolve({slot: {mid, num}}) -> null; everything else is pushed. */
  resolve(session: Session, raw: unknown): Promise<null> {
    const entries = parseResolveArg(raw);
    if (!entries) throw RpcException.invalidArgs('mysItemDic');
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      if (entries.length === 0) return null;
      const state = await this.mystery.load(cid);
      const before = structuredClone(state);
      const plan = planResolve(state, entries, (mid) => this.gameData.mystre(mid)?.sil ?? 0);
      if (plan === 'stale') {
        session.callback('updateMysTreBag', bagWire(state));
        session.callback('onSystemMidMsgOrNote', MYS_TEXT.STALE_BAG);
        return null;
      }
      const units = entries.map((e) => ({ level: this.gameData.mystre(e.mid)?.level ?? 1, num: e.num }));
      const drops = rollResolveDrops(units, this.dropPools(), this.mystery.roll);
      await this.mystery.save(cid, state);
      let total: number | null = null;
      try {
        if (plan.silver > 0) total = await this.currencies.credit(cid, 'decoSilver', plan.silver);
      } catch (e) {
        await this.mystery.save(cid, before);
        throw e;
      }
      const granted = await this.runes.grantLocked(cid, drops.runes, drops.chips);
      session.callback('updateRuneChipBag', granted.chips);
      if (total !== null) session.callback('onAddMoney', cid, 'decoSilver', plan.silver, total);
      session.callback('updateMysTreBag', bagWire(state));
      if (granted.bag) session.callback('onRuneBagUpdate', granted.bag);
      const parts: string[] = [];
      if (granted.names.length > 3) parts.push(`${granted.names.length} Phù Văn`);
      else if (granted.names.length > 0) parts.push(granted.names.join(', '));
      if (granted.chipCount > 0) parts.push(`${granted.chipCount} Mảnh Vỡ Phù Văn`);
      const note = [parts.length > 0 ? MYS_TEXT.RESOLVED_DROPS(parts.join(', ')) : '', granted.full ? MYS_TEXT.RUNE_BAG_FULL : ''].filter(Boolean).join(' ');
      if (note) session.callback('onSystemMidMsgOrNote', note);
      await this.currencies.push(session);
      return null;
    });
  }
}
