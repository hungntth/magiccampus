// Modal form shared by "Tạo nhóm" (createRoom) and the leader's "Cập nhật" (setRoomConfig): type, content, level range and the
// planned Vietnam time. Validation here is advisory (level / catalog / 5 min..2 h window); the server stays authoritative.

import { MAX_LEVEL, RECRUIT_TYPE_NAMES, ROOM, ROOM_TEXT, nextScheduledAt, recruitEntry, type CreateRoomArg, type RecruitType } from '@mc/shared';
import { stageEl } from '../stage';
import { toast } from '../screens';
import { catalogOfType, clampInt, el, vnClock } from './roomUtil';

export interface RoomFormInit {
  title: string;
  playerLevel: number;
  /** Existing values (config dialog); omitted for a new room. */
  current?: CreateRoomArg;
}

/** Opens the form; `onSubmit` gets the validated argument. Returns a function that closes it. */
export function openRoomForm(init: RoomFormInit, onSubmit: (arg: CreateRoomArg) => void): () => void {
  const root = el('div', 'gr-form');
  const type = el('select');
  const fid = el('select');
  const min = el('input');
  const max = el('input');
  const hour = el('input');
  const minute = el('input');
  for (const t of [1, 2, 3] as RecruitType[]) type.append(new Option(RECRUIT_TYPE_NAMES[t], String(t)));
  for (const i of [min, max, hour, minute]) i.type = 'number';
  const soon = vnClock(Date.now() + ROOM.minWindowMs * 2);
  const cur = init.current;
  type.value = String(cur?.type ?? 1);

  const fillFids = (keep?: number): void => {
    fid.replaceChildren(...catalogOfType(Number(type.value)).map((e) => new Option(`${e.name} (Cấp ${e.minLevel}+)`, String(e.fid))));
    if (keep !== undefined && recruitEntry(keep)?.type === Number(type.value)) fid.value = String(keep);
  };
  const applyDefaults = (): void => {
    const e = recruitEntry(Number(fid.value));
    min.value = String(e?.minLevel ?? 1);
    max.value = String(MAX_LEVEL);
  };
  fillFids(cur?.fid);
  if (cur) {
    min.value = String(cur.minLevel);
    max.value = String(cur.maxLevel);
  } else {
    applyDefaults();
  }
  hour.value = String(cur?.hour ?? soon.hour);
  minute.value = String(cur?.minute ?? soon.minute);
  type.onchange = () => {
    fillFids();
    applyDefaults();
  };
  fid.onchange = applyDefaults;

  const field = (label: string, ...inputs: HTMLElement[]): HTMLElement => {
    const row = el('div', 'gr-form-row');
    row.append(el('label', '', label), ...inputs);
    return row;
  };
  const hint = el('div', 'gr-form-hint', ROOM_TEXT.BAD_TIME);
  const ok = el('button', 'gr-btn', 'Đồng ý');
  const cancel = el('button', 'gr-btn', 'Hủy');
  const buttons = el('div', 'gr-form-btns');
  buttons.append(ok, cancel);
  root.append(
    el('div', 'gr-form-title', init.title), field('Loại', type), field('Nội dung', fid),
    field('Cấp từ', min, el('span', '', ' đến '), max), field('Giờ hẹn (VN)', hour, el('span', '', ':'), minute), hint, buttons,
  );

  const close = (): void => root.remove();
  cancel.onclick = close;
  ok.onclick = () => {
    const entry = recruitEntry(Number(fid.value));
    if (!entry) return toast(ROOM_TEXT.BAD_WILL, true);
    const arg: CreateRoomArg = {
      fid: entry.fid, type: entry.type,
      minLevel: clampInt(min.value, 1, MAX_LEVEL, entry.minLevel), maxLevel: clampInt(max.value, 1, MAX_LEVEL, MAX_LEVEL),
      hour: clampInt(hour.value, 0, 23, 0), minute: clampInt(minute.value, 0, 59, 0),
    };
    if (arg.minLevel < entry.minLevel || arg.maxLevel < arg.minLevel) return toast(ROOM_TEXT.BAD_WILL, true);
    if (arg.minLevel > init.playerLevel) return toast(ROOM_TEXT.LEVEL_LOW, true);
    if (nextScheduledAt(Date.now(), arg.hour, arg.minute) === null) {
      hint.classList.add('bad');
      return toast(ROOM_TEXT.BAD_TIME, true);
    }
    close();
    onSubmit(arg);
  };
  stageEl().appendChild(root);
  return close;
}
