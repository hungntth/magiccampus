// "Kỹ năng" tab: the guild skill catalog (data_tbl_skill use_env 4). Per chain: the level the guild developed, the level the
// player learned, and the next-level cost. The leader opens the next level with guild exp + money (developSkill); members learn
// it with contribution up to the developed level (addGuildSkill / improveGuildSkill). The server validates every rule.

import { GUILD_SKILL, type GuildSkillCatalogEntry } from '@mc/shared';
import { iconUrl } from '../../assets';
import { button, el, type GuildCtx } from './guildState';

export function renderSkillsTab(ctx: GuildCtx): HTMLElement {
  const { state } = ctx;
  const root = el('div', 'guild-tab');
  const g = state.myGuild;
  if (!g || !state.isMember()) {
    root.appendChild(el('div', 'guild-note', 'Bạn chưa vào bang!'));
    return root;
  }
  const s = state.skillState;
  if (!s) {
    root.appendChild(el('div', 'guild-note dim', 'Đang tải kỹ năng bang...'));
    return root;
  }
  const me = state.me();
  const contrib = me ? me.normalContrib + me.donateContrib : 0;
  root.appendChild(el('div', 'guild-sub', `Cấp bang: ${g.level}   Kinh nghiệm: ${g.exp}   Tiền bang: ${g.money}   Cống hiến của bạn: ${contrib}`));
  const list = el('div', 'guild-list gskill-list');
  for (const entry of s.catalog) list.appendChild(row(ctx, entry, levelOf(entry, s.skillDevData), levelOf(entry, s.learned), contrib));
  root.appendChild(list);
  return root;
}

/** Highest level of a chain present in a `{templateId: level}` map. */
function levelOf(entry: GuildSkillCatalogEntry, map: Record<string, number>): number {
  let best = 0;
  for (const l of entry.levels) best = Math.max(best, map[String(l.sid)] === undefined ? 0 : l.level);
  return best;
}

function row(ctx: GuildCtx, entry: GuildSkillCatalogEntry, dev: number, learned: number, contrib: number): HTMLElement {
  const { state, estate } = ctx;
  const r = el('div', 'guild-row gskill');
  r.dataset.chain = entry.chain;
  if (entry.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(entry.iconCode);
    img.className = 'gskill-icon';
    img.onerror = () => img.remove();
    r.appendChild(img);
  }
  const nextDev = entry.levels.find((l) => l.level === dev + 1);
  const nextLearn = entry.levels.find((l) => l.level === learned + 1);
  const info = el('div', 'gskill-info');
  info.appendChild(el('div', 'c-name', `${entry.name}  (bang Lv ${dev}/${GUILD_SKILL.MAX_LEVEL} | bạn Lv ${learned})`));
  const cur = entry.levels.find((l) => l.level === Math.max(dev, 1));
  if (cur) info.appendChild(el('div', 'guild-note dim', cur.description));
  const costs: string[] = [];
  if (state.isLeader() && nextDev) costs.push(`Mở Lv ${nextDev.level}: ${nextDev.devExp} kinh nghiệm + ${nextDev.devMoney} tiền bang`);
  if (nextLearn && nextLearn.level <= dev) costs.push(`Học Lv ${nextLearn.level}: ${nextLearn.contrib} cống hiến${contrib < nextLearn.contrib ? ' (chưa đủ)' : ''}`);
  if (costs.length) info.appendChild(el('div', 'guild-note dim', costs.join(' | ')));
  r.appendChild(info);
  if (state.isLeader() && nextDev && dev < state.myGuild!.level) {
    const b = button(`Mở Lv ${nextDev.level}`, () => estate.develop(nextDev.sid));
    b.classList.add('gskill-dev');
    r.appendChild(b);
  }
  if (nextLearn && nextLearn.level <= dev) {
    const b = button(learned === 0 ? 'Học' : `Nâng Lv ${nextLearn.level}`, () => estate.learn(nextLearn.sid), contrib < nextLearn.contrib);
    b.classList.add('gskill-learn');
    r.appendChild(b);
  }
  return r;
}
