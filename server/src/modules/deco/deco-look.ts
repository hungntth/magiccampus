// Hồn Khí look of a character (pure): the equipped, visible shows of the four positions as art codes for the look tier the hole level allows.
// Feeds AvatarView.deco (scene / login) and the onDeco{Head,Light,Foot,Bottom}On pushes.

import { DECO_POSITIONS, decoMaxShowLvl, decoShowArt, type DecoLook, type DecoShowRow } from '@mc/shared';
import { holeLevel, type DecoState } from './deco-state';
import type { HoleOf } from './deco-rules';

/** Look of one position, or null when nothing is equipped, hidden, or the show has no art. */
export function positionLook(
  state: DecoState, position: number, holeOf: HoleOf, showOf: (id: number) => DecoShowRow | undefined,
): DecoLook | null {
  const p = state.pos[String(position)];
  if (!p || p.did <= 0 || p.isShow !== 1) return null;
  const show = showOf(p.did);
  if (!show || show.position !== position) return null;
  const [res, mask] = decoShowArt(show, Math.min(p.showLvl, decoMaxShowLvl(holeLevel(p, holeOf))));
  return res === '0' && mask === '0' ? null : { pos: position, res, mask };
}

export function decoLooks(state: DecoState, holeOf: HoleOf, showOf: (id: number) => DecoShowRow | undefined): DecoLook[] {
  const out: DecoLook[] = [];
  for (const p of DECO_POSITIONS) {
    const look = positionLook(state, p, holeOf, showOf);
    if (look) out.push(look);
  }
  return out;
}
