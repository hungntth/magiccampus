// Description parser for the description-driven gift bag opener. Port of Go item/effect_desc_bag_parse.go. A bag description is
// read as "<head> <trigger> <list> <tail>": the trigger is chứa / nhận (được) / gồm / bên trong có, or "chọn" (not followed by
// nhận, after tự / có thể / để / mở / nhấp đôi) which makes a choice bag; the list is entries "N [viên|cái|...] Name", "Name*N" or
// a bare "Name" (count 1) separated by "," "và" "cùng" "+" (a "*N" entry may be followed directly by the next one), optionally
// closed by "mỗi loại" which gives uncounted entries the count to their left. Every list entry must resolve to exactly one
// template or currency (index.ts), otherwise the bag is rejected. The list stops at a sentence end or at ", <explanation>".
// Mode: "chọn" before the list -> choice, "ngẫu nhiên" -> random (one listed entry, or a category "1 X" matched against item
// names), otherwise fixed (grant everything). Hedged wording anywhere outside the parsed list rejects the bag: failing is
// preferred over granting the wrong thing. "Mở có thể nhận: A*N, B*N" is a fixed list when every entry has its own count;
// "Name (qualifier)*N" keeps Name when no live "Name (...)" template exists; a hedge-free "(note)" after "*N" is skipped;
// untranslated Chinese text ends the list like a sentence end.

import { descBagDescription } from './aliases';
import type { DescBagIndex } from './index';
import { isCurrencyTarget } from './index';
import {
  CHOICE_PREDECESSORS, EXPLANATION_STARTERS, HEDGE_WORDS, LIST_FILLERS, MEASURE_WORDS, OPTION_HEAD_HEDGES, SEPARATORS, TERMINATORS,
  TRIGGER_PREDECESSORS, descBagCategoryAt, descBagCheckDuration, descBagCheckTail, descBagCloseParen, descBagIsHan,
  descBagOneKindAt, descBagParseCategory, descBagSkipQualifier, descBagValidateEntries,
} from './rules';
import {
  descBagFindHedge, descBagHasPhrase, descBagIsInteger, descBagSnippet, descBagStartsWith, descBagStartsWithAny, descBagTokens,
} from './text';
import type { DescBagEntry, DescBagParse } from './types';

const fail = (reason: string): DescBagParse => ({ plan: null, reason });

/** Token index where the list starts when a content trigger sits at `i`, or null. */
function triggerAt(tokens: readonly string[], i: number): number | null {
  const prev = i > 0 ? tokens[i - 1] : '';
  if (i > 0 && tokens[i] !== 'chọn' && !TRIGGER_PREDECESSORS.has(prev) && !SEPARATORS.has(prev) && !TERMINATORS.has(prev) && prev !== ':') {
    return null;
  }
  switch (tokens[i]) {
    case 'chọn':
      return i + 1 < tokens.length && tokens[i + 1] !== 'nhận' && (i === 0 || CHOICE_PREDECESSORS.has(prev)) ? i + 1 : null;
    case 'chứa':
    case 'gồm':
      return i + 1;
    case 'nhận':
      return i + 1 < tokens.length && tokens[i + 1] === 'được' ? i + 2 : i + 1;
    case 'có':
      if (i > 0 && prev === 'trong') return i + 1 < tokens.length && tokens[i + 1] === 'chứa' ? null : i + 1;
      return null;
    default:
      return null;
  }
}

export function parseDescBag(idx: DescBagIndex | null, bagId: number, bagName: string, description: string): DescBagParse {
  if (!idx) return fail('no game data');
  const tokens = descBagTokens(descBagDescription(bagId, description));
  if (descBagHasPhrase(tokens, 'cần')) return fail('requirement wording (cần)');
  let firstReason = '';
  for (let i = 0; i < tokens.length; i++) {
    let start = triggerAt(tokens, i);
    if (i === 0 && start === null && descBagIsInteger(tokens[0]) !== null) start = 0;
    if (start === null) continue;
    const res = parseFrom(idx, bagId, tokens, i, start);
    if (res.plan) {
      const dur = descBagCheckDuration(bagName, res.plan);
      return dur ? fail(dur) : res;
    }
    if (!firstReason) firstReason = res.reason;
  }
  return fail(firstReason || 'no content trigger');
}

