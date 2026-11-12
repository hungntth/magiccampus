// Pure geometry of the guarding Tiểu Tinh Linh on the map (legacy FairyView.follow): it hovers on its owner's foot point, lags
// behind while the owner walks and closes in faster the further away it is; it faces its travel direction while catching up and the
// owner's facing once near. Depth (FairyView.stopMove): drawn in front of the owner for facings 0..3, behind it for 4..7.

import type { Point } from './petFollow';

/** Minimum catch-up speed in px/s; the speed grows with the distance (FAIRY_CATCH_RATE per second). */
export const FAIRY_MIN_SPEED = 160;
export const FAIRY_CATCH_RATE = 4;
/** Below this distance the fairy takes its owner's facing (FairyView: 10 px). */
export const FAIRY_FACE_OWNER_DIST = 10;

/** One follow step toward `target` (the owner's foot point, lifted while flying). */
export function fairyFollowStep(at: Point, target: Point, dt: number): { x: number; y: number; dist: number } {
  const dx = target.x - at.x;
  const dy = target.y - at.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return { x: target.x, y: target.y, dist: 0 };
  const step = Math.min(dist, Math.max(FAIRY_MIN_SPEED, dist * FAIRY_CATCH_RATE) * dt);
  return { x: at.x + (dx / dist) * step, y: at.y + (dy / dist) * step, dist: dist - step };
}

/** True when the fairy is drawn in front of its owner (owner facing 0..3). */
export const fairyInFront = (ownerDir: number): boolean => (((ownerDir % 8) + 8) % 8) < 4;
