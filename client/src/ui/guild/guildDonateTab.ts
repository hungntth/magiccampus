// "Quyên góp" tab: donate silver (multiples of 1000) / gold with the client preview formulas, donate bag materials, and the
// guild's donated material stock. Bank and skill tabs are placeholders for phase B (see guildPanel.ts).

import { GuildLimits, ItemKind, GuildMaterial, donateContribOf, donateMoneyOf, materialGrant } from '@mc/shared';
import { toast } from '../screens';
import { button, el, field, type GuildCtx } from './guildState';

const STOCK_NAME: Record<number, string> = {
  [GuildMaterial.GENERAL]: 'Nguyên liệu thường bang hội', [GuildMaterial.RARE]: 'Vật liệu bang hội hiếm',
  [GuildMaterial.SPECIAL]: 'Vật liệu bang hội đặc biệt',
};

export function renderDonateTab(ctx: GuildCtx): HTMLElement {
  const { state, actions, player } = ctx;
  const root = el('div', 'guild-tab');
  if (!state.myGuild || !state.isMember()) {
    root.appendChild(el('div', 'guild-note', 'Bạn chưa vào bang!'));
    return root;
  }
  root.appendChild(el('div', 'guild-sub', `Bạc: ${player.money}   Vàng: ${player.gold}`));
  const bar = el('div', 'guild-bar');
  const silver = field('Bạc (bội số của 1000)', 10);
  silver.className += ' donate-silver';
  const gold = field('Vàng', 6);
  gold.className += ' donate-gold';
  const preview = el('div', 'guild-note dim');
  const values = (): { s: number; g: number } => ({ s: Number(silver.value || 0), g: Number(gold.value || 0) });
  const refresh = (): void => {
    const { s, g } = values();
    preview.textContent = `Bạn sẽ nhận được ${donateContribOf(s, g)} điểm quyên góp. Bang hội sẽ nhận được ${donateMoneyOf(s, g)} tiền bang và ${donateContribOf(s, g)} kinh nghiệm bang.`;
  };
  silver.oninput = refresh;
  gold.oninput = refresh;
  refresh();
  bar.append(silver, gold, button('Quyên góp', () => {
    const { s, g } = values();
    if (!Number.isInteger(s) || !Number.isInteger(g) || s < 0 || g < 0 || s + g === 0) return;
    if (s % GuildLimits.MONEY_STEP !== 0) return toast('Số bạc quyên góp phải là bội số của 1000', true);
    actions.donateMoney(s, g);
  }));
  root.append(bar, preview);

  root.appendChild(el('div', 'guild-sub', 'Quyên góp nguyên liệu (trong túi đồ)'));
  const mats = el('div', 'guild-list guild-mats');
  const items = ctx.bagItems().filter((it) => it.itemType === ItemKind.ITEM && materialGrant(it.tid, it.color, 1) !== null);
  if (items.length === 0) mats.appendChild(el('div', 'guild-empty', 'Không có nguyên liệu phù hợp'));
  for (const it of items) {
    const row = el('div', 'guild-row mat');
    row.dataset.tid = String(it.tid);
    const num = field('SL', 5, String(it.stackNum));
    row.append(el('span', 'c-name', `${it.name} x${it.stackNum}`), num, button('Quyên góp', () => {
      const n = Number(num.value);
      if (Number.isInteger(n) && n > 0) actions.donateMaterial(it, Math.min(n, it.stackNum));
    }));
    mats.appendChild(row);
  }
  root.appendChild(mats);

  root.appendChild(el('div', 'guild-sub', 'Kho vật liệu bang hội'));
  const stock = el('div', 'guild-note dim');
  stock.textContent = state.bankStock.length === 0 ? 'Trống' : state.bankStock.map((s) => `${STOCK_NAME[s.tid] ?? `#${s.tid}`}: ${s.count}`).join(' | ');
  root.appendChild(stock);
  return root;
}
