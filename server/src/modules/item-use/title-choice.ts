// Title choice bags (Go effect_desc_title.go titleChoiceFor): a description "Tu chon 1 trong nhung danh hieu A, B, C ... N ngay"
// offers the title medals of those titles lasting N days (templates 4961-4963 "Tui Qua Tan Huy Chuong"). The titles are matched by
// name key, the medals by their "( N ngay )" name label and a single type-33 award row; a title without exactly one medal fails.
// Pure: the title index and the medal lookup are injected.

import { descBagIsInteger, descBagStartsWith, descBagTokens } from './desc-bag/text';

const HEAD = 'tự chọn 1 trong những danh hiệu';

/** Title name key (descBagNameKey) -> title ids. */
export type TitleKeys = ReadonlyMap<string, readonly number[]>;
/** Medal item ids by the title they award, for the medals whose name carries `label` ("( 3 ngày )"). */
export type MedalsByTitle = (label: string) => ReadonlyMap<number, readonly number[]>;

/** The medal item ids to offer (one per title, in description order), or null when the description is not a title choice. */
export function titleChoiceMedals(description: string, titles: TitleKeys, medals: MedalsByTitle): number[] | null {
  const tokens = descBagTokens(description);
  if (!descBagStartsWith(tokens, 0, HEAD)) return null;
  let rest = tokens.slice(HEAD.split(' ').length);
  while (rest.length > 0 && rest[rest.length - 1] === '.') rest = rest.slice(0, -1);
  if (rest.length < 3 || rest[rest.length - 1] !== 'ngày') return null;
  const days = descBagIsInteger(rest[rest.length - 2]);
  if (days === null || days <= 0) return null;
  const ids: number[] = [];
  for (const part of rest.slice(0, -2).join(' ').split(',')) {
    const found = titles.get(part.trim());
    if (!found || found.length !== 1) return null;
    ids.push(found[0]);
  }
  if (ids.length < 2) return null;
  const byTitle = medals(`( ${days} ngày )`);
  const out: number[] = [];
  for (const id of ids) {
    const medal = byTitle.get(id);
    if (!medal || medal.length !== 1) return null;
    out.push(medal[0]);
  }
  return out;
}
