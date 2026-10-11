import type { Cell } from './board';
import type { TurnContext } from './types';

export class BehaviorTracker {
  /** Number of consecutive blind clicks (with 0 revealed neighbors) */
  blindClicks = 0;
  /** Active state of "Отвага и слабоумие" bonus mode */
  daredevilActive = false;

  /** Fast click streak count (consecutive cell reveals with <1000ms gap) */
  fastClicks = 0;
  /** Active state of "Не уследить" speed demon bonus mode */
  speedDemonActive = false;
  /** Timestamp of the last cell reveal */
  lastRevealTime = 0;
  /** Inactivity timer to reset speed mode when player slows down */
  private speedDemonTimer?: ReturnType<typeof setTimeout>;

  /** Anti-cheat telemetry */
  blindFlagsCount = 0;
  private lastFlagToggleTime = 0;
  private rapidBlindFlagStreak = 0;
  cheaterDetected = false;

  constructor(private onChange: () => void) {}

  /** Called when a cell is revealed */
  onCellReveal(_cell: Cell, wasBlind: boolean, ctx: TurnContext): void {
    if (wasBlind) {
      this.blindClicks++;
      if (this.daredevilActive) {
        ctx.xMult *= 10;
        ctx.callouts.unshift('🤩 «ОТВАГА И СЛАБОУМИЕ» ×10!');
      } else if (this.blindClicks >= 5) {
        this.daredevilActive = true;
        ctx.xMult *= 10;
        ctx.callouts.unshift('🤩 «ОТВАГА И СЛАБОУМИЕ» ВКЛЮЧЕНО! ×10 ОЧКОВ!');
      } else {
        ctx.callouts.push(`🎲 НАУГАД: ${this.blindClicks}/5`);
      }
    } else {
      if (this.daredevilActive) {
        ctx.callouts.push('😌 РАСЧЁТЛИВЫЙ КЛИК: РЕЖИМ СБРОШЕН');
      }
      this.blindClicks = 0;
      this.daredevilActive = false;
    }

    this.checkSpeedStreak(ctx, false);
  }

  /** Called when a chord action is executed */
  onChord(): void {
    if (this.daredevilActive) {
      this.daredevilActive = false;
    }
    this.blindClicks = 0;
  }

  /** Called when mine explosion occurs */
  onMineHit(ctx?: TurnContext): void {
    this.blindClicks = 0;
    this.daredevilActive = false;
    if (ctx) {
      this.checkSpeedStreak(ctx, true);
    } else {
      this.resetSpeedStreak();
    }
  }

  /** Analyzes flag placement timing & fog-of-war context to detect blind guessing */
  onFlagPlaced(hasRevealedNeighbor: boolean, flagsRemaining: number): void {
    const now = performance.now();
    const timeSinceLast = this.lastFlagToggleTime > 0 ? now - this.lastFlagToggleTime : Infinity;
    this.lastFlagToggleTime = now;

    if (!hasRevealedNeighbor) {
      this.blindFlagsCount++;
      if (timeSinceLast < 650) {
        this.rapidBlindFlagStreak++;
      } else {
        this.rapidBlindFlagStreak = 1;
      }

      // Suspicious heuristics:
      // 1) Guessing the final 1-2 flags blind without revealed neighbors
      // 2) Placing 2+ blind flags without clues throughout the stage
      // 3) Rapidly spamming flags across unopened cells
      if (flagsRemaining <= 2 || this.blindFlagsCount >= 2 || this.rapidBlindFlagStreak >= 3) {
        this.cheaterDetected = true;
      }
    } else {
      this.rapidBlindFlagStreak = 0;
    }
  }

  checkSpeedStreak(ctx: TurnContext, isDetonation: boolean): void {
    if (this.speedDemonTimer) {
      clearTimeout(this.speedDemonTimer);
      this.speedDemonTimer = undefined;
    }

    if (isDetonation) {
      this.resetSpeedStreak();
      return;
    }

    const now = performance.now();
    const delta = this.lastRevealTime > 0 ? now - this.lastRevealTime : Infinity;
    this.lastRevealTime = now;

    if (delta < 1000) {
      this.fastClicks++;
      if (this.speedDemonActive) {
        ctx.xMult *= 3;
        ctx.callouts.unshift('🚀 «НЕ УСЛЕДИТЬ» ×3!');
      } else if (this.fastClicks >= 3) {
        this.speedDemonActive = true;
        ctx.xMult *= 3;
        ctx.callouts.unshift('🚀 «НЕ УСЛЕДИТЬ» ВКЛЮЧЕНО! ×3 БОНУС!');
      } else {
        ctx.callouts.push(`⚡ СКОРОСТЬ: ${this.fastClicks}/3`);
      }
    } else {
      if (this.speedDemonActive) {
        this.speedDemonActive = false;
        ctx.callouts.push('🐢 ЗАМЕДЛЕНИЕ: РЕЖИМ СБРОШЕН');
      }
      this.fastClicks = 0;
    }

    if (this.speedDemonActive || this.fastClicks > 0) {
      this.speedDemonTimer = setTimeout(() => {
        if (this.speedDemonActive || this.fastClicks > 0) {
          this.speedDemonActive = false;
          this.fastClicks = 0;
          this.lastRevealTime = 0;
          this.onChange();
        }
      }, 1020);
    }
  }

  resetSpeedStreak(): void {
    if (this.speedDemonTimer) {
      clearTimeout(this.speedDemonTimer);
      this.speedDemonTimer = undefined;
    }
    this.fastClicks = 0;
    this.speedDemonActive = false;
    this.lastRevealTime = 0;
  }

  /** Resets state between sectors */
  resetRound(): void {
    this.resetSpeedStreak();
    this.blindClicks = 0;
    this.daredevilActive = false;
    this.blindFlagsCount = 0;
    this.lastFlagToggleTime = 0;
    this.rapidBlindFlagStreak = 0;
    this.cheaterDetected = false;
  }
}
