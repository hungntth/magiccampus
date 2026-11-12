// Client pet state + flows (phase A): player.petList from login, pushes (onAddPet, onDelPet, onUpdatePet,
// onRefreshPetProp), the "Quản lý pet" window (W key / HUD pet button / pet icon) and the HUD PetCanvas battle pet.
// RPCs (all fire-and-forget, failures arrive as onSystemMidMsgOrNote): changePetState, changePetName, delPetByClient,
// bindedPetByPlayer, changePetProperty; initViewPetMngP refreshes the list whenever the window opens.
// Must be constructed after BagController (life items route through bag.actions.petTarget).

import {
  petLevelOfExp, type ChangePetPropertyArg, type InitViewPetMngPResult, type OnCreatePetPush, type PetProperty, type PetSkillInfoMap,
  type PetView, type PetWrapper, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { createThrottle } from '../net/throttle';
import type { ChatBox } from '../ui/chat';
import { askConfirm } from '../ui/confirmDialog';
import { PetPanel, type PetFuncId } from '../ui/petPanel';
import { toast } from '../ui/screens';
import type { BagController } from './BagController';
import { ArenaController } from './ArenaController';
import { PetBoostController } from './PetBoostController';
import { PetEvoController } from './PetEvoController';
import { PetFuncController } from './PetFuncController';
import { PetGearActions } from './PetGearActions';
import { PetSoulController } from './PetSoulController';
import { PetStoneController } from './PetStoneController';
import { PpveController } from './PpveController';
import { FairyController } from './FairyController';

const OP_DELAY = 500; // Flash PETMANAGERPANEL_S[24]: no back-to-back pet operations
const FOLLOW_LOCK_MS = 5000; // Flash changePetFollow: the follow button is disabled for 5 s
const AUTO_BATTLE_DELAY = 500; // Flash QuestPanel.callGuide: setFirstPetActive runs 500 ms after the finish

export interface PetHost {
  client: GameClient;
  player: PlayerData;
  chat: ChatBox;
  bag: BagController;
  /** HUD PetCanvas sink (MainHud.setBattlePet). */
  setBattlePet(pet: PetView | null): void;
  /** The detail rates window for the fighting pet (CharacterController owns it). */
  onDetail(): void;
}

export class PetController {
  private readonly panel: PetPanel;
  private readonly gear: PetGearActions;
  private readonly train: PetFuncController;
  private readonly evo: PetEvoController;
  private readonly boost: PetBoostController;
  private readonly stone: PetStoneController;
  private readonly soul: PetSoulController;
  /** M12 slice C6: Đấu pet and Không Gian Điêu Khắc windows (opened from the HUD function column). */
  private readonly arena: ArenaController;
  private readonly ppve: PpveController;
  /** M13 G: Tiểu Tinh Linh window (fairy toggle of the HUD pet frame). */
  private readonly fairy: FairyController;
  /** Second-row window openers (M12); slices register theirs with setFuncHandler, unwired ids toast. */
  private readonly funcs = new Map<PetFuncId, (pet: PetView) => void>();
  private readonly allow = createThrottle();
  private readonly offs: (() => void)[] = [];
  private selectedId = -1;
  private followLocked = false;
  private followTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: PetHost) {
    this.gear = new PetGearActions({
      client: host.client,
      player: host.player,
      pets: () => this.pets(),
      panelPet: () => (this.panel.isOpen ? (host.player.petList[this.selectedId] ?? null) : null),
    });
    this.train = new PetFuncController({
      client: host.client, player: host.player, bag: host.bag, pets: () => this.pets(), skillInfo: (id) => this.gear.skillInfo(id),
    });
    this.evo = new PetEvoController({
      client: host.client, player: host.player, bag: host.bag, pets: () => this.pets(), reloadPets: () => this.reload(),
    });
    this.boost = new PetBoostController({ client: host.client, player: host.player, bag: host.bag, pets: () => this.pets() });
    this.stone = new PetStoneController({ client: host.client, player: host.player, bag: host.bag, pets: () => this.pets() });
    this.soul = new PetSoulController({ client: host.client, player: host.player, pets: () => this.pets() });
    const battleHost = { client: host.client, player: host.player, pets: () => this.pets(), skillInfo: (id: number) => this.gear.skillInfo(id) };
    this.arena = new ArenaController(battleHost);
    this.ppve = new PpveController(battleHost);
    this.fairy = new FairyController({ client: host.client, player: host.player, bag: host.bag });
    this.funcs.set('soul', (pet) => this.soul.open(pet));
    this.funcs.set('guard', () => this.boost.openGuard());
    this.funcs.set('talent', () => this.boost.openTalent());
    this.funcs.set('stone', () => this.stone.open());
    this.funcs.set('train', (pet) => this.train.open('star', pet));
    this.funcs.set('evolve', (pet) => this.evo.open('evolve', pet));
    this.panel = new PetPanel({
      pets: () => this.pets(),
      maxNum: () => host.player.petMaxNum,
      selected: () => this.selectedId,
      onSelect: (id) => this.select(id),
      onState: (pet, target) => this.setState(pet, target),
      following: () => host.player.showPetId,
      followLocked: () => this.followLocked,
      onFollow: (pet) => this.toggleFollow(pet),
      onRename: (pet, name) => this.send('changePetName', pet.id, name),
      onRelease: (pet) => this.release(pet),
      onBind: (pet) => this.bind(pet),
      onAllocate: (pet, add) => this.allocate(pet, add),
      onDetail: () => host.onDetail(),
      skillInfo: (id) => this.gear.skillInfo(id),
      item: (id) => host.bag.find(id),
      onOpenSkill: (pet, slot) => this.gear.openSkill(pet, slot),
      onDelSkill: (pet, slot) => this.gear.delSkill(pet, slot),
      onEquipOff: (pet, item) => this.gear.equipOff(pet, item),
      onRepair: (pet, item) => this.gear.repair(pet, item),
      onRepairAll: (pet) => this.gear.repairAll(pet),
      onOpenSlot: () => this.gear.openSlot(),
      onFunc: (id, pet) => this.openFunc(id, pet),
      onClose: () => this.panel.close(),
    });
    host.bag.actions.petTarget = () => this.target();
    host.bag.actions.petGear = this.gear;
    const c = host.client;
    this.offs.push(
      c.on('onAddPet', (d) => this.onAdd(d as PetWrapper)),
      c.on('onDelPet', (id) => this.onDelete(Number(id))),
      c.on('onUpdatePet', (id, key, value) => this.onUpdate(Number(id), String(key), value)),
      c.on('onRefreshPetProp', (id, prop) => this.onRefresh(Number(id), prop as PetProperty)),
      c.on('onPetSkillInfo', (map) => this.gear.remember(map as PetSkillInfoMap)),
      c.on('onUPP', () => this.panel.render()), // petMaxNum after petOpenSlot (QuestController merged it first)
      c.on('onCreatePet', (d) => this.onFollowPush((d as OnCreatePetPush).cid, (d as OnCreatePetPush).petData.id)),
      c.on('onCancelPet', (cid) => this.onFollowPush(Number(cid), -1)),
    );
    this.refreshHud();
  }

  destroy(): void {
    for (const off of this.offs) off();
    if (this.followTimer) clearTimeout(this.followTimer);
    this.host.bag.actions.petTarget = () => null;
    this.host.bag.actions.petGear = null;
    this.panel.close();
    this.train.destroy();
    this.evo.destroy();
    this.boost.destroy();
    this.stone.destroy();
    this.soul.destroy();
    this.arena.destroy();
    this.ppve.destroy();
    this.fairy.destroy();
  }

  /** HUD pet frame fairy toggle (PetCanvas.__fairyTog_click). */
  toggleFairy(): void {
    this.fairy.toggle();
  }

  /** HUD red column "Đấu Pet" / "Điêu Khắc". */
  toggleArena(): void {
    void this.reload(); // the list may be older than the line-up pets bound elsewhere
    this.arena.toggle();
  }

  togglePpve(): void {
    void this.reload();
    this.ppve.toggle();
  }

  /** HUD pet button / W key / pet icon. */
  toggle(): void {
    if (this.panel.isOpen) {
      this.panel.close();
      return;
    }
    if (!this.host.player.petList[this.selectedId]) this.selectedId = this.battlePet()?.id ?? this.pets()[0]?.id ?? -1;
    this.panel.show();
    void this.reload();
  }

  pets(): PetView[] {
    return Object.values(this.host.player.petList).sort((a, b) => a.id - b.id);
  }

  battlePet(): PetView | undefined {
    return this.pets().find((p) => p.state === 1);
  }

  /** Pet a life item is used on: the one selected in the open window, else the battle pet. */
  target(): number | null {
    const sel = this.panel.isOpen ? this.host.player.petList[this.selectedId] : undefined;
    return sel?.id ?? this.battlePet()?.id ?? null;
  }

  /** initViewPetMngP: the authoritative list (login petList can be stale after missed pushes). */
  private async reload(): Promise<void> {
    try {
      const res = await this.host.client.call<InitViewPetMngPResult>('initViewPetMngP');
      const list: Record<number, PetView> = {};
      for (const w of Object.values(res)) list[w.id] = w.data;
      this.host.player.petList = list;
      this.refreshAll();
    } catch {
      // the pushes keep the local list current; nothing to show
    }
  }

  private select(id: number): void {
    this.selectedId = id;
    this.panel.render();
  }

  private setState(pet: PetView, target: 1 | 3): void {
    if (target === 1) {
      const p = this.host.player;
      if (petLevelOfExp(pet.exp) - 5 > p.level) return void toast('Không thể triệu hồi pet có cấp độ cao hơn cấp độ nhân vật 5 cấp!');
      if (pet.useLv > p.level) {
        return void toast(`Không thể triệu hồi pet có cấp độ cao hơn nhân vật!\nNgười chơi cần đạt cấp ${pet.useLv} mới có thể thuần phục pet.`);
      }
      if (!pet.binded) {
        askConfirm('Pet này sẽ bị khóa, xác nhận cho tham chiến?', () => this.send('changePetState', pet.id, 1));
        return;
      }
    }
    this.send('changePetState', pet.id, target);
  }

  /** Đi theo / Hủy theo: awaited startPetFollow(petId, currentShowPetId) / cancelPetFollow(showPetId), truthy reply = ok. */
  private toggleFollow(pet: PetView): void {
    if (this.followLocked) return;
    this.followLocked = true;
    this.followTimer = setTimeout(() => {
      this.followLocked = false;
      this.panel.render();
    }, FOLLOW_LOCK_MS);
    this.panel.render();
    const shown = this.host.player.showPetId;
    const call = shown === pet.id
      ? this.host.client.call('cancelPetFollow', shown)
      : this.host.client.call('startPetFollow', pet.id, shown);
    void call.then((ok) => ok && this.setShowPet(shown === pet.id ? -1 : pet.id)).catch(() => undefined);
  }

  /** onCreatePet / onCancelPet: only the owner's own cid updates the follow state (the map sprite is PetLayer's). */
  private onFollowPush(cid: number, petId: number): void {
    if (cid === this.host.player.id) this.setShowPet(petId);
  }

  private setShowPet(petId: number): void {
    this.host.player.showPetId = petId;
    for (const p of this.pets()) p.following = p.id === petId;
    this.panel.render();
  }

  private release(pet: PetView): void {
    askConfirm('Xác nhận phóng sinh pet này?', () => this.send('delPetByClient', pet.id));
  }

  private bind(pet: PetView): void {
    if (pet.binded) return;
    askConfirm(`Xác nhận khóa ${pet.petName}?`, () => this.send('bindedPetByPlayer', pet.id));
  }

  private allocate(pet: PetView, add: ChangePetPropertyArg): void {
    void this.host.client.call('changePetProperty', pet.id, add).catch(() => undefined);
  }

  /** Registers the window opener of a second-row button (other M12 slices call this from their controllers). */
  setFuncHandler(id: PetFuncId, open: (pet: PetView) => void): void {
    this.funcs.set(id, open);
  }

  private openFunc(id: PetFuncId, pet: PetView): void {
    const open = this.funcs.get(id);
    if (open) open(pet);
    else toast('Sắp ra mắt');
  }

  private send(method: string, ...args: unknown[]): void {
    if (!this.allow('petOp', OP_DELAY)) return void toast('Vui lòng không thực hiện liên tục các thao tác với pet');
    void this.host.client.call(method, ...args).catch(() => undefined);
  }

  // --- pushes ---

  private onAdd(w: PetWrapper): void {
    const firstQuestPet = w.data.binded === 1 && !this.battlePet();
    this.host.player.petList[w.id] = w.data;
    this.host.chat.system(`Nhận được 1 pet: [${w.data.petName}]`);
    this.refreshAll();
    if (!firstQuestPet) return;
    // Flash setFirstPetActive: open the window on the new pet and make it the battle pet 500 ms later.
    this.selectedId = w.id;
    if (!this.panel.isOpen) this.panel.show();
    this.panel.reveal(w.id);
    this.panel.render();
    setTimeout(() => {
      const pet = this.host.player.petList[w.id];
      if (pet && !this.battlePet()) this.send('changePetState', w.id, 1);
    }, AUTO_BATTLE_DELAY);
  }

  private onDelete(id: number): void {
    const pet = this.host.player.petList[id];
    if (!pet) return;
    delete this.host.player.petList[id];
    this.host.chat.system(`Mất 1 pet: [${pet.petName}]`);
    if (this.selectedId === id) this.selectedId = this.battlePet()?.id ?? this.pets()[0]?.id ?? -1;
    this.refreshAll();
  }

  /** onUpdatePet(petId, key, value): generic field set (Flash PetManagerPanel.onUpdatePet). */
  private onUpdate(id: number, key: string, value: unknown): void {
    const pet = this.host.player.petList[id];
    if (!pet) return;
    Object.assign(pet, { [key]: value });
    if (key === 'exp') pet.level = petLevelOfExp(Number(value));
    this.refreshAll();
  }

  private onRefresh(id: number, prop: PetProperty): void {
    const pet = this.host.player.petList[id];
    if (!pet) return;
    pet.property = prop;
    pet.attLastPoint = prop.lastPoint;
    pet.currentHp = prop.finalHp;
    pet.currentMp = prop.finalMp;
    this.refreshAll();
  }

  private refreshAll(): void {
    this.panel.render();
    this.train.refresh();
    this.evo.refresh();
    this.boost.refresh();
    this.stone.refresh();
    this.soul.refresh();
    this.refreshHud();
    this.host.bag.petsChanged();
  }

  private refreshHud(): void {
    this.host.setBattlePet(this.battlePet() ?? null);
  }

  /** In battle the HUD PetCanvas follows the pet unit's HP / MP; no arguments = full again (H5: pet HP is not kept). */
  setBattleVitals(hp?: number, mp?: number): void {
    const pet = this.battlePet();
    if (!pet) return;
    pet.currentHp = hp ?? pet.property.finalHp;
    pet.currentMp = mp ?? pet.property.finalMp;
    this.refreshHud();
  }
}
