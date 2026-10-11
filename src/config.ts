/** Tunable balance values. Mirror of docs/gdd/03-scoring.md — keep in sync. */
export const CONFIG = {
  board: { w: 10, h: 10 },
  baseMines: 10,
  minesPerStage: 1,
  clicks: 25,
  hull: 1,
  moduleSlots: 5,
  consumableSlots: 3,
  rerollBaseCost: 3,

  /** Data for opening an empty (0) cell. */
  zeroData: 3,
  /** +Mult per consecutive safe turn. */
  comboMultStep: 0.25,
  /** +Mult per cascade chain step (BFS layer), not per cell. */
  cascadeMultStep: 0.25,
  /** Data per correct flag, awarded at round end (not instantly — would leak mine positions). */
  flagRoundEndData: 10,
  /** Cashout Lever base data per flagged mine. */
  cashoutBaseDataPerFlag: 40,

  baseTarget: 450,
  /** Target multiplier per sector. */
  sectorGrowth: 1.5,
  /** Target multiplier for stage within sector: standard / deep / boss. */
  stageTiers: [1, 1.35, 1.7],
  sectors: 8,

  bitsPerWin: 3,
  bitsPerClickLeft: 1,
  /** +1 Bit for every this fraction of target scored above it (overcharge). */
  overchargeBitStep: 0.5,
  /** Pause before auto-advancing to the next stage, ms. */
  stageTransitionMs: 1400,
} as const;

export function cashoutMultiplier(flags: number): number {
  if (flags <= 0) return 1.0;
  if (flags <= 5) return 1.0 + flags * 0.5;
  return 3.5 + (flags - 5) * 1.0;
}

export function cashoutScore(flags: number, combo = 0): number {
  if (flags <= 0) return 0;
  const mult = cashoutMultiplier(flags);
  const baseData = flags * CONFIG.cashoutBaseDataPerFlag;
  const comboBonus = 1 + combo * 0.15;
  return Math.round(baseData * mult * comboBonus);
}

export function targetFor(stage: number): number {
  const sector = Math.floor(stage / 3);
  const tier = CONFIG.stageTiers[stage % 3];
  return Math.round((CONFIG.baseTarget * CONFIG.sectorGrowth ** sector * tier) / 10) * 10;
}

export function minesFor(stage: number): number {
  return CONFIG.baseMines + stage * CONFIG.minesPerStage;
}
