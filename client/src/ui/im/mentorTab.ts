// "Sư đồ" tab body of the IM window (legacy IMPanel teacher tab): the caller's teacher (last reported / current level, Hồi báo,
// Xóa sư phụ or the Bái sư box), the caller's teacher rank (title, points, Thăng cấp) and the student grid (name, reported level,
// reported exp, honor, Xóa đồ đệ). Pure view: MentorController owns the state and the RPCs and re-registers the render.

import { MENTOR_TEXT, canUpgradeTeacher, rankTitle, studentCap, upgradePoints, type InitTsRow } from '@mc/shared';
import type { ImLists, ImTabSpec } from './imTabs';
import { el } from './imList';
import './mentor.css';

export interface MentorView {
  tl: number;
  tp: number;
  teacherId: number;
  teacherName: string;
  /** Teacher's reported level / exp of the caller's link ("ll"). */
  last: { level: number; exp: number };
  level: number;
  students: readonly InitTsRow[];
  selected: number | null;
  draft: string;
}

export interface MentorActions {
  view(): MentorView;
  draft(name: string): void;
  findTeacher(name: string): void;
  findStudent(name: string): void;
  report(): void;
  delTeacher(): void;
  delStudent(id: number): void;
  upgrade(): void;
  select(id: number | null): void;
  /** Called on every render of the tab: refreshes the grid when stale. */
  shown(): void;
}

const num = (n: number): string => n.toLocaleString('vi-VN');
const line = (cls: string, text: string): HTMLElement => el('div', `mentor-line ${cls}`, text);

function button(label: string, run: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', 'friend-btn mentor-btn', label);
  b.disabled = disabled;
  b.onclick = run;
  return b;
}

function teacherBlock(v: MentorView, a: MentorActions): HTMLElement {
  const box = el('div', 'mentor-block mentor-teacher');
  box.appendChild(el('div', 'mentor-head', 'Sư phụ'));
  if (v.teacherId <= 0) {
    box.appendChild(line('mentor-none', MENTOR_TEXT.noTeacher));
    return box;
  }
  box.append(
    line('mentor-teacher-name', `Sư phụ của bạn là: ${v.teacherName}`),
    line('mentor-last', `Cấp độ hồi báo lần trước: ${v.last.level}`),
    line('mentor-now', `Cấp độ hiện tại: ${v.level}`),
  );
  const row = el('div', 'mentor-actions');
  row.append(button('Hồi báo', a.report, v.level <= v.last.level), button('Xóa sư phụ', a.delTeacher));
  box.appendChild(row);
  return box;
}

function rankBlock(v: MentorView, a: MentorActions): HTMLElement {
  const box = el('div', 'mentor-block mentor-rank');
  box.appendChild(el('div', 'mentor-head', 'Chức nghiệp'));
  const gate = upgradePoints(v.tl);
  box.appendChild(line('mentor-rank-line', `C.Độ ch.nghiệp: ${rankTitle(v.tl)}, điểm ch.nghiệp: ${num(v.tp)}, đồ đệ: ${v.students.length}/${studentCap(v.tl)}`));
  if (Number.isFinite(gate)) box.appendChild(line('mentor-gate', `Cấp tiếp theo cần ${num(gate)} điểm chức nghiệp`));
  const name = el('input', 'friend-input mentor-name');
  name.maxLength = 30;
  name.placeholder = 'Tên người chơi';
  name.value = v.draft;
  name.oninput = () => a.draft(name.value);
  name.onkeydown = (e) => e.stopPropagation();
  const row = el('div', 'mentor-actions');
  row.append(
    button('Bái sư', () => a.findTeacher(name.value.trim()), v.teacherId > 0),
    button('Nhận đồ đệ', () => a.findStudent(name.value.trim())),
    button('Thăng cấp', a.upgrade, !canUpgradeTeacher(v.tl, v.tp)),
  );
  box.append(name, row);
  return box;
}

function studentGrid(v: MentorView, a: MentorActions): HTMLElement {
  const box = el('div', 'mentor-block mentor-students');
  box.appendChild(el('div', 'mentor-head', 'Đồ đệ'));
  const head = el('div', 'mentor-row mentor-row-head');
  head.append(el('span', 'mentor-col-name', 'Tên'), el('span', 'mentor-col', 'Cấp'), el('span', 'mentor-col', 'Điểm'), el('span', 'mentor-col', 'Cống hiến'));
  box.appendChild(head);
  if (v.students.length === 0) box.appendChild(line('mentor-none', 'Chưa có đồ đệ'));
  for (const s of v.students) {
    const level = s.ll.split('|')[0] ?? '0';
    const exp = Number(s.ll.split('|')[1] ?? 0);
    const row = el('div', `mentor-row${s.id === v.selected ? ' selected' : ''}`);
    row.dataset.cid = String(s.id);
    row.append(el('span', 'mentor-col-name', s.name), el('span', 'mentor-col', level), el('span', 'mentor-col', num(exp)), el('span', 'mentor-col', String(s.honor)));
    row.onclick = () => a.select(s.id === v.selected ? null : s.id);
    box.appendChild(row);
  }
  const act = el('div', 'mentor-actions');
  act.appendChild(button('Xóa đồ đệ', () => v.selected !== null && a.delStudent(v.selected), v.selected === null));
  box.appendChild(act);
  return box;
}

export function mentorTabSpec(a: MentorActions): ImTabSpec {
  return {
    id: 'tutor',
    label: (l: ImLists) => `Sư đồ (${l.tutor.length})`,
    emptyText: 'Chưa có sư phụ hay đồ đệ',
    renderBody(body: HTMLElement): void {
      a.shown();
      const v = a.view();
      const wrap = el('div', 'mentor-body');
      wrap.append(teacherBlock(v, a), rankBlock(v, a), studentGrid(v, a));
      body.appendChild(wrap);
    },
  };
}
