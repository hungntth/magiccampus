// Text normalisation for the description-driven gift bag opener. Port of Go item/effect_desc_bag_text.go: descriptions and
// template names go through the same tokenizer so they can be compared token by token: NFC, lower case, literal "\n" / "/n" /
// quote escapes dropped, full-width CJK punctuation mapped to ASCII, letters+digits split into words (letter/digit boundaries
// split "x3" -> "x" "3", but "0.05" stays one number token), every other symbol becomes its own token.

/** Go descBagTextReplacer: first matching pair at each position wins (longest escape first, as in the Go list order). */
const REPLACEMENTS: readonly (readonly [string, string])[] = [
  ['\\\\n', ' '], ['\\n', ' '], ['\\r', ' '], ['\\t', ' '], ['/n', ' '], ['\\"', ' '],
  ['\n', ' '], ['\r', ' '], ['\t', ' '], ['"', ' '], ['“', ' '], ['”', ' '], ['＂', ' '],
  ['，', ','], ['、', ','], ['；', ';'], ['：', ':'], ['。', '.'], ['！', '!'], ['？', '?'],
  ['（', '('], ['）', ')'], ['＊', '*'], ['×', '*'], ['＇', "'"], ['‘', "'"], ['’', "'"],
];

/** strings.NewReplacer: scans left to right, at each position tries the pairs in order. */
function replaceAll(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; ) {
    const hit = REPLACEMENTS.find(([from]) => value.startsWith(from, i));
    if (hit) {
      out += hit[1];
      i += hit[0].length;
    } else {
      out += value[i];
      i++;
    }
  }
  return out;
}

const isDigit = (c: string): boolean => /\p{Nd}/u.test(c);
const isLetter = (c: string): boolean => /[\p{L}\p{Mn}\p{Mc}]/u.test(c);

export function descBagTokens(value: string): string[] {
  const chars = [...replaceAll(value).normalize('NFC').toLowerCase()];
  const tokens: string[] = [];
  let word = '';
  let wordIsDigit = false;
  const flush = (): void => {
    if (word) tokens.push(word);
    word = '';
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (isDigit(c)) {
      if (word && !wordIsDigit) flush();
      wordIsDigit = true;
      word += c;
    } else if (c === '.' && wordIsDigit && word && i + 1 < chars.length && isDigit(chars[i + 1])) {
      word += '.';
    } else if (isLetter(c)) {
      if (word && wordIsDigit) flush();
      wordIsDigit = false;
      word += c;
    } else if (/\s/u.test(c)) {
      flush();
    } else {
      flush();
      tokens.push(c);
    }
  }
  flush();
  return tokens;
}

/** Name key: tokens joined by a space, trailing "." / "!" dropped. */
export function descBagNameKey(name: string): string {
  const tokens = descBagTokens(name);
  while (tokens.length > 0 && (tokens[tokens.length - 1] === '.' || tokens[tokens.length - 1] === '!')) tokens.pop();
  return tokens.join(' ');
}

export function descBagIsNumber(token: string): boolean {
  return token !== '' && /^[\p{Nd}.]+$/u.test(token);
}

/** Up to 7 ASCII digits, else null. */
export function descBagIsInteger(token: string): number | null {
  return /^[0-9]{1,7}$/.test(token) ? Number(token) : null;
}

const words = (phrase: string): string[] => phrase.split(/\s+/).filter(Boolean);

export function descBagFindPhrase(tokens: readonly string[], from: number, phrase: string): number {
  const needle = words(phrase);
  if (needle.length === 0) return -1;
  for (let i = from; i + needle.length <= tokens.length; i++) {
    if (needle.every((w, j) => tokens[i + j] === w)) return i;
  }
  return -1;
}

export function descBagHasPhrase(tokens: readonly string[], phrase: string): boolean {
  return descBagFindPhrase(tokens, 0, phrase) >= 0;
}

export function descBagStartsWith(tokens: readonly string[], at: number, phrase: string): boolean {
  const needle = words(phrase);
  if (at + needle.length > tokens.length) return false;
  return needle.every((w, j) => tokens[at + j] === w);
}

export function descBagStartsWithAny(tokens: readonly string[], at: number, phrases: readonly string[]): boolean {
  return phrases.some((p) => descBagStartsWith(tokens, at, p));
}

export function descBagFindHedge(tokens: readonly string[], list: readonly string[]): string {
  return list.find((w) => descBagHasPhrase(tokens, w)) ?? '';
}

export function descBagSnippet(tokens: readonly string[], at: number): string {
  const end = Math.min(tokens.length, at + 5);
  return at >= end ? '<end>' : tokens.slice(at, end).join(' ');
}

/** Bag-like names (Túi / Gói / Hộp / Rương / Bao / Lì Xì / Phần Thưởng) that the description opener accepts. */
const NAME_WORDS = ['túi', 'gói', 'hộp', 'rương', 'bao', 'lì xì', 'phần thưởng'];

export function isDescBagName(name: string): boolean {
  const tokens = descBagTokens(name);
  return NAME_WORDS.some((w) => descBagHasPhrase(tokens, w));
}
