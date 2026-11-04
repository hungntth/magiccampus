// Pure geometry of the map follow pet (legacy PetView.followHandler / DynamicItemContainer.setPetPos): where it spawns
// behind its owner and how it closes in once the owner is further than GROUP_PET_FOLLOW_DISTANCE.

export const PET_FOLLOW_DISTANCE = 100; // GamePredef.GROUP_PET_FOLLOW_DISTANCE
export const PET_SPEED = 240; // px/s, slightly above the walking speed (220) so the pet never falls behind

export interface Point {
  x: number;
  y: number;
}

/** Unit vector of a facing 0..7 (0 = south, counter-clockwise on screen, as `dirFromDelta`). */
export function dirVector(dir: number): Point {
  const a = Math.PI / 2 - (((dir % 8) + 8) % 8) * (Math.PI / 4);
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Spawn point: PET_FOLLOW_DISTANCE behind the owner, opposite to its facing. */
export function petSpawnPos(owner: Point, dir: number): Point {
  const v = dirVector(dir);
  return { x: owner.x - v.x * PET_FOLLOW_DISTANCE, y: owner.y - v.y * PET_FOLLOW_DISTANCE };
}

/**
 * One follow step: no move while within `PET_FOLLOW_DISTANCE` of the owner, otherwise advance toward the owner by
 * `speed * dt` without crossing the follow radius.
 */
export function petFollowStep(pet: Point, owner: Point, dt: number, speed = PET_SPEED): { x: number; y: number; moved: boolean } {
  const dx = owner.x - pet.x;
  const dy = owner.y - pet.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= PET_FOLLOW_DISTANCE) return { x: pet.x, y: pet.y, moved: false };
  const step = Math.min(speed * dt, dist - PET_FOLLOW_DISTANCE);
  return { x: pet.x + (dx / dist) * step, y: pet.y + (dy / dist) * step, moved: step > 0 };
}
