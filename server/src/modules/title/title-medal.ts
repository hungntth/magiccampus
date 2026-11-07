// Title medals (type 550 "Huy Chương …", legacy item/effect_desc_title.go + title/item_duration.go): which title a medal
// grants when it has no data_tbl_item_award type 33 row (read from the description), how long the grant lasts, and how
// a re-grant changes the owned row's expiry (title/grant.go: re-use always adds time, permanent stays permanent). Pure.

/** data_tbl_title.k: forever titles ignore the medal's `t` minutes. */
export const TITLE_KIND_FOREVER = 1;
export const ITEM_AWARD_TITLE = 33;

/** Huy Chương Chức Nghiệp 749-794 (sư phụ rank medals): the description names no title, the title id is the rank (legacy teacherMedalTitles). */
export const TEACHER_MEDAL_TITLES: Readonly<Record<number, number>> = { 749: 1, 788: 2, 791: 3, 792: 4, 793: 5, 794: 6 };

const ESCAPES = /\\\\n|\\n|\\r|\\t|\/n|\\"|[\n\r\t"“”＂]/g;
const FULL_WIDTH: Record<string, string> = {
  '，': ',', '、': ',', '；': ';', '：': ':', '。': '.', '！': '!', '？': '?', '（': '(', '）': ')',
};

/** Go descBagTokens: NFC + lower case, escapes / quotes dropped, words split on letter/digit boundaries, symbols alone. */
export function descTokens(value: string): string[] {
  const text = value.replace(ESCAPES, ' ').replace(/[，、；：。！？（）]/g, (c) => FULL_WIDTH[c] ?? c).normalize('NFC').toLowerCase();
  const chars = [...text];
  const out: string[] = [];
  let word = '';
  let digit = false;
  const flush = () => {
    if (word) out.push(word);
    word = '';
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\p{Nd}/u.test(c)) {
      if (word && !digit) flush();
      digit = true;
      word += c;
    } else if (c === '.' && digit && word && /\p{Nd}/u.test(chars[i + 1] ?? '')) {
      word += c;
    } else if (/[\p{L}\p{M}]/u.test(c)) {
      if (word && digit) flush();
      digit = false;
      word += c;
    } else if (/\s/u.test(c)) {
      flush();
    } else {
      flush();
      out.push(c);
    }
  }
  flush();
  return out;
}

const trimEnd = (tokens: string[]): string[] => {
  const t = [...tokens];
  while (t.length > 0 && (t[t.length - 1] === '!' || t[t.length - 1] === '.')) t.pop();
  return t;
};

/** Title-name key shared by the description reader and the title index. */
export const titleKey = (name: string): string => trimEnd(descTokens(name)).join(' ');

function findPhrase(tokens: readonly string[], from: number, phrase: string): number {
  const needle = phrase.split(' ');
  for (let i = from; i + needle.length <= tokens.length; i++) {
    if (needle.every((w, j) => tokens[i + j] === w)) return i;
  }
  return -1;
}

const VERBS = new Set(['tặng', 'phong', 'tăng', 'nhận']);
const HEDGES = ['đổi', 'có thể', 'cơ hội', 'mảnh vỡ', 'ngẫu nhiên', 'chọn'];

/**
 * Title-name key read from a medal description ("Bạn được tặng danh hiệu “X”", "Nhấp đôi để nhận danh hiệu X",
 * "Danh hiệu X"), or null. Hedged heads (đổi / có thể / …) and a second "danh hiệu" are not read.
 */
export function descTitleKey(desc: string): string | null {
  const tokens = descTokens(desc);
  const at = findPhrase(tokens, 0, 'danh hiệu');
  if (at < 0 || (at > 0 && !VERBS.has(tokens[at - 1]))) return null;
  const head = tokens.slice(0, at);
  if (HEDGES.some((h) => findPhrase(head, 0, h) >= 0) || findPhrase(tokens, at + 2, 'danh hiệu') >= 0) return null;
  const name = trimEnd(tokens.slice(at + 2));
  return name.length > 0 ? name.join(' ') : null;
}

export interface MedalGrant {
  /** 0 = permanent. */
  seconds: number;
  /** The medal's own YYYYMMDDHHMM deadline has passed: nothing is granted, the medal is kept. */
  expired: boolean;
}

const LABEL_RE = /\(\s*(\d+)\s*(ngày|giờ)\s*\)/;
const DESC_RE = /(?:duy trì|thời hạn|có hiệu lực)\s*(\d+)\s*(ngày|giờ)/;
const DEADLINE_MIN = 100_000_000_000;
const ICT_OFFSET_MS = 7 * 3600_000;

const squash = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

function labelSeconds(re: RegExp, text: string): number {
  const m = re.exec(text);
  const n = m ? Number(m[1]) : 0;
  if (!m || !Number.isInteger(n) || n <= 0) return 0;
  return m[2] === 'giờ' ? n * 3600 : n * 86400;
}

/** YYYYMMDDHHMM in ICT (UTC+7) -> epoch ms, or null. */
function deadlineMs(v: number): number | null {
  const s = String(Math.trunc(v));
  if (s.length !== 12) return null;
  const [y, mo, d, h, mi] = [s.slice(0, 4), s.slice(4, 6), s.slice(6, 8), s.slice(8, 10), s.slice(10, 12)].map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) - ICT_OFFSET_MS;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Grant length (legacy ResolveItemGrant): name label "(7 Ngày)" wins, then "duy trì 30 ngày" in the description, then
 * the template `t` in minutes (not for forever titles). A 12-digit `t` is the medal's own deadline.
 */
export function resolveMedalGrant(name: string, desc: string, t: number, titleKind: number, now: number): MedalGrant {
  if (t >= DEADLINE_MIN) {
    const end = deadlineMs(t);
    if (end === null) return { seconds: 0, expired: false };
    if (end <= now) return { seconds: 0, expired: true };
    return { seconds: titleKind === TITLE_KIND_FOREVER ? 0 : Math.ceil((end - now) / 1000), expired: false };
  }
  const label = labelSeconds(LABEL_RE, squash(name)) || labelSeconds(DESC_RE, squash(desc));
  if (label > 0) return { seconds: label, expired: false };
  if (titleKind !== TITLE_KIND_FOREVER && t > 0) return { seconds: Math.round(t * 60), expired: false };
  return { seconds: 0, expired: false };
}

/**
 * New expiry for a grant of `seconds` (0 = permanent) over the owned row's current expiry (`undefined` = not owned,
 * `null` = permanent). Returns `unchanged` when an owned permanent title gets a timed grant.
 */
export function nextTitleExpiry(
  cur: Date | null | undefined, seconds: number, now: number,
): { expiresAt: Date | null; first: boolean } | 'unchanged' {
  const fresh = seconds > 0 ? new Date(now + seconds * 1000) : null;
  if (cur === undefined) return { expiresAt: fresh, first: true };
  if (cur !== null && cur.getTime() <= now) return { expiresAt: fresh, first: false };
  if (seconds <= 0) return cur === null ? 'unchanged' : { expiresAt: null, first: false };
  if (cur === null) return 'unchanged';
  return { expiresAt: new Date(cur.getTime() + seconds * 1000), first: false };
}
