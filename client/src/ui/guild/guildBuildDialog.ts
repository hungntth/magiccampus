// Guild building dialogs (legacy ConstructionManager + GuildBuildProcess, rebuilt as DOM): the list of buildings an empty lot can
// take or the next level of a building (onShowExtInfo) with costs and prerequisites, and the construction-in-progress panel
// (onShowBuildProcess) with "Xong" (finishCreate / finishUpgrade) and "Bỏ" (resetConstruction).

import { BuildMode, type BuildCost, type BuildExtInfo, type BuildProcess } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { button, el } from './guildState';
import './guild.css';

export interface BuildActions {
  construct(bid: number, tid: number, mode: number): void;
  finish(bid: number, create: boolean): void;
  reset(bid: number): void;
}

const LABELS: [keyof BuildCost, string][] = [
  ['money', 'Tiền bang hội'], ['exp', 'Kinh nghiệm bang hội'], ['gen', 'Nguyên liệu thường'], ['rare', 'Vật liệu hiếm'], ['sp', 'Vật liệu đặc biệt'],
];

let open: { root: HTMLElement; dispose: () => void } | null = null;

export function closeBuildDialog(): void {
  open?.dispose();
  open = null;
}

function frame(title: string): { root: HTMLElement; body: HTMLElement } {
  closeBuildDialog();
  const root = el('div', 'guild-panel guild-build');
  const header = el('div', 'guild-header');
  header.appendChild(el('div', 'guild-title', title));
  const x = el('button', 'guild-close', '×');
  x.onclick = closeBuildDialog;
  header.appendChild(x);
  const body = el('div', 'guild-body');
  root.append(header, body);
  stageEl().appendChild(root);
  const offs = [makeDraggable(root, header, 'guildBuildDialog'), closeOnEscape(closeBuildDialog)];
  open = { root, dispose: () => { for (const off of offs) off(); root.remove(); } };
  return { root, body };
}

function costLines(cost: BuildCost, have?: BuildCost): HTMLElement {
  const box = el('div', 'gbuild-cost');
  for (const [k, label] of LABELS) {
    if (cost[k] <= 0) continue;
    const line = el('div', `gbuild-line${have && have[k] < cost[k] ? ' short' : ''}`, `${label}: ${cost[k]}${have ? ` / ${have[k]}` : ''}`);
    line.dataset.res = k;
    box.appendChild(line);
  }
  return box;
}

export function openExtInfo(info: BuildExtInfo, actions: BuildActions): void {
  const { body } = frame(info.mode === BuildMode.CREATE ? 'Xây dựng công trình' : `Thăng cấp: ${info.title}`);
  if (info.options.length === 0) body.appendChild(el('div', 'guild-note', info.mode === BuildMode.CREATE ? 'Không có danh sách công trình có thể xây dựng' : 'Không có danh sách công trình có thể thăng cấp'));
  for (const o of info.options) {
    const card = el('div', 'gbuild-card');
    card.dataset.tid = String(o.tid);
    card.appendChild(el('div', 'c-name', o.name));
    if (o.description) card.appendChild(el('div', 'guild-note dim', o.description));
    card.appendChild(costLines(o.cost));
    if (o.pre.length > 0) {
      const pre = el('div', 'gbuild-pre');
      pre.appendChild(el('span', 'dim', 'Yêu cầu: '));
      for (const p of o.pre) pre.appendChild(el('span', p.ok ? 'gbuild-ok' : 'gbuild-bad', `${p.name}  `));
      card.appendChild(pre);
    }
    const label = info.mode === BuildMode.CREATE ? 'Xây' : 'Thăng cấp';
    const b = button(label, () => askConfirm('Xác nhận xây dựng?', () => {
      actions.construct(info.bid, o.tid, info.mode);
      closeBuildDialog();
    }), !o.canBuild);
    b.classList.add('gbuild-go');
    card.appendChild(b);
    body.appendChild(card);
  }
}

export function openProcess(p: BuildProcess, actions: BuildActions): void {
  const { body } = frame('Tiến độ công trình');
  body.appendChild(el('div', 'c-name', `${p.create ? 'Đang xây' : 'Đang thăng cấp'}: ${p.name}`));
  if (p.description) body.appendChild(el('div', 'guild-note dim', p.description));
  body.appendChild(costLines(p.cost, p.have));
  const bar = el('div', 'guild-bar');
  const done = button('Xong', () => {
    actions.finish(p.bid, p.create);
    closeBuildDialog();
  }, !p.ready);
  done.classList.add('gbuild-finish');
  const drop = button('Bỏ', () => askConfirm('Xác nhận hủy xây?', () => {
    actions.reset(p.bid);
    closeBuildDialog();
  }));
  drop.classList.add('gbuild-reset');
  bar.append(done, drop, button('Đóng', closeBuildDialog));
  body.appendChild(bar);
}
