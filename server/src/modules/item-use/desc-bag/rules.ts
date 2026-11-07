// Word lists and safety rules for the description-driven gift bag opener (parse.ts). Port of Go item/effect_desc_bag_rules.go:
// separators / terminators / measure words, the trigger predecessor allow-list (so "Chứng Nhận" inside a name is not read as
// "nhận"), hedge words that reject a bag, the tail check after the parsed list, entry validation (no unsupported currency, never
// the bag itself), the random category matcher ("1 Tẩy Tủy Đan cao cấp" -> names "<prefix> <1-3 words> <suffix>", one item
// type, at most 40 candidates; also choice bags "Chọn nhận 1 trong các loại X", at least 2) and the duration guard (a "(30 Ngày)"
// bag must grant a "30 ngày" item). Chinese-text detection ends a list; parenthesis matching skips notes and "Name (qualifier)*N".

import type { DescBagIndex, DescBagMatch } from './index';
import { isCurrencyTarget } from './index';
import {
  descBagFindHedge, descBagHasPhrase, descBagIsInteger, descBagIsNumber, descBagStartsWithAny, descBagTokens,
} from './text';
import type { DescBagEntry, DescBagMode, DescBagParse, DescBagPlan } from './types';

const set = (...w: string[]): ReadonlySet<string> => new Set(w);

export const SEPARATORS = set(',', 'và', 'cùng', '+', '&', '/');
export const TERMINATORS = set('.', '!', ';', '?');
export const MEASURE_WORDS = set(
  'viên', 'cái', 'quyển', 'cuốn', 'bình', 'chiếc', 'phần', 'đóa', 'đoá', 'bó', 'lọ', 'tấm', 'bộ', 'gói', 'chai',
);
export const EXPLANATION_STARTERS = [
  'dùng', 'sử dụng', 'mỗi viên', 'mỗi cái', 'mỗi quyển', 'mỗi bình', 'là', 'bạn', 'nhấp đôi', 'kích hoạt',
  'sách này', 'tăng', 'giúp', 'cấp độ', 'dành cho', 'để', 'có thể dùng', 'có thể sử dụng', 'sau khi',
];
export const HEDGE_WORDS = [
  'ngẫu nhiên', 'xác suất', 'cơ hội', 'có thể', 'có khả năng', 'may mắn', 'nhiều phần', 'và nhiều', 'khác',
  'hoặc', 'tối đa', 'tối thiểu', 'lượng lớn', 'đồng thời', 'ngoài ra', 'thêm', 'kèm', 'chọn', '1 trong', 'nếu',
  'tương ứng', 'một số', 'các loại', 'nhiều',
];
const EXPLANATION_HEDGES = ['thêm', 'đồng thời', 'ngoài ra', 'kèm', 'ngẫu nhiên nhận', 'chọn'];
export const TRIGGER_PREDECESSORS = set(
  'mở', 'sẽ', 'để', 'khi', 'nhiên', 'chọn', 'trong', 'quà', 'túi', 'ra', 'dụng', 'thể', 'đôi', 'bên', 'rương', 'hộp', 'bao', 'có',
);
export const CHOICE_PREDECESSORS = set('tự', 'thể', 'để', 'mở', 'đôi', 'sẽ', 'khi');
export const OPTION_HEAD_HEDGES = ['xác suất', 'cơ hội', 'nếu', 'may mắn', 'tối đa', 'lượng lớn', 'có khả năng', 'đồng thời', 'ngoài ra'];
export const LIST_FILLERS = set(
  'trong', 'các', 'những', 'số', 'sau', 'như', 'gồm', 'bao', 'bất', 'kỳ', 'kì', 'loại', ':', '-', 'một', 'vật', 'phẩm', 'được',
);

export function descBagOneKindAt(tokens: readonly string[], pos: number): boolean {
  return pos + 1 < tokens.length && (tokens[pos] === '1' || tokens[pos] === 'một') && tokens[pos + 1] === 'loại';
}

export function descBagIsHan(token: string): boolean {
  return /\p{Script=Han}/u.test(token);
}

/** Index of the closing ")" within 12 tokens of `open`, or -1 (a nested "(" also gives -1). */
export function descBagCloseParen(tokens: readonly string[], open: number): number {
  for (let i = open + 1; i < tokens.length && i <= open + 12; i++) {
    if (tokens[i] === ')') return i;
    if (tokens[i] === '(') return -1;
  }
  return -1;
}

export function descBagCheckTail(tokens: readonly string[], stop: number): string {
  if (stop >= tokens.length) return '';
  let tail = tokens.slice(stop);
  while (tail.length > 0 && (TERMINATORS.has(tail[0]) || SEPARATORS.has(tail[0]))) tail = tail.slice(1);
  if (tail.length === 0) return '';
  const list = descBagStartsWithAny(tail, 0, EXPLANATION_STARTERS) ? EXPLANATION_HEDGES : HEDGE_WORDS;
  const hedge = descBagFindHedge(tail, list);
  return hedge ? `hedged tail: ${hedge}` : '';
}

