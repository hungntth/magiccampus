// Wing part of the item tooltip: colour, level and its stat bonus, hole counts and the inlaid feathers (character holes first, then pet holes).

import { FEATHER_PROP_LABELS, FEATHER_TYPE, WING_COLOUR_NAMES, holeCounts, wingLevelPercent, type BagItem, type WingFeatherInfo } from '@mc/shared';

/** "Công vật lý +300" lines of an inlaid feather (type D = percent / rate points). */
export const featherText = (f: WingFeatherInfo): string => f.lines.map((l) => `${FEATHER_PROP_LABELS[l.prop] ?? `#${l.prop}`} +${l.value}${f.type === FEATHER_TYPE.D ? '%' : ''}`).join(', ');

/** Appends the wing lines to `root` (nothing for a non-wing). `line(text, cls)` builds one tooltip line. */
export function appendWingTip(item: BagItem, line: (text: string, cls: string) => void): void {
  const w = item.wing;
  if (!w) return;
  line(`Phẩm chất cánh: ${WING_COLOUR_NAMES[w.colour]}`, 'it-line');
  line(w.level > 0 ? `Cấp cánh: ${w.level} (+${wingLevelPercent(w.level)}% thuộc tính)` : 'Cấp cánh: 0', 'it-line it-prop');
  const { char, pet } = holeCounts(w.holes);
  line(`Lỗ lông vũ: ${char} nhân vật, ${pet} pet`, 'it-line');
  w.holes.forEach((tid, i) => {
    const f = tid > 0 ? w.feathers[String(tid)] : undefined;
    if (f) line(`${i % 2 === 0 ? 'Lông Vũ' : 'Lông Vũ (Pet)'}: ${f.name} - ${featherText(f)}`, 'it-line it-prop');
  });
}
