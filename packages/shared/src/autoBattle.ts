// Auto-battle settings (legacy GLOBAL_SETTING keys read by Battle.battleAuto / battlePetAuto) and their validation.
// Written by skillSetBattle / uif; odd bs/bt slots belong to the character, even slots (and bs10) to the active pet.

/** bt<N> values: what bs<N> holds. */
export const AutoSlotKind = { NONE: 0, ITEM: 29, SKILL: 52 } as const;

export type AutoSettingKey =
  | 'bs1' | 'bs2' | 'bs3' | 'bs4' | 'bs5' | 'bs6' | 'bs7' | 'bs8' | 'bs9' | 'bs10'
  | 'bt1' | 'bt2' | 'bt3' | 'bt4' | 'bt5' | 'bt6'
  | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8' | 'p9';

/** Flat settings map: bs1..bs10, bt1..bt6, p2..p9 (all integers). Character and pet keys share one namespace. */
export type AutoBattleSettings = Partial<Record<AutoSettingKey, number>>;

/** The flat login `interfaceData` map (auto keys plus later hotbar / system keys). */
export type InterfaceData = Record<string, number | boolean>;

const BS_KEYS = ['bs1', 'bs2', 'bs3', 'bs4', 'bs5', 'bs6', 'bs7', 'bs8', 'bs9', 'bs10'] as const;
const BT_KEYS = ['bt1', 'bt2', 'bt3', 'bt4', 'bt5', 'bt6'] as const;
const P_KEYS = ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] as const;
const ALL_KEYS: ReadonlySet<string> = new Set<string>([...BS_KEYS, ...BT_KEYS, ...P_KEYS]);
const PET_KEYS: ReadonlySet<string> = new Set<string>(['bs2', 'bs4', 'bs6', 'bs8', 'bs10', 'bt2', 'bt4', 'bt6', 'p6', 'p7', 'p8', 'p9']);

function defaults(): Required<AutoBattleSettings> {
  const out = {} as Record<AutoSettingKey, number>;
  for (const k of BS_KEYS) out[k] = 0;
  for (const k of BT_KEYS) out[k] = 0;
  for (const k of P_KEYS) out[k] = 10;
  return out;
}

/** Legacy defaults (interface_settings.go): thresholds 10 %, every slot empty. */
export const AUTO_DEFAULTS: Readonly<Required<AutoBattleSettings>> = defaults();

export function isAutoSettingKey(key: string): key is AutoSettingKey {
  return ALL_KEYS.has(key);
}

/** Pet keys: bs even + bs10, bt2/4/6, p6..p9. */
export function isPetAutoKey(key: AutoSettingKey): boolean {
  return PET_KEYS.has(key);
}

/** Range check: p* 0..100, bt* in AutoSlotKind, bs* integer >= 0. */
export function validAutoValue(key: AutoSettingKey, value: number): boolean {
  if (!Number.isInteger(value)) return false;
  if (key.startsWith('p')) return value >= 0 && value <= 100;
  if (key.startsWith('bt')) return value === AutoSlotKind.NONE || value === AutoSlotKind.ITEM || value === AutoSlotKind.SKILL;
  return value >= 0;
}

/** Keys of one side, for splitting a flat map into the character and pet buckets. */
export function autoKeysOf(pet: boolean): AutoSettingKey[] {
  return [...BS_KEYS, ...BT_KEYS, ...P_KEYS].filter((k) => isPetAutoKey(k) === pet);
}

/** skillSetBattle slots: 1/3/5/7 character, 2/4/6/8 pet. */
export function validSkillSlot(slot: number, isPet: boolean): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= 8 && (slot % 2 === 0) === isPet;
}
