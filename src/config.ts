/** Tunable balance values. Mirror of docs/gdd/03-scoring.md — keep in sync. */
export const CONFIG = {
  board: { w: 10, h: 10 },
  baseMines: 14,
  minesPerStage: 1,
  clicks: 20,
  hull: 3,
  moduleSlots: 5,

  /** Data for opening an empty (0) cell. */
  zeroData: 1,
  /** +Mult per consecutive safe turn. */
  comboMultStep: 0.25,
  /** +Mult per auto-opened cell in a cascade. */
  cascadeMultStep: 0.2,
  /** Data per correct flag, awarded at round end (not instantly — would leak mine positions). */
  flagRoundEndData: 10,

  baseTarget: 120,
  /** Target multiplier per sector. */
  sectorGrowth: 1.7,
  /** Target multiplier for stage within sector: standard / deep / boss. */
  stageTiers: [1, 1.5, 2],
  sectors: 8,

  bitsPerWin: 3,
  bitsPerClickLeft: 1,
} as const;

export function targetFor(stage: number): number {
  const sector = Math.floor(stage / 3);
  const tier = CONFIG.stageTiers[stage % 3];
  return Math.round((CONFIG.baseTarget * CONFIG.sectorGrowth ** sector * tier) / 10) * 10;
}

export function minesFor(stage: number): number {
  return CONFIG.baseMines + stage * CONFIG.minesPerStage + (stage % 3 === 1 ? 3 : 0);
}
