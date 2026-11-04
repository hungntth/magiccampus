// Small helpers of the battle client: the -50 skill command entry, the end-of-battle toast text and the map tint.

import { ColorMatrixFilter, type Container } from 'pixi.js';
import { BattleAction, BattleResult, type BattleCommand, type LearnedSkill } from '@mc/shared';
import type { PlaybackEnd } from './playback';

export const skillCmd = (sk: LearnedSkill, tid: number): BattleCommand => ({ tid, action: BattleAction.SKILL, id: sk.sid, level: sk.level });

// Map brightness behind the battle: dimmed so the combatants stand out.
const DIM = 0.62;

/** BattleStage.as ColorTransform hue (normal: green 1.1, boss: red 1.1), scaled down by DIM. */
export function tintWorld(world: Container, boss: boolean): void {
  const f = new ColorMatrixFilter();
  const [r, g, b] = (boss ? [1.1, 1, 1] : [1, 1.1, 1]).map((c) => c * DIM);
  f.matrix = [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
  world.filters = [f];
}

export function reportText(end: PlaybackEnd): string {
  if (end.result === BattleResult.FLED) return 'Bỏ chạy thành công';
  if (end.result !== BattleResult.WIN) return 'Bạn đã bị đánh bại';
  const r = end.report;
  if (!r) return 'Chiến thắng!'; // PvP: nothing is granted, the server sends no report
  const parts = [`${r?.exp ?? 0} Exp`, `${r?.money ?? 0} Bạc khóa`, ...(r?.items ?? []).map((i) => `${i.name} x${i.count}`)];
  return `Chiến thắng! Nhận ${parts.join(', ')}`;
}
