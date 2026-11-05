// Push helpers for scripted NPC content (Go handlers/npc sendList / npcMsg / midNote / systemSay): onList(npcId, title, info,
// options), onNpcMsg(npcId, text), onMidNote(text) and onSystemSay(text). Pure wrappers over session.callback.

import type { NpcMenuOption, OnListArgs } from '@mc/shared';
import type { Session } from '../../gateway/session';

export function sendList(session: Session, npcId: number, title: string, info: string, options: NpcMenuOption[]): void {
  const args: OnListArgs = [npcId, title, info, options];
  session.callback('onList', ...args);
}

export function npcMsg(session: Session, npcId: number, text: string): void {
  session.callback('onNpcMsg', npcId, text);
}

export function midNote(session: Session, text: string): void {
  session.callback('onMidNote', text);
}

export function systemSay(session: Session, text: string): void {
  session.callback('onSystemSay', text);
}

/** onMidNote + onSystemSay (Go warns a dungeon run's time this way). */
export function notice(session: Session, text: string): void {
  midNote(session, text);
  systemSay(session, text);
}
