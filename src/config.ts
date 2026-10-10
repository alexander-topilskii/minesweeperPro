/** Tunable balance values. Mirror of docs/gdd/03-scoring.md — keep in sync. */
export const CONFIG = {
  board: { w: 10, h: 10 },
  baseMines: 15,
  minesPerStage: 1,
  clicks: 20,
  hull: 3,
  moduleSlots: 5,

  /** Data for opening an empty (0) cell. */
  zeroData: 1,
  /** +Mult per consecutive safe turn. */
  comboMultStep: 0.25,
  /** +Mult per cascade chain step (BFS layer), not per cell. */
  cascadeMultStep: 0.2,
  /** Data per correct flag, awarded at round end (not instantly — would leak mine positions). */
  flagRoundEndData: 10,

  baseTarget: 600,
  /** Target multiplier per sector. */
  sectorGrowth: 1.6,
  /** Target multiplier for stage within sector: standard / deep / boss. */
  stageTiers: [1, 1.4, 1.8],
  sectors: 8,

  bitsPerWin: 3,
  bitsPerClickLeft: 1,
  /** +1 Bit for every this fraction of target scored above it (overcharge). */
  overchargeBitStep: 0.5,
  /** Pause before auto-advancing to the next stage, ms. */
  stageTransitionMs: 1400,
} as const;

export function targetFor(stage: number): number {
  const sector = Math.floor(stage / 3);
  const tier = CONFIG.stageTiers[stage % 3];
  return Math.round((CONFIG.baseTarget * CONFIG.sectorGrowth ** sector * tier) / 10) * 10;
}

export function minesFor(stage: number): number {
  return CONFIG.baseMines + stage * CONFIG.minesPerStage + (stage % 3 === 1 ? 3 : 0);
}