function parseFrom(idx: DescBagIndex, bagId: number, tokens: readonly string[], trigger: number, start: number): DescBagParse {
  const head = tokens.slice(0, trigger);
  let pos = start;
  while (pos < tokens.length && tokens[pos] === ':') pos++;
  let random = descBagHasPhrase(head, 'ngẫu nhiên');
  if (descBagStartsWith(tokens, pos, 'ngẫu nhiên')) {
    random = true;
    pos += 2;
    if (tokens[pos] === 'nhận') pos++;
    if (tokens[pos] === 'được') pos++;
  }
  const choice = descBagHasPhrase(head, 'chọn') || tokens[trigger] === 'chọn';
  if (random && choice) return fail('both random and choice wording');
  if (random || choice) return parseOptions(idx, bagId, head, tokens, pos, choice);
  let hedgeHead = head;
  let explicitOnly = tokens[trigger] === 'có';
  if (tokens[trigger] === 'nhận' && pos > start && head.length >= 2 && head[head.length - 2] === 'có' && head[head.length - 1] === 'thể') {
    hedgeHead = head.slice(0, -2);
    explicitOnly = true;
  }
  const hedge = descBagFindHedge(hedgeHead, HEDGE_WORDS);
  if (hedge) return fail(`hedged head: ${hedge}`);
  const list = parseList(idx, tokens, pos, false);
  if (list.reason) return fail(list.reason);
  const tail = descBagCheckTail(tokens, list.stop);
  if (tail) return fail(tail);
  const bad = descBagValidateEntries(list.entries, bagId, true);
  if (bad) return fail(bad);
  if (explicitOnly && list.entries.some((e) => !e.explicit)) return fail(`${tokens[trigger]} list without explicit counts`);
  return { plan: { mode: 'fixed', entries: list.entries }, reason: '' };
}

function allFillers(tokens: readonly string[]): boolean {
  return !tokens.some((t) => SEPARATORS.has(t) || TERMINATORS.has(t) || t === 'hoặc');
}

function indexOfToken(tokens: readonly string[], from: number, token: string, within: number): number {
  for (let i = from; i < tokens.length && i < from + within; i++) if (tokens[i] === token) return i;
  return -1;
}

function parseOptions(
  idx: DescBagIndex, bagId: number, head: readonly string[], tokens: readonly string[], pos: number, choice: boolean,
): DescBagParse {
  const headHedge = descBagFindHedge(head, OPTION_HEAD_HEDGES);
  if (headHedge) return fail(`hedged head: ${headHedge}`);
  if (!choice) {
    const hedge = descBagFindHedge(tokens.slice(pos), ['như', 'và nhiều', 'khác', 'may mắn nhận']);
    if (hedge) return fail(`non-exhaustive random list: ${hedge}`);
  }
  let listStart = pos < tokens.length && (tokens[pos] === '1' || tokens[pos] === 'một') ? pos + 1 : pos;
  const colon = indexOfToken(tokens, listStart, ':', 12);
  if (colon >= 0 && allFillers(tokens.slice(listStart, colon))) {
    listStart = colon + 1;
  } else {
    while (listStart < tokens.length && (LIST_FILLERS.has(tokens[listStart]) || descBagOneKindAt(tokens, listStart))) listStart++;
  }
  const list = parseList(idx, tokens, listStart, true);
  if (!list.reason && list.entries.length >= 2) {
    const tail = descBagCheckTail(tokens, list.stop);
    if (tail) return fail(tail);
    const bad = descBagValidateEntries(list.entries, bagId, false);
    if (bad) return fail(bad);
    for (const e of list.entries) if (e.count <= 0) e.count = 1;
    return { plan: { mode: choice ? 'choice' : 'random', entries: list.entries }, reason: '' };
  }
  if (choice) {
    const cat = descBagCategoryAt(idx, bagId, tokens, listStart, 'choice');
    if (cat.plan) return cat;
    return fail(list.reason || 'choice list has fewer than 2 options');
  }
  return descBagParseCategory(idx, bagId, tokens, pos);
}

interface ListResult {
  entries: DescBagEntry[];
  stop: number;
  reason: string;
}

