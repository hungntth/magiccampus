// Monthly calendar tab of the "Báo danh nhận quà" window (legacy DailySignInPanel): day grid, sign / retroactive / crit /
// lucky-claim buttons with the Flash enable rules, crit meter, spend counter and the rule text. Pure rendering.

import { DAILY_SIGNIN_CONF, daysInMonth, type DailySignInInit } from '@mc/shared';

export interface CalendarHost {
  calendar(): DailySignInInit | null;
  consumeTotal(): number;
  onSign(): void;
  onRetro(): void;
  onCrit(): void;
  onLucky(): void;
}

const el = (cls: string, text?: string, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function button(label: string, enabled: boolean, click: () => void, id: string): HTMLButtonElement {
  const b = el('act-btn', label, 'button') as HTMLButtonElement;
  b.dataset.act = id;
  b.disabled = !enabled;
  b.onclick = click;
  return b;
}

/** Flash setBtnsEnable: the lucky claim needs the open day = today, unclaimed and every day through today signed. */
export function luckyEnabled(c: DailySignInInit): boolean {
  const { date } = c.time;
  const { getAwardTime, actDays } = c.data;
  if (!(getAwardTime.day > 0 && getAwardTime.day === date && !getAwardTime.flag)) return false;
  for (let d = 1; d <= date; d++) if (!actDays[String(d)]) return false;
  return true;
}

export function renderCalendar(host: CalendarHost): HTMLElement {
  const wrap = el('act-body');
  const c = host.calendar();
  if (!c) {
    wrap.appendChild(el('act-muted', 'Đang tải...'));
    return wrap;
  }
  const { year, month, date } = c.time;
  const signedToday = c.data.actDays[String(date)] === true;
  const header = el('act-row');
  header.append(el('act-gold', `Tháng ${month}/${year}`), el('act-muted', `Tỉ lệ Bạo kích: ${c.data.crit}%`),
    el('act-muted', `Vàng đã tiêu trong sự kiện: ${host.consumeTotal()}`));
  wrap.appendChild(header);

  const grid = el('act-cal');
  for (const w of WEEK) grid.appendChild(el('h', w));
  const first = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday-first offset
  for (let i = 0; i < first; i++) grid.appendChild(el('act-cell empty'));
  const jsDay = (d: number): number => new Date(Date.UTC(year, month - 1, d)).getUTCDay();
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const cell = el(`act-cell${d === date ? ' today' : ''}${c.data.actDays[String(d)] ? ' signed' : ''}`);
    cell.dataset.day = String(d);
    cell.appendChild(el('', String(d)));
    if (c.data.actDays[String(d)]) cell.appendChild(el('tk', '✓'));
    if (jsDay(d) === c.conf.surpriseDay) cell.appendChild(el('tag', 'Vui vẻ'));
    else if (jsDay(d) === c.conf.luckyDay) cell.appendChild(el('tag', 'Cảm ơn'));
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);

  const btns = el('act-row');
  btns.append(
    button('Báo danh', !signedToday, host.onSign, 'sign'),
    button(`Ký bù (${c.conf.retroactivePrice} vàng)`, true, host.onRetro, 'retro'),
    button(`Tăng Bạo kích (${c.conf.critPrice} vàng)`, c.data.crit < 100, host.onCrit, 'crit'),
    button('Nhận thưởng may mắn', luckyEnabled(c), host.onLucky, 'lucky'),
  );
  wrap.appendChild(btns);
  wrap.appendChild(rules(c));
  return wrap;
}

function rules(c: DailySignInInit): HTMLElement {
  const tiers = c.conf.luckyPoint
    .map((p, w) => (p > 0 ? `tuần ${w}: tiêu ${p} vàng nhận ${c.conf.luckyGold[w]} vàng` : ''))
    .filter((t) => t !== '');
  const box = el('act-rules');
  const lines = [
    `Cần cấp ${DAILY_SIGNIN_CONF.levelGate} trở lên. Mỗi ngày báo danh nhận kinh nghiệm và bạc khóa theo cấp; mỗi lần báo danh hoặc ký bù tăng ${DAILY_SIGNIN_CONF.critStep}% tỉ lệ Bạo kích, Bạo kích nhận thêm phần thưởng.`,
    'Mỗi thứ 7 (ngày vui vẻ): báo danh đủ các ngày từ đầu tháng nhận thêm thưởng bất ngờ.',
    tiers.length > 0
      ? `Mỗi thứ 5 (ngày cảm ơn): báo danh đủ rồi nhận vàng theo mức vàng đã tiêu ký bù / tăng Bạo kích (${tiers.join('; ')}).`
      : 'Mỗi thứ 5 (ngày cảm ơn): tháng này chưa có mốc thưởng may mắn.',
  ];
  for (const l of lines) box.appendChild(el('', l));
  return box;
}
