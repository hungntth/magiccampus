// HUD team tiles (legacy GroupInfoCanvas + GroupMemberCanvas): a vertical list under the portraits, one tile per party member
// with portrait, name, level, a crown for the leader and an AFK tint. There are no HP/MP bars (the legacy tiles have none).
// Clicking a tile reports the member and pointer position; the caller decides the menu.

import { iconUrl } from '../../assets';
import type { GroupMember } from '@mc/shared';
import { div } from './skin';

export type TileClick = (member: GroupMember, clientX: number, clientY: number) => void;

export class TeamBar {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, private readonly onTile: TileClick) {
    this.root = div('team-bar', parent);
    this.root.hidden = true;
  }

  /** Rebuilds the tiles from the party snapshot (leader first); an empty list hides the bar. */
  render(members: GroupMember[], selfId: number): void {
    this.root.replaceChildren();
    this.root.hidden = members.length === 0;
    for (const m of members) {
      const tile = div(`team-tile${m.afk ? ' afk' : ''}${m.cid === selfId ? ' self' : ''}`, this.root);
      tile.dataset.cid = String(m.cid);
      tile.title = `${m.name} - Cấp ${m.level} - map ${m.mapId}${m.afk ? ' (tạm rời)' : ''}`;
      const head = document.createElement('img');
      head.className = 'team-head';
      head.alt = '';
      head.src = iconUrl(m.iconCode);
      tile.appendChild(head);
      div('team-name', tile, `${m.isLeader ? '♛ ' : ''}${m.name}`);
      div('team-level', tile, `Lv${m.level}`);
      if (m.afk) div('team-afk', tile, 'AFK');
      tile.onclick = (e) => this.onTile(m, e.clientX, e.clientY);
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
