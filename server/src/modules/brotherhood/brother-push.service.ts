// Brotherhood push helpers (Go handlers/brotherhood/pushes.go): onSystemSay lines, silver / gold wallet pushes, the group title
// suffix broadcast (onBrotherTitleUpdate to the owner's scene), title 153 grant + revoke and the IM list refresh. Stateless.

import { Injectable, Logger } from '@nestjs/common';
import { BROTHER, type BrotherTitleUpdate, type PlayerUpdate } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { RelationshipService } from '../social/relationship.service';
import { TitleService } from '../title/title.service';

export type WalletKey = 'money' | 'moneyBind' | 'gold';

@Injectable()
export class BrotherPush {
  private readonly logger = new Logger(BrotherPush.name);

  constructor(
    private readonly scenes: SceneManager,
    private readonly relations: RelationshipService,
    private readonly titles: TitleService,
  ) {}

  session(characterId: number): Session | undefined {
    return this.scenes.findByCharacter(characterId);
  }

  say(characterId: number, text: string): void {
    this.session(characterId)?.callback('onSystemSay', text);
  }

  sayAll(ids: readonly number[], text: string): void {
    for (const id of ids) this.say(id, text);
  }

  world(text: string): void {
    this.scenes.broadcastAll('onSystemSay', [text]);
  }

  /** `onAddMoney(cid, key, delta, total)` then `onUPP {key: total}` (the pair every H5 wallet change sends). */
  wallet(characterId: number, key: WalletKey, delta: number, total: number): void {
    const s = this.session(characterId);
    if (!s) return;
    s.callback('onAddMoney', characterId, key, delta, total);
    const update: PlayerUpdate = { [key]: total };
    s.callback('onUPP', update);
  }

  /** Fresh `onInitViewImC` for every online member (brother rows changed). */
  async refreshIm(ids: readonly number[]): Promise<void> {
    await Promise.all(ids.map((id) => this.relations.pushSnapshot(id).catch((e: Error) => this.logger.warn(`IM refresh ${id}: ${e.message}`))));
  }

  /** Group title suffix to the owner's scene (own client included); '' clears it. `enable` stays false (title is not forced). */
  broadcastTitle(characterId: number, tname: string): void {
    const s = this.session(characterId);
    if (!s) return;
    const payload: BrotherTitleUpdate = { cid: characterId, tname, enable: false };
    if (s.mapId > 0) this.scenes.broadcast(s.mapId, 'onBrotherTitleUpdate', [payload]);
    else s.callback('onBrotherTitleUpdate', payload);
  }

  /** Title 153 for every id (owned titles are left as they are) plus the suffix broadcast. */
  async grantTitle(ids: readonly number[], tname: string): Promise<void> {
    for (const id of ids) {
      try {
        await this.titles.grant(id, BROTHER.titleId);
      } catch (e) {
        this.logger.warn(`title ${BROTHER.titleId} grant failed for ${id}: ${(e as Error).message}`);
      }
      this.broadcastTitle(id, tname);
    }
  }

  /** Title 153 taken away (the TitleService push refreshes lists / active plates) and the suffix cleared. */
  async revokeTitle(ids: readonly number[]): Promise<void> {
    for (const id of ids) {
      try {
        await this.titles.revoke(id, BROTHER.titleId);
      } catch (e) {
        this.logger.warn(`title ${BROTHER.titleId} revoke failed for ${id}: ${(e as Error).message}`);
      }
      this.broadcastTitle(id, '');
    }
  }
}