function parseList(idx: DescBagIndex, tokens: readonly string[], start: number, allowOr: boolean): ListResult {
  const entries: DescBagEntry[] = [];
  const prefixCount: boolean[] = [];
  const afterVa: boolean[] = [];
  let each = false;
  let lastStar = false;
  let sawSeparator = true;
  let sawVa = false;
  let pos = start;
  const stopWith = (reason: string): ListResult => ({ entries: [], stop: pos, reason });
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (SEPARATORS.has(tok) || (allowOr && tok === 'hoặc')) {
      sawSeparator = true;
      sawVa = tok === 'và';
      pos++;
      continue;
    }
    if (tok === 'hoặc') return stopWith('fixed list uses hoặc');
    if (TERMINATORS.has(tok) || descBagIsHan(tok)) break;
    if (entries.length > 0 && ['mỗi loại', 'mỗi thứ', 'mỗi món'].some((p) => descBagStartsWith(tokens, pos, p))) {
      each = true;
      pos += 2;
      continue;
    }
    if (entries.length > 0 && sawSeparator && descBagStartsWithAny(tokens, pos, EXPLANATION_STARTERS)) break;
    if (entries.length > 0 && !sawSeparator && !lastStar) return stopWith(`unexpected text after entry: ${descBagSnippet(tokens, pos)}`);
    const parsed = parseEntry(idx, tokens, pos);
    if ('reason' in parsed) return stopWith(parsed.reason);
    entries.push(parsed.entry);
    prefixCount.push(parsed.hadPrefix);
    afterVa.push(sawVa);
    pos = parsed.next;
    lastStar = parsed.star;
    sawSeparator = false;
    sawVa = false;
  }
  if (entries.length === 0) return stopWith('empty list');
  if (each) {
    let last = 0;
    for (const e of entries) {
      if (e.count > 0) {
        last = e.count;
        continue;
      }
      if (last === 0) return stopWith('mỗi loại without a leading count');
      e.count = last;
    }
  } else {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].count > 0) continue;
      if (i > 0 && afterVa[i] && prefixCount[i - 1] && entries[i - 1].count > 1 && !isCurrencyTarget(entries[i - 1].target)) {
        return stopWith(`ambiguous count for ${entries[i].target.name}`);
      }
      if (!allowOr) entries[i].count = 1;
    }
  }
  return { entries, stop: pos, reason: '' };
}

type EntryResult = { entry: DescBagEntry; next: number; hadPrefix: boolean; star: boolean } | { reason: string };

function parseEntry(idx: DescBagIndex, tokens: readonly string[], pos: number): EntryResult {
  let count = 0;
  let p = pos;
  let hadPrefix = false;
  const lead = descBagIsInteger(tokens[p]);
  if (lead !== null) {
    if (lead <= 0) return { reason: 'zero count' };
    count = lead;
    hadPrefix = true;
    p++;
  }
  if (p >= tokens.length) return { reason: 'count without a name' };
  let match = idx.longestAt(tokens, p);
  if (!match && hadPrefix && MEASURE_WORDS.has(tokens[p]) && p + 1 < tokens.length) {
    p++;
    match = idx.longestAt(tokens, p);
  }
  if (!match) return { reason: `unresolved: ${descBagSnippet(tokens, p)}` };
  if (match.ambiguous) return { reason: `ambiguous name: ${match.key}` };
  const { target } = match;
  p += match.len;
  if (p < tokens.length && tokens[p] === '(') {
    const next = descBagSkipQualifier(idx, tokens, p, match);
    if (next !== null) p = next;
  }
  let star = false;
  if (p + 1 < tokens.length && (tokens[p] === '*' || tokens[p] === 'x')) {
    const n = descBagIsInteger(tokens[p + 1]);
    if (n !== null && n > 0) {
      if (hadPrefix) return { reason: `double count for ${target.name}` };
      count = n;
      star = true;
      p += 2;
    }
  }
  if (isCurrencyTarget(target) && count <= 0) return { reason: `currency without amount: ${target.name}` };
  if (star && p < tokens.length && tokens[p] === '(') {
    const end = descBagCloseParen(tokens, p);
    if (end > 0 && !descBagFindHedge(tokens.slice(p + 1, end), HEDGE_WORDS)) p = end + 1;
  }
  if (p < tokens.length && tokens[p] === '(') return { reason: `parenthetical after ${target.name}` };
  return { entry: { target, count, explicit: count > 0 }, next: p, hadPrefix, star };
}
