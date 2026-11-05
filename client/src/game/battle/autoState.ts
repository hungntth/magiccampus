// Auto-battle client state: the on/off flag (module state, lost on reload like Flash), the client-only auto-defence
// checkboxes (localStorage `mc.autoDefend`) and the settings view: character keys from player.interfaceData, pet keys from
// the battle pet's `pi` bucket. Listeners let the HUD Auto box follow the flag.

import {
  AUTO_DEFAULTS, autoKeysOf, isPetAutoKey, PetState, type AutoBattleSettings, type AutoSettingKey, type PlayerData, type PetView,
} from '@mc/shared';

const STORE_KEY = 'mc.autoDefend';

let on = false;
let player: PlayerData | null = null;
const listeners = new Set<(on: boolean) => void>();
const defend = loadDefend();

function loadDefend(): { player: boolean; pet: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as { player?: unknown; pet?: unknown };
    return { player: raw.player === true, pet: raw.pet === true };
  } catch {
    return { player: false, pet: false };
  }
}

export const autoState = {
  get on(): boolean {
    return on;
  },
  set(value: boolean): void {
    if (on === value) return;
    on = value;
    for (const fn of listeners) fn(on);
  },
  onChange(fn: (on: boolean) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Called once the player object exists (login). */
  bind(p: PlayerData): void {
    player = p;
  },
  defend(pet: boolean): boolean {
    return pet ? defend.pet : defend.player;
  },
  setDefend(pet: boolean, value: boolean): void {
    if (pet) defend.pet = value;
    else defend.player = value;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(defend));
    } catch {
      /* storage unavailable: the flag lives for this session only */
    }
  },
  battlePet(): PetView | undefined {
    return player ? Object.values(player.petList).find((p) => p.state === PetState.BATTLE) : undefined;
  },
  /** The flat settings map the auto brain reads (defaults filled). */
  settings(): AutoBattleSettings {
    const out: Record<string, number> = { ...AUTO_DEFAULTS };
    const own = player?.interfaceData ?? {};
    for (const k of autoKeysOf(false)) if (typeof own[k] === 'number') out[k] = own[k] as number;
    const pi = autoState.battlePet()?.pi ?? {};
    for (const k of autoKeysOf(true)) if (typeof pi[k] === 'number') out[k] = pi[k] as number;
    return out;
  },
  /** Mirrors a successful uif / skillSetBattle write locally. */
  store(key: AutoSettingKey, value: number): void {
    if (!player) return;
    if (isPetAutoKey(key)) {
      const pet = autoState.battlePet();
      if (pet) pet.pi = { ...(pet.pi ?? {}), [key]: value };
      return;
    }
    player.interfaceData = { ...(player.interfaceData ?? {}), [key]: value };
  },
};
