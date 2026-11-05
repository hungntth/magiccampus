// Tabs 2-4 of the "Lật Bài Truyền Thuyết" window (Flash FlopPassPanel bangBtn1..3): stage rewards of the current picks, the rules with the
// weekly dates, and the top-10 ranking with the rank award. Pure DOM builders over the conf / charInfo / rank payloads.

import { FLOP, FLOP_TEXT, type FlopCharInfo, type FlopConf, type FlopRankReply, type FlopRewardRow } from '@mc/shared';
import { iconUrl } from '../assets';
import { button, el } from './actWindow';

function rewardCell(row: FlopRewardRow | undefined): HTMLElement {
  const cell = el('fp-reward');
  if (!row) return cell;
  const img = el('fp-icon', undefined, 'img') as HTMLImageElement;
  img.src = iconUrl(row.iconCode ?? '0');
  cell.append(img, el('fp-rname', `${row.name ?? `#${row.iid}`} x${row.n}`));
  return cell;
}

/** "Phần thưởng": the reward of every stage under the character's picks (conf.pi[stage][ii[stage]]). */
export function rewardsTab(conf: FlopConf, info: FlopCharInfo): HTMLElement {
  const box = el('fp-list');
  for (let stage = 1; stage <= FLOP.STAGES; stage++) {
    const row = el('fp-row');
    row.append(el('fp-stage', `Ải ${stage}`), rewardCell(conf.pi[String(stage)]?.[String(info.ii[String(stage)] ?? 0)]));
    if (info.ci.i > stage) row.append(el('act-tick', 'Đã qua'));
    box.append(row);
  }
  return box;
}

const fmt = (ms: number): string => {
  const d = new Date(ms + 7 * 3_600_000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

export function rulesTab(conf: FlopConf): HTMLElement {
  const box = el('fp-list');
  for (const r of FLOP_TEXT.RULES) box.append(el('act-muted', r));
  const playEnd = conf.end - 2 * 86_400_000;
  box.append(
    el('act-gold', `Thời gian chơi: ${fmt(conf.start)} - ${fmt(playEnd)}`),
    el('act-gold', `Nhận thưởng xếp hạng: ${fmt(playEnd + 15 * 60_000)} - ${fmt(conf.end)}`),
    el('act-muted', `Phí: lật bài ${conf.pr}, làm mới ${conf.r}, hồi sinh ${conf.rb}, làm lại từ ải 1 miễn phí ${FLOP.FREE_RESTARTS_DAILY} lần mỗi ngày rồi ${FLOP.RESTART_COST}.`),
  );
  return box;
}

/** "Xếp hạng": rows with the award of each rank; the own row gets "Nhận thưởng" when the window is open and nothing was taken. */
export function rankTab(conf: FlopConf, rank: FlopRankReply | null, myId: number, awardTaken: boolean, onTake: () => void): HTMLElement {
  const box = el('fp-list');
  if (!rank) {
    box.append(el('act-muted', 'Đang tải...'));
    return box;
  }
  if (rank.info.length === 0) box.append(el('act-muted', 'Chưa có ai trên bảng xếp hạng.'));
  rank.info.forEach((r, i) => {
    const row = el(`fp-row${r.c === myId ? ' me' : ''}`);
    row.append(el('fp-stage', `#${i + 1}`), el('fp-name', `[${r.s}] ${r.n}`), el('fp-passes', `${r.p} ải`));
    const award = conf.ri[String(i + 1 + FLOP.RANK_KEY_BASE)];
    if (award) row.append(el('fp-awards', Object.values(award).map((a) => `${a.name ?? `#${a.iid}`} x${a.n}`).join(', ')));
    if (r.c === myId && rank.f) row.append(button(awardTaken ? 'Đã nhận' : 'Nhận thưởng', onTake, 'act-btn on', awardTaken));
    box.append(row);
  });
  return box;
}
