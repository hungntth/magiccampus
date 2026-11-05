// StarBattleReport card (Flash POPU_STAR_BATTLE_REPORT): shown instead of the generic result when battlePlayEnd answers a star report
// {r:1, s:{id, level, score, time (ms), die}}. Title "Đánh giá", five stars and the comment from the score (STAR_BATTLE_REPORT[1..5]),
// Thời gian, Tử vong, Điểm (counts up like the Flash tween) and "Xác nhận" (auto-closes after 15 s).

import { reportComment, reportStars, reportTime, type StarBattleEndReply } from '@mc/shared';
import { el } from '../actWindow';
import { stageEl } from '../stage';
import './star.css';

type StarReport = NonNullable<StarBattleEndReply['s']>;

export function showStarReport(rep: StarReport, onClose: () => void = () => undefined): void {
  const card = el('star-report');
  const lit = reportStars(rep.score);
  const stars = el('sr-stars');
  for (let i = 0; i < 5; i++) stars.appendChild(el(i < lit ? 'sr-star on' : 'sr-star', '★'));
  const score = el('sr-score', '0');
  const rows = el('sr-rows');
  for (const [k, v] of [['Thời gian:', reportTime(rep.time)], ['Tử vong:', String(rep.die || 0)]] as const) rows.append(el('sr-k', k), el('sr-v', v));
  rows.append(el('sr-k', 'Điểm:'), score);
  const ok = el('act-btn', 'Xác nhận', 'button');
  card.append(el('sr-title', 'Đánh giá'), stars, el('sr-comment', reportComment(rep.score)), rows, ok);
  let cur = 0;
  const step = Math.max(1, Math.ceil(rep.score / 30));
  const tick = window.setInterval(() => {
    cur = Math.min(rep.score, cur + step);
    score.textContent = String(cur);
    if (cur >= rep.score) window.clearInterval(tick);
  }, 33);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    window.clearInterval(tick);
    window.clearTimeout(auto);
    card.remove();
    onClose();
  };
  const auto = window.setTimeout(close, 15_000);
  ok.onclick = close;
  stageEl().appendChild(card);
}
