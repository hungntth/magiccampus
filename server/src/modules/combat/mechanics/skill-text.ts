// Description parsers for NPC skills and battle buffs (M10 E2.0), ports of Go application/combat skill_damage_desc.go
// (damage ratio), skill_target_desc.go (area count), skill_boss_special.go (kill text), buff_dot.go (DOT amount) and
// buff_support_effects.go (HOT, immunity, full Miễn Giảm). TBL_SKILL / TBL_BUFF keep these numbers only in the text.

export const normalizeText = (s: string): string => s.replace(/\\[nr]/g, ' ').replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const NUM = '(\\d+(?:[.,]\\d+)?)';
const KIND = '(?:vật lý|ma pháp|pháp thuật)';
const RATIO_PATTERNS: ReadonlyArray<[RegExp, number]> = [
  [new RegExp(`${NUM}\\s*%\\s*(?:lực\\s*)?(?:sát thương|tấn công|công kích|thương tổn|lực công)`, 'gu'), 0.01],
  [new RegExp(`${NUM}\\s*%\\s*${KIND}\\s*(?:công kích|tấn công)`, 'gu'), 0.01],
  [new RegExp(`sát thương\\s*(?:bằng\\s*)?${NUM}\\s*%\\s*(?:pháp|vật|ma|phép)\\s*(?:công|lý|thuật|pháp)`, 'gu'), 0.01],
  [new RegExp(`sát thương\\s*(?:${KIND}\\s*(?:là\\s*)?|là\\s*)${NUM}\\s*%`, 'gu'), 0.01],
  [new RegExp(`gây\\s*${NUM}\\s*%\\s*cho`, 'gu'), 0.01],
  [new RegExp(`bằng\\s*${NUM}\\s*lần\\s*(?:công kích|tấn công|lực công|sát thương)`, 'gu'), 1],
  [new RegExp(`(?:^|[^\\p{L}])x\\s*${NUM}\\s*sát thương`, 'gu'), 1],
  [/(\d+(?:\.\d+)?)%的?(?:魔法|物理)?(?:攻击)?伤害/gu, 0.01],
  [/(\d+(?:\.\d+)?)倍(?:物理|魔法)?攻击/gu, 1],
];
const FLAT_RE = new RegExp(`(\\d+)\\s*(?:điểm\\s*sát thương|sát thương\\s*${KIND})`, 'gu');
const EXCLUDED_PREFIX = /(?:chuyển|lấy|giảm|tăng|hấp thu|hấp thụ|phản|gấp|lượng sát thương bằng|hp bằng)\s*$/u;
const PHYS_RE = /vật lý|物理/u;
const MAGIC_RE = /ma pháp|pháp thuật|pháp công|魔法/u;

