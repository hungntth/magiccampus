// Menh Hon dissolve (Go ops.go TransformExp / TransformAllExp, panel_transform.go): a gem becomes soul exp (base exp + every up_exp
// climbed + in-level exp) plus the row's Manh Vo chips. Bag gems and prey-panel temp gems; the bulk forms are VIP quick dissolves
// that skip locked gems and colours above the menu colour. The gem is removed and saved first, then the wallet is credited.

import { Injectable } from '@nestjs/common';
import { soulDissolveExp, type OnTransAllExpInPanelPush, type OnTransAllExpPush, type OnTransformExpInPanelPush, type OnTransformExpPush } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { CurrencyService } from '../progression/currency.service';
import { PmStateService } from '../vip/pm-state.service';
import { SOUL_TEXT, SoulRefusal, quickDissolveColor } from './soul-rules';
import { SoulStore } from './soul-store';

@Injectable()
export class SoulDissolveService {
  constructor(
    private readonly store: SoulStore,
    private readonly currencies: CurrencyService,
    private readonly data: GameDataService,
    private readonly vip: PmStateService,
  ) {}

  /** transformExp(slot): one bag gem. Replies onTransformExp {f:1, index, soulExp, chip}. */
  dissolve(characterId: number, index: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const state = await this.store.char(characterId);
      const gem = state.data[String(index)];
      if (!gem) throw new SoulRefusal('');
      if (gem.lock) throw new SoulRefusal(SOUL_TEXT.locked);
      const worth = this.worth(gem.sid, gem.exp);
      delete state.data[String(index)];
      await this.store.save(characterId, state);
      const total = await this.pay(characterId, worth);
      const payload: OnTransformExpPush = { f: 1, index, ...total };
      return [push('onTransformExp', payload)];
    });
  }

  /** transformExp(maxColor, true): every unlocked bag gem up to the menu colour (VIP). Replies onTransAllExp. */
  dissolveAll(characterId: number, menuColor: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const maxColor = await this.maxColorOf(characterId, menuColor);
      const state = await this.store.char(characterId);
      const taken: number[] = [];
      let exp = 0;
      let chip = 0;
      for (const [key, gem] of Object.entries(state.data)) {
        const tpl = this.data.petSoul(gem.sid);
        if (gem.lock || (tpl?.color ?? 0) > maxColor) continue;
        const w = this.worth(gem.sid, gem.exp);
        exp += w.exp;
        chip += w.chip;
        taken.push(Number(key));
        delete state.data[key];
      }
      if (taken.length > 0) await this.store.save(characterId, state);
      const total = await this.pay(characterId, { exp, chip });
      const data: Record<string, OnTransformExpPush> = {};
      for (const index of taken) data[String(index)] = { f: 1, index, ...total };
      const payload: OnTransAllExpPush = { data, ...total };
      return [push('onTransAllExp', payload)];
    });
  }

  /** transformExpInPanel(tempIndex): one temp prey gem (no in-level exp). Replies onTransformExpInPanel. */
  dissolveTemp(characterId: number, index: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const state = await this.store.char(characterId);
      const sid = state.temp[String(index)];
      if (!sid) throw new SoulRefusal('');
      const worth = this.worth(sid, 0);
      delete state.temp[String(index)];
      await this.store.save(characterId, state);
      const total = await this.pay(characterId, worth);
      const payload: OnTransformExpInPanelPush = { index, ...total };
      return [push('onTransformExpInPanel', payload)];
    });
  }

  /** transformExpInPanel(maxColor, true): temp prey gems up to the menu colour (VIP). Replies onTransAllExpInPanel. */
  dissolveTempAll(characterId: number, menuColor: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const maxColor = await this.maxColorOf(characterId, menuColor);
      const state = await this.store.char(characterId);
      const taken: number[] = [];
      let exp = 0;
      let chip = 0;
      for (const [key, sid] of Object.entries(state.temp).sort((x, y) => Number(x[0]) - Number(y[0]))) {
        if ((this.data.petSoul(sid)?.color ?? 0) > maxColor) continue;
        const w = this.worth(sid, 0);
        exp += w.exp;
        chip += w.chip;
        taken.push(Number(key));
        delete state.temp[key];
      }
      if (taken.length > 0) await this.store.save(characterId, state);
      const total = await this.pay(characterId, { exp, chip });
      const data: Record<string, OnTransformExpInPanelPush> = {};
      for (const index of taken) data[String(index)] = { index, ...total };
      const payload: OnTransAllExpInPanelPush = { data, ...total };
      return [push('onTransAllExpInPanel', payload)];
    });
  }

  private async maxColorOf(characterId: number, menuColor: number): Promise<number> {
    const gate = quickDissolveColor(await this.vip.levelOf(characterId), menuColor);
    if ('refusal' in gate) throw new SoulRefusal(gate.refusal, 'vip');
    return gate.maxColor;
  }

  /** What a gem refunds: soul exp (ladder rule) and the current row's chips. */
  private worth(sid: number, inLevelExp: number): { exp: number; chip: number } {
    const ladder = this.data.petSoulLadder(sid);
    const tpl = this.data.petSoul(sid);
    return { exp: soulDissolveExp({ sid, exp: inLevelExp }, ladder), chip: tpl?.chip ?? 0 };
  }

  /** Credits the refund and returns the final balances {soulExp, chip} (zero amounts only read the balance). */
  private async pay(characterId: number, w: { exp: number; chip: number }): Promise<{ soulExp: number; chip: number }> {
    const soulExp = w.exp > 0 ? await this.currencies.credit(characterId, 'soulExp', w.exp) : await this.currencies.balance(characterId, 'soulExp');
    const chip = w.chip > 0 ? await this.currencies.credit(characterId, 'soulChip', w.chip) : await this.currencies.balance(characterId, 'soulChip');
    return { soulExp, chip };
  }
}
