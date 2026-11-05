// Quỷ Hút Máu (map 69) scene steps (Go application/dungeon quyhutmau_defs.go): the mosquito fights gated by their step quest,
// the two seals after their guard, the legion revealed by the king and the Cổng Lạc Viên portal revealed by the legion. Pure.

export const QHM = {
  KEY: 'quyhutmau',
  MAP: 69,
  LAND_X: 410,
  LAND_Y: 280,
} as const;

export type QhmKind = 'fight' | 'seal' | 'portal';

export interface QhmStep {
  npc: number;
  kind: QhmKind;
  quest: number; // step quest that must be active (0 = none)
  needs: number; // guard that must be beaten first (seals)
  appear: number; // NPC whose defeat reveals this step (0 = always)
  item: number; // seal item
  x: number;
  y: number;
}

const step = (npc: number, kind: QhmKind, x: number, y: number, p: Partial<QhmStep> = {}): QhmStep => ({
  npc, kind, quest: 0, needs: 0, appear: 0, item: 0, x, y, ...p,
});

export const QHM_STEPS: readonly QhmStep[] = [
  step(1732, 'fight', 640, 260, { quest: 5448 }),
  step(1733, 'fight', 880, 260, { quest: 5448 }),
  step(1734, 'fight', 1170, 300, { quest: 5448 }),
  step(1735, 'fight', 1330, 370, { quest: 5448 }),
  step(1736, 'fight', 450, 700, { quest: 5449 }),
  step(1738, 'seal', 400, 630, { quest: 5449, needs: 1736, item: 3440 }),
  step(1737, 'fight', 720, 1430, { quest: 5450 }),
  step(1739, 'seal', 740, 1330, { quest: 5450, needs: 1737, item: 3441 }),
  step(1740, 'fight', 1400, 1385, { quest: 5451 }),
  step(1741, 'fight', 2050, 1050, { quest: 5452, appear: 1740 }),
  step(1743, 'portal', 1550, 1030, { appear: 1741 }),
];

export const qhmStep = (npc: number): QhmStep | undefined => QHM_STEPS.find((s) => s.npc === npc);

/** Steps the run shows: revealed ones, minus beaten fights / opened seals (the portal stays). */
export function qhmVisible(beaten: readonly number[]): QhmStep[] {
  return QHM_STEPS.filter((s) => (s.appear <= 0 || beaten.includes(s.appear)) && (s.kind === 'portal' || !beaten.includes(s.npc)));
}

export const qhmRevealedBy = (npc: number): QhmStep[] => QHM_STEPS.filter((s) => s.appear === npc);
