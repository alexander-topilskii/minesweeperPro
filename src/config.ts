/** Tunable balance values. Mirror of docs/gdd/03-scoring.md — keep in sync. */
export const CONFIG = {
  board: { w: 10, h: 10 },
  baseMines: 10,
  minesPerStage: 1,
  clicks: 45,
  bossClicks: 70,
  hull: 2,
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

  baseTarget: 380,
  /** Target multiplier per sector. */
  sectorGrowth: 1.55,
  sectors: 8,

  bitsPerWin: 3,
  /** +1 Bit for every this fraction of target scored above it (overcharge). */
  overchargeBitStep: 0.5,
  /** Pause before auto-advancing to the next stage, ms. */
  stageTransitionMs: 1400,
} as const;

/**
 * Calculates Bits rewarded upon stage victory:
 * Base bits (3) + battery efficiency bonus (up to +3) + Overcharge levels + encounter bonus.
 */
export function calcBitsReward(clicksLeft: number, overchargeLvl: number, encounterType?: string): number {
  const base = CONFIG.bitsPerWin;
  const batteryBonus = Math.min(3, Math.floor(Math.max(0, clicksLeft) / 10));
  let total = base + batteryBonus + Math.max(0, overchargeLvl);
  if (encounterType === 'elite') total += 3;
  if (encounterType === 'boss') total += 5;
  return total;
}

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
  const act = Math.floor(stage / 8); // 0 for Act 1, 1 for Act 2, 2 for Act 3
  const floor = stage % 8; // 0..7

  // Act 1: 380 base (Act 1 boss at floor 7 is ~740 pts with 1.3 boss multiplier)
  // Act 2: 14x14 arenas, but relaxed targets (420..550 pts, less than Act 1 boss!)
  let base: number = CONFIG.baseTarget;
  let floorStep = 0.07;
  if (act === 1) {
    base = 420;
    floorStep = 0.045;
  } else if (act >= 2) {
    base = 560;
    floorStep = 0.05;
  }
  const floorProgress = 1 + floor * floorStep;
  return Math.round((base * floorProgress) / 10) * 10;
}

export function minesFor(stage: number): number {
  return CONFIG.baseMines + stage * CONFIG.minesPerStage;
}
