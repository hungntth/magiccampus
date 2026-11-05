// Mệnh Hồn flow (legacy PetSoulPanel / prey panel): owns the window, the RPCs -- openBag, lockSoul, soulLevelUp, putInToExp, transformExp,
// transformExpInPanel, preySoul, exchangeSoul, putSoulToBag, openPetSoulBag, moveSoul -- and the pushes onOpenBag, onLockSoul, onSoulLevelUp,
// onPutInToExp, onTransformExp, onTransAllExp, onTransformExpInPanel, onTransAllExpInPanel, onPreySoulSingle, onPreySoulAll, onPutSoulToBag,
// onPutAllSoulToBag, onUpdateSoulSlot, onPetLevelUp. State lives in player.soulBagData / tempSoulData / crystalSid and pet.soulInfo.

import {
  petSoulOpenNum, petSoulDef,
  type ExchangeSoulReply, type OnLockSoulPush, type OnOpenBagPush, type OnPetLevelUpPush, type OnPreySoulAllPush, type OnPreySoulFailPush,
  type OnPreySoulSinglePush, type OnPutAllSoulToBagPush, type OnPutInToExpPush, type OnPutSoulToBagPush, type OnSoulLevelUpPush,
  type OnTransAllExpInPanelPush, type OnTransAllExpPush, type OnTransformExpInPanelPush, type OnTransformExpPush, type OnUpdateSoulSlotPush,
  type OpenPetSoulBagReply, type PetSoulInfoWire, type PetView, type PlayerData, type SoulBagLogin, type SoulTempLogin,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { SoulWindow } from '../ui/petsoul/soulWindow';
import { SOUL_TEXT as T } from '../ui/petsoul/soulText';
import type { SoulActions, SoulHost } from '../ui/petsoul/soulTypes';
import {
  applyMove, applyPutToBag, dropBagSlot, emptyBag, persistCrystal, setBagSlot, setRingSlot, wireIndex, moveArgs, type SoulCell,
} from '../ui/petsoul/soulRules';

export interface PetSoulControllerHost {
  client: GameClient;
  player: PlayerData;
  pets(): PetView[];
}

export class PetSoulController {
  private readonly win: SoulWindow;
  private readonly offs: (() => void)[] = [];
  /** Pet of the last moveSoul call: onUpdateSoulSlot does not name the pet. */
  private movePet = -1;

  constructor(private readonly host: PetSoulControllerHost) {
    const view: SoulHost = {
      actions: this.actions(), player: () => host.player, pets: () => host.pets(),
      bag: () => this.bag(), temp: () => this.temp(), crystalSid: () => host.player.crystalSid ?? 0,
    };
    this.win = new SoulWindow(view, () => this.win.close());
    const on = <T>(name: string, fn: (d: T) => void): void => {
      this.offs.push(host.client.on(name, (d) => fn(d as T)));
    };
    on('onOpenBag', (d: OnOpenBagPush) => this.onOpenBag(d));
    on('onLockSoul', (d: OnLockSoulPush) => this.change(() => { const g = this.bag().data[String(d.index)]; if (g) g.lock = d.lock; }));
    on('onSoulLevelUp', (d: OnSoulLevelUpPush) => this.onLevelUp(d));
    on('onPutInToExp', (d: OnPutInToExpPush) => this.change(() => { setBagSlot(this.bag(), d.soulData); this.wallet({ soulExp: d.soulExp }); }));
    on('onTransformExp', (d: OnTransformExpPush) => this.change(() => this.dissolved([d.index], d)));
    on('onTransAllExp', (d: OnTransAllExpPush) => this.change(() => this.dissolved(Object.values(d.data).map((x) => x.index), d)));
    on('onTransformExpInPanel', (d: OnTransformExpInPanelPush) => this.change(() => this.dissolvedTemp([d.index], d)));
    on('onTransAllExpInPanel', (d: OnTransAllExpInPanelPush) => this.change(() => this.dissolvedTemp(Object.values(d.data).map((x) => x.index), d)));
    on('onPreySoulSingle', (d: OnPreySoulSinglePush | OnPreySoulFailPush) => this.onPrey(d));
    on('onPreySoulAll', (d: OnPreySoulAllPush) => this.change(() => this.preyAll(d)));
    on('onPutSoulToBag', (d: OnPutSoulToBagPush) => this.change(() => !applyPutToBag(this.bag(), this.temp(), d) && toast(T.bagFull)));
    on('onPutAllSoulToBag', (d: OnPutAllSoulToBagPush) => this.change(() => this.putAll(d)));
    on('onUpdateSoulSlot', (d: OnUpdateSoulSlotPush) => this.onMoved(d));
    on('onPetLevelUp', (d: OnPetLevelUpPush) => this.change(() => { this.ringFor(d.pid).openNum = d.openNum; }));
  }

  /** Pet panel "M.Hồn" button: opens the window on the selected pet. */
  open(pet: PetView): void {
    this.win.show(pet.id);
  }

  refresh(): void {
    if (this.win.isOpen) this.win.refresh();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.win.close();
  }

  // --- state ---

  private bag(): SoulBagLogin {
    const p = this.host.player;
    if (!p.soulBagData) p.soulBagData = emptyBag();
    return p.soulBagData;
  }

  private temp(): SoulTempLogin {
    const p = this.host.player;
    if (!p.tempSoulData) p.tempSoulData = {};
    return p.tempSoulData;
  }

  /** The pet's soulInfo, created (and normalised to the level value) when the pet has none yet. */
  private ringFor(petId: number): PetSoulInfoWire {
    const pet = this.host.pets().find((p) => p.id === petId);
    if (!pet) return { openNum: 0, openNum2: 0, data: {} };
    if (!pet.soulInfo) pet.soulInfo = { openNum: petSoulOpenNum(pet.level), openNum2: 0, data: {} };
    return pet.soulInfo;
  }

  private wallet(w: { soulExp?: number; soulChip?: number; soulPnt?: number }): void {
    const p = this.host.player;
    p.currencies = { ...p.currencies, ...w };
  }

  private change(fn: () => unknown): void {
    fn();
    this.refresh();
  }

  private dissolved(indexes: number[], total: { soulExp: number; chip: number }): void {
    for (const i of indexes) dropBagSlot(this.bag(), i);
    this.wallet({ soulExp: total.soulExp, soulChip: total.chip });
  }

  private dissolvedTemp(indexes: number[], total: { soulExp: number; chip: number }): void {
    for (const i of indexes) delete this.temp()[String(i)];
    this.wallet({ soulExp: total.soulExp, soulChip: total.chip });
  }

  // --- pushes ---

  private onOpenBag(d: OnOpenBagPush): void {
    if (d.index <= 0) return void toast(T.noMoney);
    this.change(() => { this.bag().open = Math.max(this.bag().open, d.index); });
  }

  private onLevelUp(d: OnSoulLevelUpPush): void {
    this.change(() => {
      if (d.pid !== undefined) setRingSlot(this.ringFor(d.pid), d.soulData);
      else setBagSlot(this.bag(), d.soulData);
      this.wallet({ soulExp: d.soulExp });
    });
  }

  private onPrey(d: OnPreySoulSinglePush | OnPreySoulFailPush): void {
    if ('type' in d) return void (d.type === 2 && toast(T.noPoint)); // type 1: the server already sent the refusal note
    this.change(() => {
      this.temp()[String(d.sidObj.index)] = d.sidObj.ii;
      this.host.player.crystalSid = persistCrystal(d.newIndex);
      this.wallet({ soulPnt: d.point });
      const def = petSoulDef(d.sidObj.ii);
      if (def) toast(T.gotSoul.replace('{soul}', ` ${def.name}`));
    });
  }

  private preyAll(d: OnPreySoulAllPush): void {
    for (const e of Object.values(d.data)) this.temp()[String(e.sidObj.index)] = e.sidObj.ii;
    this.host.player.crystalSid = persistCrystal(d.newIndex);
    this.wallet({ soulPnt: d.point });
  }

  private putAll(d: OnPutAllSoulToBagPush): void {
    for (const [key, entry] of Object.entries(d)) {
      if (!applyPutToBag(this.bag(), this.temp(), entry) && key === 'full') toast(T.bagFull);
    }
  }

  private onMoved(d: OnUpdateSoulSlotPush): void {
    if (d.f !== 1) return void toast(T.sameKind);
    this.change(() => applyMove(this.bag(), this.movePet > 0 ? this.ringFor(this.movePet) : null, d));
  }

  // --- RPCs ---

  private send(method: string, ...args: unknown[]): void {
    void this.host.client.call(method, ...args).catch((e: unknown) => toast((e as Error).message, true));
  }

  private actions(): SoulActions {
    return {
      openBag: () => this.send('openBag'),
      lock: (slot) => this.send('lockSoul', slot),
      levelUp: (cell: SoulCell, petId) => (cell.area === 'ring' ? this.send('soulLevelUp', wireIndex(cell), petId) : this.send('soulLevelUp', cell.slot)),
      pour: (slot, amount) => this.send('putInToExp', slot, amount),
      dissolve: (slot) => this.send('transformExp', slot, false),
      dissolveAll: (menu) => this.send('transformExp', menu, true),
      move: (from, to, petId) => {
        this.movePet = petId;
        this.send('moveSoul', ...moveArgs(from, to, petId));
      },
      openRing: (petId) => void this.openRing(petId),
      prey: (index) => this.send('preySoul', index, false, false),
      preyQuick: () => this.send('preySoul', 1, true, false),
      preyAdvanced: () => this.send('preySoul', 6, false, true),
      toBag: (index) => this.send('putSoulToBag', index),
      toBagAll: () => this.send('putSoulToBag', -1, true),
      dissolveTemp: (index) => this.send('transformExpInPanel', index, false),
      dissolveTempAll: (menu) => this.send('transformExpInPanel', menu, true),
      exchange: (id) => void this.exchange(id),
    };
  }

  private async openRing(petId: number): Promise<void> {
    try {
      const r = await this.host.client.call<OpenPetSoulBagReply | null>('openPetSoulBag', petId);
      if (!r) return; // refusal note already pushed
      this.ringFor(r.pid).openNum2 = r.openNum2;
      this.wallet({ soulExp: r.soulExp });
      this.refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  private async exchange(soulId: number): Promise<void> {
    try {
      const r = await this.host.client.call<ExchangeSoulReply>('exchangeSoul', soulId);
      if (r.type === 1 && r.soulData) {
        setBagSlot(this.bag(), r.soulData);
        this.wallet({ soulChip: r.chip ?? 0 });
        this.refresh();
      } else toast(r.type === 2 ? T.exchangeFull : T.noChip);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
}


