// Name index for the description-driven gift bag opener. Port of Go item/effect_desc_bag_index.go: every item and equipment
// template name plus the currency labels that have a grant path (basic vang / bac / danh vong, the H5 special currencies);
// labels without a grant path (kim phieu, pha le, kinh nghiem, game currencies this port has no balance for) are indexed as
// unsupported so a bag naming them fails instead of silently dropping part of its contents. Keys are descBagNameKey.
// Test templates (is_test > 0 or a "test" token) are never matched, so a name shared with a test template resolves to the live
// one. A key that maps to several targets, or to both a template and a currency, is ambiguous and never granted, except one
// equipment template sharing its name with type 550/508 "card" items (fashion / mounts). Names in DESC_BAG_NAME_ALIASES are
// forced to their mapped template. `parenNames` holds every live name that also has a live "Name (...)" variant.

import { CURRENCY_IDS, type CurrencyKey } from '@mc/shared';
import { DESC_BAG_NAME_ALIASES } from './aliases';
import { GAME_CURRENCY_LABELS } from '../tables/game-currency-labels';
import { descBagNameKey } from './text';

export type DescBagKind = 'item' | 'equip' | 'basic' | 'game' | 'unsupported';

export interface DescBagTarget {
  kind: DescBagKind;
  id: number; // template id (item / equip) or the Go currency id
  name: string;
  type: number;
  color: number;
  test: boolean;
  info: string; // item description, used by the "Name (qualifier)*N" check
  key?: string; // basic: 'money' | 'gold' | 'honor'; game: the CurrencyKey
}

export const isCurrencyTarget = (t: DescBagTarget): boolean => t.kind === 'basic' || t.kind === 'game' || t.kind === 'unsupported';

/** The columns of an item / equipment template the index reads. */
export interface TemplateSummary {
  id: number;
  name: string;
  type: number;
  color: number;
  isTest: boolean;
  info: string;
}

interface ItemEntry {
  tokens: string[];
  target: DescBagTarget;
}

/** A name found in a token list: a live target, or an ambiguous name (several live targets, never granted). */
export type DescBagMatch =
  | { ambiguous: false; target: DescBagTarget; len: number; key: string }
  | { ambiguous: true; len: number; key: string };

const UNSUPPORTED_CURRENCIES = [
  'kim phiếu', 'vàng khóa', 'vàng khoá', 'bạc khóa', 'bạc khoá', 'pha lê', 'pha lê vĩnh hằng', 'pha lê cực hạn',
  'bụi ma thuật', 'kinh nghiệm', 'exp', 'điểm thần tu', 'điểm anh linh', 'exp mệnh hồn', 'điểm danh vọng',
];

/** Basic currencies the opener can pay: label -> [Go basic currency id, grant key]. */
const BASIC_CURRENCIES: Readonly<Record<string, readonly [number, string]>> = {
  'vàng': [1, 'gold'], 'bạc': [0, 'money'], 'danh vọng': [2, 'honor'],
};

const hasTestToken = (key: string): boolean => key.split(' ').includes('test');
const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/** One equipment template sharing a name with type 550 / 508 card items is the real content (fashion, mounts). */
function equipOverCards(targets: readonly DescBagTarget[]): DescBagTarget | null {
  let equip: DescBagTarget | null = null;
  let equips = 0;
  for (const t of targets) {
    if (t.kind === 'equip') {
      equip = t;
      equips++;
    } else if (!(t.kind === 'item' && (t.type === 550 || t.type === 508))) {
      return null;
    }
  }
  return equips === 1 ? equip : null;
}

export class DescBagIndex {
  readonly names = new Map<string, DescBagTarget[]>();
  maxLen = 0;
  readonly items: ItemEntry[] = [];
  readonly parenNames = new Set<string>();

  add(key: string, target: DescBagTarget): void {
    if (!key) return;
    const list = this.names.get(key) ?? [];
    list.push(target);
    this.names.set(key, list);
    this.maxLen = Math.max(this.maxLen, wordCount(key));
  }

  hasCurrency(key: string): boolean {
    return (this.names.get(key) ?? []).some(isCurrencyTarget);
  }

  /** The live target of a key: [target, ok, ambiguous]. */
  resolve(key: string): { target: DescBagTarget | null; ambiguous: boolean } {
    const live = (this.names.get(key) ?? []).filter((t) => !t.test);
    if (live.length === 0) return { target: null, ambiguous: false };
    if (live.length === 1) return { target: live[0], ambiguous: false };
    const equip = equipOverCards(live);
    return equip ? { target: equip, ambiguous: false } : { target: null, ambiguous: true };
  }

  /** Longest name starting at token `at`, preferring more tokens. */
  longestAt(tokens: readonly string[], at: number): DescBagMatch | null {
    const max = Math.min(this.maxLen, tokens.length - at);
    for (let n = max; n >= 1; n--) {
      const key = tokens.slice(at, at + n).join(' ');
      const { target, ambiguous } = this.resolve(key);
      if (target) return { ambiguous: false, target, len: n, key };
      if (ambiguous) return { ambiguous: true, len: n, key };
    }
    return null;
  }

  private markParenNames(): void {
    for (const [key, targets] of this.names) {
      const at = key.indexOf(' ( ');
      if (at > 0 && targets.some((t) => !t.test)) this.parenNames.add(key.slice(0, at));
    }
  }

  /** Builds the index from the template rows (items, equipment). */
  static build(items: readonly TemplateSummary[], equips: readonly TemplateSummary[]): DescBagIndex {
    const idx = new DescBagIndex();
    const byId = new Map<number, DescBagTarget>();
    for (const t of items) {
      if (!t.name.trim()) continue;
      const key = descBagNameKey(t.name);
      const target: DescBagTarget = {
        kind: 'item', id: t.id, name: t.name, type: t.type, color: t.color, test: t.isTest || hasTestToken(key), info: t.info,
      };
      idx.add(key, target);
      byId.set(t.id, target);
      if (!target.test) idx.items.push({ tokens: key.split(' ').filter(Boolean), target });
    }
    for (const t of equips) {
      if (!t.name.trim()) continue;
      const key = descBagNameKey(t.name);
      idx.add(key, {
        kind: 'equip', id: t.id, name: t.name, type: t.type, color: t.color, test: t.isTest || hasTestToken(key), info: '',
      });
    }
    for (const [label, [id, key]] of Object.entries(BASIC_CURRENCIES)) {
      idx.add(descBagNameKey(label), { kind: 'basic', id, name: label, type: 0, color: 0, test: false, info: '', key });
    }
    for (const [clientKey, label] of GAME_CURRENCY_LABELS) {
      if (wordCount(label) < 2) continue;
      const grantable = clientKey in CURRENCY_IDS;
      idx.add(descBagNameKey(label), {
        kind: grantable ? 'game' : 'unsupported', id: grantable ? CURRENCY_IDS[clientKey as CurrencyKey] : 0, name: label,
        type: 0, color: 0, test: false, info: '', ...(grantable ? { key: clientKey } : {}),
      });
    }
    for (const label of UNSUPPORTED_CURRENCIES) {
      const key = descBagNameKey(label);
      if (!idx.hasCurrency(key)) idx.add(key, { kind: 'unsupported', id: 0, name: label, type: 0, color: 0, test: false, info: '' });
    }
    for (const [key, id] of Object.entries(DESC_BAG_NAME_ALIASES)) {
      const target = byId.get(id);
      if (target && !target.test) {
        idx.names.set(key, []);
        idx.add(key, target);
      }
    }
    idx.markParenNames();
    idx.items.sort((a, b) => a.target.id - b.target.id);
    return idx;
  }
}
