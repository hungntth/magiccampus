// HP / MP potion template id -> heal amount (PortraitCanvas.as:1101-1110 / :407-415), used to build the recover entries.

export const HP_POTION: Readonly<Record<number, number>> = {
  1: 300, 4: 600, 2: 600, 110: 1000, 113: 2000, 321: 3000, 371: 6000, 1975: 9000,
};
export const MP_POTION: Readonly<Record<number, number>> = {
  158: 300, 125: 600, 126: 1000, 127: 2000, 322: 3000, 370: 5000, 1974: 7000,
};
