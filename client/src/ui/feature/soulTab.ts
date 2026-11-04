// "Luyện Hồn" tab (TrainSoulPanel): level, progress bar (exp inside the level), current / next level stats and the train button.

import { TRAIN_SOUL, type TrainSoulInfo } from '@mc/shared';
import { bar, button, el, fmt, propLines } from './dom';

export interface SoulTabApi {
  info: TrainSoulInfo | null;
  crystals: number;
  playerLevel: number;
  busy: boolean;
  onTrain(): void;
}

export function renderSoul(body: HTMLElement, api: SoulTabApi): void {
  const i = api.info;
  if (!i) {
    body.appendChild(el('div', 'ft-muted', 'Đang tải...'));
    return;
  }
  body.appendChild(el('div', 'ft-title', `Lv ${i.soulLvl} / ${TRAIN_SOUL.MAX_LEVEL}`));
  body.appendChild(bar(i.maxed ? 1 : i.soulExp, i.maxed ? 1 : i.need, i.maxed ? 'Đã đạt cấp cao nhất' : `Tiến độ: ${fmt(i.soulExp)} / ${fmt(i.need)}`));
  const cols = el('div', 'ft-cols');
  const cur = el('div', 'ft-col');
  cur.append(el('div', 'ft-h', 'Thuộc tính hiện tại'), propLines(i.current));
  const next = el('div', 'ft-col');
  next.append(el('div', 'ft-h', 'Thuộc tính cấp kế'), propLines(i.next));
  cols.append(cur, next);
  body.appendChild(cols);
  body.appendChild(el('div', 'ft-line', `Kết tinh thần bí: ${fmt(api.crystals)}`));
  body.appendChild(el('div', 'ft-muted', `Cần cấp ${TRAIN_SOUL.MIN_PLAYER_LEVEL}; 1 kết tinh = 1 điểm tiến độ (tối đa ${fmt(TRAIN_SOUL.STEP)} mỗi lần).`));
  const can = !i.maxed && api.crystals > 0 && api.playerLevel >= TRAIN_SOUL.MIN_PLAYER_LEVEL && !api.busy;
  body.appendChild(button('Luyện Hồn', api.onTrain, !can));
}