export function descBagValidateEntries(entries: readonly DescBagEntry[], bagId: number, allowCurrency: boolean): string {
  for (const e of entries) {
    if (e.target.id === bagId && e.target.kind === 'item') return 'bag lists itself';
    if (e.target.kind === 'unsupported') return `unsupported currency: ${e.target.name}`;
    if (isCurrencyTarget(e.target) && !allowCurrency) return `currency in random/choice list: ${e.target.name}`;
  }
  return '';
}

/** A category name variant: "<prefix: first k tokens of the category> <1-3 words> <rest of the category>" (k >= 2). */
function categoryVariant(category: readonly string[], name: readonly string[]): boolean {
  for (let k = 2; k <= category.length; k++) {
    const prefix = category.slice(0, k);
    const suffix = category.slice(k);
    const middle = name.length - prefix.length - suffix.length;
    if (middle < 0 || middle > 3) continue;
    if (name.slice(0, k).join(' ') !== prefix.join(' ') || name.slice(name.length - suffix.length).join(' ') !== suffix.join(' ')) continue;
    if (name.slice(k, k + middle).every((t) => /[\p{L}\p{Nd}]/u.test([...t][0] ?? ''))) return true;
  }
  return false;
}

export function descBagCategoryAt(
  idx: DescBagIndex, bagId: number, tokens: readonly string[], pos: number, mode: DescBagMode,
): DescBagParse {
  let end = pos;
  while (end < tokens.length && !TERMINATORS.has(tokens[end])) {
    if (SEPARATORS.has(tokens[end]) || tokens[end] === 'hoặc' || tokens[end] === '(') {
      return { plan: null, reason: 'random category is not a single phrase' };
    }
    end++;
  }
  const tail = descBagCheckTail(tokens, end);
  if (tail) return { plan: null, reason: tail };
  const category = tokens.slice(pos, end);
  if (category.length < 2) return { plan: null, reason: 'random category too short' };
  const key = category.join(' ');
  const candidates: DescBagEntry['target'][] = [];
  let exact = false;
  for (const entry of idx.items) {
    if (entry.target.id === bagId || !categoryVariant(category, entry.tokens)) continue;
    if (entry.tokens.join(' ') === key) exact = true;
    candidates.push(entry.target);
  }
  if (candidates.length === 0) return { plan: null, reason: `random category matches nothing: ${key}` };
  if (exact && candidates.length > 1) return { plan: null, reason: `random category is both a name and a prefix: ${key}` };
  if (candidates.length > 40) return { plan: null, reason: `random category too broad (${candidates.length}): ${key}` };
  if (candidates.slice(1).some((c) => c.type !== candidates[0].type)) return { plan: null, reason: `random category mixes item types: ${key}` };
  if (mode === 'choice' && candidates.length < 2) return { plan: null, reason: `choice category has fewer than 2 options: ${key}` };
  const plan: DescBagPlan = { mode, entries: candidates.map((target) => ({ target, count: 1, explicit: false })) };
  return { plan, reason: '' };
}

export function descBagParseCategory(idx: DescBagIndex, bagId: number, tokens: readonly string[], pos: number): DescBagParse {
  if (pos >= tokens.length || (tokens[pos] !== '1' && tokens[pos] !== 'một')) {
    return { plan: null, reason: 'random without a single-item category' };
  }
  return descBagCategoryAt(idx, bagId, tokens, pos + 1, 'random');
}

/** A "(30 Ngày)" / "(2 giờ)" bag that grants exactly one fixed entry must grant an item whose name carries the same duration. */
export function descBagCheckDuration(bagName: string, plan: DescBagPlan): string {
  if (plan.mode !== 'fixed' || plan.entries.length !== 1) return '';
  const bag = descBagTokens(bagName);
  for (let i = 0; i + 1 < bag.length; i++) {
    if (descBagIsInteger(bag[i]) === null || (bag[i + 1] !== 'ngày' && bag[i + 1] !== 'giờ')) continue;
    const entry = descBagTokens(plan.entries[0].target.name);
    if (!descBagHasPhrase(entry, `${bag[i]} ${bag[i + 1]}`)) return `bag duration ${bag[i]} ${bag[i + 1]} not on ${plan.entries[0].target.name}`;
  }
  return '';
}

/**
 * "Name (qualifier)*N": the qualifier is skipped when the name has no live "Name (...)" variant, the match is an item, and every
 * number in the qualifier is on the template (name or description). Returns the token index after ")" or null.
 */
export function descBagSkipQualifier(idx: DescBagIndex, tokens: readonly string[], open: number, match: DescBagMatch): number | null {
  if (match.ambiguous || match.target.kind !== 'item' || idx.parenNames.has(match.key)) return null;
  const end = descBagCloseParen(tokens, open);
  if (end < 0 || end + 2 >= tokens.length || (tokens[end + 1] !== '*' && tokens[end + 1] !== 'x')) return null;
  const n = descBagIsInteger(tokens[end + 2]);
  if (n === null || n <= 0) return null;
  const inner = tokens.slice(open + 1, end);
  if (inner.length === 0 || inner.length > 6 || descBagFindHedge(inner, HEDGE_WORDS)) return null;
  const known = descBagTokens(`${match.target.name} ${match.target.info}`);
  let numbers = 0;
  for (const t of inner) {
    if (!descBagIsNumber(t)) continue;
    numbers++;
    if (!known.includes(t)) return null;
  }
  return numbers === 0 ? null : end + 1;
}