const parseNum = (raw: string): number => {
  const v = Number(raw.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** First match of `re` (global) whose number is not right after an excluded word; [index of the number, raw]. */
function firstRatio(s: string, re: RegExp): [number, string] | null {
  re.lastIndex = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const raw = m[1] ?? '';
    const at = m.index + m[0].indexOf(raw);
    if (EXCLUDED_PREFIX.test(s.slice(Math.max(0, at - 40), at))) continue;
    return [at, raw];
  }
  return null;
}

function kindNear(s: string, pos: number): 'physical' | 'magic' | undefined {
  const pick = (w: string): 'physical' | 'magic' | undefined => {
    const p = w.search(PHYS_RE);
    const m = w.search(MAGIC_RE);
    if (p >= 0 && (m < 0 || p < m)) return 'physical';
    return m >= 0 ? 'magic' : undefined;
  };
  return pick(s.slice(pos, pos + 60)) ?? pick(s.slice(Math.max(0, pos - 30), pos));
}

export interface DamageRatio {
  ratio: number;
  flat: number;
  kind?: 'physical' | 'magic';
}

/** Go parseSkillDamageRatio: the earliest ratio of the text wins; "N điểm sát thương" = 100 % + N. */
export function parseDamageRatio(description: string): DamageRatio | null {
  const s = normalizeText(description);
  if (!s) return null;
  let best = -1;
  let out: DamageRatio | null = null;
  for (const [re, scale] of RATIO_PATTERNS) {
    const hit = firstRatio(s, re);
    if (!hit || (best >= 0 && hit[0] >= best)) continue;
    const v = parseNum(hit[1]);
    if (v <= 0) continue;
    best = hit[0];
    out = { ratio: v * scale, flat: 0 };
  }
  if (out) return { ...out, kind: kindNear(s, best) };
  const flat = firstRatio(s, FLAT_RE);
  if (!flat) return null;
  const n = Math.trunc(Number(flat[1]));
  return n > 0 ? { ratio: 1, flat: n, kind: kindNear(s, flat[0]) } : null;
}

const TARGET_NOUN = '(?:mục tiêu|kẻ địch|đối thủ|kẻ thù)';
const TARGET_PHRASE_RE = new RegExp(`tất cả\\s*(?:các\\s*)?${TARGET_NOUN}|(\\d+)\\s*${TARGET_NOUN}|(\\d+)\\s*个目标`, 'u');

/** Go parseDescriptionTargets: the first target phrase; "ngẫu nhiên" right after it makes the area random. */
export function descriptionTargets(description: string): { all: boolean; count: number; random: boolean } | null {
  const s = normalizeText(description);
  const m = TARGET_PHRASE_RE.exec(s);
  if (!m) return null;
  const random = /^\s*ngẫu nhiên/u.test(s.slice(m.index + m[0].length));
  const n = m[1] ?? m[2];
  return n !== undefined ? { all: false, count: Number(n), random } : { all: true, count: 0, random };
}

const KILL_RE = new RegExp(`(?:giết chết|trực tiếp giết|tiêu diệt)\\s*(?:\\d+\\s*)?${TARGET_NOUN}`, 'u');
/** Go bossSpecialKillRe (type 23 "Giết chết 1 mục tiêu"). */
export const isKillText = (description: string): boolean => KILL_RE.test(normalizeText(description));

export type DotKind = 'magic' | 'maxHp' | 'curHp' | 'flat';
export interface DotDef {
  kind: DotKind;
  value: number;
  capAttack?: number; // × caster attack
  capMagic?: number;
}

const DOT_MAGIC_RE = /([\d.]+)\s*(?:lần\s*)?sát thương ma pháp/u;
const DOT_PCT_RE = /([\d.]+)\s*%\s*(giới hạn\s*)?hp(\s*cao nhất|\s*hiện tại)?/u;
const DOT_LIMIT_RE = /([\d.]+)\s*%\s*giới hạn/u;
const DOT_FLAT_RE = /giảm\s*([\d.]+)\s*hp/u;
const DOT_CAP_RE = /tối đa bằng\s*(?:x\s*([\d.]+)\s*)?(?:tấn công|công)\s*(vl|vật lý|mp|ma pháp|phép)(?:\s*x\s*([\d.]+))?/u;

/** Go parseBuffDot (state-40 and kind-5 buffs); the caster-spirit kind has no H5 stat and is skipped. */
export function parseDot(description: string): DotDef | null {
  const s = normalizeText(description);
  if (!s) return null;
  let dot: DotDef | null = null;
  let m: RegExpExecArray | null;
  if ((m = DOT_MAGIC_RE.exec(s))) dot = { kind: 'magic', value: parseNum(m[1]) };
  else if ((m = DOT_LIMIT_RE.exec(s))) dot = { kind: 'maxHp', value: parseNum(m[1]) };
  else if ((m = DOT_PCT_RE.exec(s))) dot = { kind: (m[3] ?? '').trim() === 'cao nhất' ? 'maxHp' : 'curHp', value: parseNum(m[1]) };
  else if ((m = DOT_FLAT_RE.exec(s))) dot = { kind: 'flat', value: parseNum(m[1]) };
  if (!dot || dot.value <= 0) return null;
  const cap = DOT_CAP_RE.exec(s);
  const times = cap ? parseNum(cap[1] ?? cap[3] ?? '') : 0;
  if (cap && times > 0) {
    if (['mp', 'ma pháp', 'phép'].includes(cap[2])) dot.capMagic = times;
    else dot.capAttack = times;
  }
  return dot;
}

export type HotKind = 'maxMp' | 'maxHp' | 'attack' | 'flat' | 'magic';
export interface HotDef {
  kind: HotKind;
  value: number;
}

const HOT_RULES: ReadonlyArray<[RegExp, HotKind]> = [
  [/(\d+(?:\.\d+)?)\s*%\s*mp tối đa/u, 'maxMp'],
  [/(\d+(?:\.\d+)?)\s*%\s*giới hạn hp/u, 'maxHp'],
  [/(\d+(?:\.\d+)?)\s*%\s*lực tấn công chuyển thành hp/u, 'attack'],
  [/(?:hồi phục|phục hồi|khôi phục|hồi)\s*(\d+)\s*(?:điểm\s*)?hp/u, 'flat'],
  [/(?:phục hồi|hồi phục|trị liệu)\s*(\d+(?:\.\d+)?)\s*%/u, 'magic'],
];

/** Go supportHot: kind 2 / 7 rows or text with "mỗi lượt". */
export function parseHot(description: string, buffKind: number): HotDef | null {
  const s = normalizeText(description);
  if (buffKind !== 2 && buffKind !== 7 && !s.includes('mỗi lượt')) return null;
  for (const [re, kind] of HOT_RULES) {
    const m = re.exec(s);
    const v = m ? parseNum(m[1]) : 0;
    if (v > 0) return { kind, value: v };
  }
  return null;
}

/** Go supportMods immunity branch: 908 / 909 immunity and 910 / 911 full Miễn Giảm as pseudo props. */
export function immunityProps(description: string): number[] {
  const s = normalizeText(description);
  if (/vô địch/u.test(s)) return [908, 909];
  if (/(?:hấp thu|hút hết) tất cả sát thương vật lý/u.test(s)) return [908];
  if (/(?:hấp thu|hút hết) tất cả sát thương (?:pháp thuật|ma pháp)/u.test(s)) return [909];
  const m = /^tăng miễn giảm sát thương (vl|vật lý|mp|ma pháp)(?:[ ,.]|$)/u.exec(s);
  if (m) return [m[1] === 'vl' || m[1] === 'vật lý' ? 910 : 911];
  return [];
}
